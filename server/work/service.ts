import type { Database } from 'bun:sqlite';
import type { CreateWorkTaskInput, WorkTask, WorkTaskPriority } from '../../shared/types';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AstParserService } from '../ast/service';
import { getAgent } from '../db/agents';
import { recordAudit } from '../db/audit';
import { getProject } from '../db/projects';
import { createSession } from '../db/sessions';
import {
  countQueuedTasks,
  createWorkTask,
  createWorkTaskAtomic,
  listWorkTasks as dbListWorkTasks,
  findActiveTasksForIssue,
  getActiveTaskForProject,
  getPendingTasksForProject,
  getWorkTask,
  pauseWorkTask,
  resetWorkTaskForRetry,
  resumePausedTask,
  updateWorkTaskStatus,
} from '../db/work-tasks';
import type { FlockConflictResolver } from '../flock-directory/conflict-resolver';
import { isRepoOffLimits } from '../github/off-limits';
import { searchOpenPrsForIssue } from '../github/operations';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { createWorktree } from '../lib/worktree';
import type { NotificationService } from '../notifications/service';
import type { ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { extractContentText } from '../process/types';
import type { ReputationScorer } from '../reputation/scorer';
import {
  escalateTier,
  inferModelTier,
  logEscalation,
  type ModelTier,
  modelForTier,
  StallDetector,
  serializeChainState,
} from './chain-continuation';
import { extractRelevantSymbols, generateRepoMap } from './repo-map';
import { checkReputationForWorkTask } from './reputation-guard';
import { type BuddyConfig, extractBuddyConfig, triggerBuddyReview } from './service-buddy';
import { drainRunningTasks as _drainRunningTasks, DRAIN_POLL_INTERVAL_MS } from './service-drain';
import { assessGovernanceImpact, buildWorkPrompt } from './service-prompt';
import {
  pruneStaleWorktrees as _pruneStaleWorktrees,
  recoverInterruptedTasks as _recoverInterruptedTasks,
  recoverStaleTasks as _recoverStaleTasks,
  type RecoveryContext,
} from './service-recovery';
import {
  cleanupWorktree as _cleanupWorktree,
  handleSessionEnd as _handleSessionEnd,
  type SessionLifecycleContext,
} from './session-lifecycle';
import { WorkTaskAttestation } from './task-attestation';
import { runBunInstall } from './validation';

const log = createLogger('WorkTaskService');

type CompletionCallback = (task: WorkTask) => void;
export type StatusChangeCallback = (task: WorkTask) => void;

export class WorkTaskService {
  private db: Database;
  private processManager: ProcessManager;
  private astParserService: AstParserService | null;
  private agentMessenger: AgentMessenger | null = null;
  private notificationService: NotificationService | null = null;
  private conflictResolver: FlockConflictResolver | null = null;
  private completionCallbacks: Map<string, Set<CompletionCallback>> = new Map();
  private statusChangeCallbacks: Map<string, Set<StatusChangeCallback>> = new Map();
  private _shuttingDown = false;

  /**
   * In-memory priority tracking. Priority is not yet persisted to DB
   * (requires a Layer 0 schema migration). Maps taskId → priority.
   */
  private priorityMap = new Map<string, WorkTaskPriority>();

  /**
   * In-memory preemption tracking. Maps paused taskId → preempting taskId.
   */
  private preemptionMap = new Map<string, string>();

  /**
   * In-memory model tier overrides. Maps taskId → ModelTier.
   * Used when a task is created with an explicit tier (e.g. via escalation).
   * Not persisted — server restart falls back to agent's default model.
   */
  private tierMap = new Map<string, ModelTier>();

  /** Stall detector — tracks per-session consecutive non-tool turns. */
  private readonly stallDetector = new StallDetector();

  /**
   * In-memory claim tracking. Maps projectId → claimId.
   * Used to release flock claims when tasks complete.
   */
  private _activeClaimMap = new Map<string, string>();

  /** On-chain attestation publisher for work task outcomes. */
  private _attestation: WorkTaskAttestation;

  /** Interval handle for periodic stale worktree cleanup. */
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /** True when the service is draining — no new tasks accepted. */
  get shuttingDown(): boolean {
    return this._shuttingDown;
  }

  constructor(db: Database, processManager: ProcessManager, astParserService?: AstParserService) {
    this.db = db;
    this.processManager = processManager;
    this.astParserService = astParserService ?? null;
    this._attestation = new WorkTaskAttestation(db);
  }

  /** Set the agent messenger (set after async AlgoChat init). */
  setAgentMessenger(messenger: AgentMessenger): void {
    this.agentMessenger = messenger;
  }

  /** Set the notification service (injected after bootstrap). */
  setNotificationService(service: NotificationService): void {
    this.notificationService = service;
  }

  /** Set the flock conflict resolver (set after flock directory init). */
  setConflictResolver(resolver: FlockConflictResolver): void {
    this.conflictResolver = resolver;
  }

  /** Buddy service — set after bootstrap. */
  private _buddyService: import('../buddy/service').BuddyService | null = null;

  /** Per-task buddy config. Maps taskId → buddy config. */
  private _buddyConfigMap = new Map<string, BuddyConfig>();

  setBuddyService(buddyService: import('../buddy/service').BuddyService): void {
    this._buddyService = buddyService;
  }

  /** Reputation scorer — set after bootstrap init. Used to gate work task creation. */
  private _reputationScorer: ReputationScorer | null = null;

  setReputationScorer(scorer: ReputationScorer): void {
    this._reputationScorer = scorer;
  }

  /** TaskQueueService reference — set by bootstrap after both are created. */
  private _taskQueueService: {
    getQueueStatus(): {
      activeCount: number;
      pendingCount: number;
      maxConcurrency: number;
      activeByProject: Record<string, string>;
    };
  } | null = null;

  setTaskQueueService(queue: {
    getQueueStatus(): {
      activeCount: number;
      pendingCount: number;
      maxConcurrency: number;
      activeByProject: Record<string, string>;
    };
  }): void {
    this._taskQueueService = queue;
  }

  getQueueStatus(): {
    activeCount: number;
    pendingCount: number;
    maxConcurrency: number;
    activeByProject: Record<string, string>;
  } | null {
    return this._taskQueueService?.getQueueStatus() ?? null;
  }

  /** Get the in-memory priority for a task (defaults to P2). */
  private getTaskPriority(taskId: string): WorkTaskPriority {
    return this.priorityMap.get(taskId) ?? 2;
  }

  /** Set in-memory priority for a task and update the task object. */
  private setTaskPriority(task: WorkTask, priority: WorkTaskPriority): void {
    this.priorityMap.set(task.id, priority);
    task.priority = priority;
  }

  /**
   * Store a model tier override for a task.
   * Only stores when the tier string maps to a valid ModelTier.
   */
  private storeTierOverride(taskId: string, tier: string | undefined): void {
    if (!tier) return;
    const lower = tier.toLowerCase();
    if (lower === 'opus' || lower === 'sonnet' || lower === 'haiku') {
      this.tierMap.set(taskId, lower as ModelTier);
    }
  }

  /** Get the model to use for a task, applying tier override if present. */
  private resolveModelForTask(taskId: string, agentModel: string): string {
    const tier = this.tierMap.get(taskId);
    return tier ? modelForTier(tier) : agentModel;
  }

  /** Apply in-memory priority/preemption to a task loaded from DB. */
  private enrichTask(task: WorkTask): WorkTask {
    task.priority = this.getTaskPriority(task.id);
    task.preemptedBy = this.preemptionMap.get(task.id) ?? null;
    return task;
  }

  /**
   * Dequeue the highest-priority pending/queued task for a project.
   * Uses in-memory priority map for ordering (DB stores creation order only).
   */
  private dequeueNextTask(projectId: string): WorkTask | null {
    const pending = getPendingTasksForProject(this.db, projectId);
    if (pending.length === 0) return null;

    // Sort by in-memory priority (ascending), then by createdAt (FIFO)
    pending.sort((a, b) => {
      const pa = this.getTaskPriority(a.id);
      const pb = this.getTaskPriority(b.id);
      if (pa !== pb) return pa - pb;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });

    const next = pending[0];
    return this.enrichTask(next);
  }

  /**
   * Find tasks paused by a specific preempting task.
   */
  private getTasksPausedBy(preemptingTaskId: string): WorkTask[] {
    const results: WorkTask[] = [];
    for (const [pausedId, preempterId] of this.preemptionMap) {
      if (preempterId === preemptingTaskId) {
        const task = getWorkTask(this.db, pausedId);
        if (task && task.status === 'paused') {
          results.push(this.enrichTask(task));
        }
      }
    }
    return results.sort((a, b) => a.priority - b.priority || (a.createdAt < b.createdAt ? -1 : 1));
  }

  private _recoveryCtx(): RecoveryContext {
    return {
      db: this.db,
      executeTask: (task, agent, project) => this.executeTask(task, agent, project),
      cleanupWorktree: (taskId) => this.cleanupWorktree(taskId),
    };
  }

  /**
   * Recover tasks left in active states from a previous unclean shutdown.
   * Cleans up stale worktrees, then resets and retries interrupted tasks.
   */
  async recoverStaleTasks(): Promise<void> {
    return _recoverStaleTasks(this._recoveryCtx());
  }

  /**
   * Recover tasks that were interrupted by a previous unclean shutdown.
   * Unlike recoverStaleTasks (which always retries), this method only
   * requeues a task if its worktree directory still exists on disk and
   * its iteration_count is below WORK_MAX_ITERATIONS. Otherwise the
   * task is left as failed.
   */
  async recoverInterruptedTasks(): Promise<void> {
    return _recoverInterruptedTasks(this._recoveryCtx());
  }

  /**
   * Clean up worktrees for tasks in terminal states (completed/failed) that
   * were not properly cleaned up. Also runs `git worktree prune` to clear
   * stale git-internal worktree references.
   */
  async pruneStaleWorktrees(): Promise<void> {
    return _pruneStaleWorktrees(this.db);
  }

  /** Start the periodic stale worktree cleanup timer (every 6 hours). */
  startPeriodicCleanup(): void {
    if (this._cleanupInterval) return;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    this._cleanupInterval = setInterval(() => {
      this.pruneStaleWorktrees().catch((err) => {
        log.error('Periodic worktree cleanup failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, SIX_HOURS);
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /** Stop the periodic cleanup timer. */
  stopPeriodicCleanup(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * Drain running tasks during graceful shutdown.
   * Sets the shuttingDown flag to block new task creation, then waits
   * up to DRAIN_TIMEOUT_MS for all active tasks to complete, polling
   * every DRAIN_POLL_INTERVAL_MS.
   */
  async drainRunningTasks(pollIntervalMs: number = DRAIN_POLL_INTERVAL_MS): Promise<void> {
    this._shuttingDown = true;
    this.stopPeriodicCleanup();
    return _drainRunningTasks({ db: this.db, cleanupWorktree: (id) => this.cleanupWorktree(id) }, pollIntervalMs);
  }

  async create(input: CreateWorkTaskInput, tenantId?: string): Promise<WorkTask> {
    if (this._shuttingDown) {
      throw new ValidationError('Server is shutting down — new work tasks are not accepted');
    }

    // Validate agent exists
    const agent = getAgent(this.db, input.agentId, tenantId);
    if (!agent) {
      throw new NotFoundError('Agent', input.agentId);
    }

    // Reputation gate: block agents that don't meet trust requirements
    const repGuard = checkReputationForWorkTask(
      this._reputationScorer,
      input.agentId,
      input.description.slice(0, 100),
      input.minTrustLevel,
    );
    if (repGuard.blocked) {
      throw new ValidationError(repGuard.reason ?? 'Agent reputation too low to create work tasks', {
        agentId: input.agentId,
        trustLevel: repGuard.trustLevel,
      });
    }

    // Resolve projectId
    const projectId = input.projectId ?? agent.defaultProjectId;
    if (!projectId) {
      throw new NotFoundError('Project', 'defaultProjectId', { agentId: input.agentId });
    }

    // Validate project exists with a workingDir
    const project = getProject(this.db, projectId, tenantId);
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }
    if (!project.workingDir) {
      throw new ValidationError('Project has no workingDir', { projectId });
    }

    // Resolve repo slug from git remote (used for off-limits check and dedup)
    let repoSlug: string | null = null;
    try {
      const proc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
        cwd: project.workingDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const remoteUrl = (await new Response(proc.stdout).text()).trim();
      const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
      if (match) repoSlug = match[1];
    } catch {
      // Non-git directories or missing remote — allow (local-only projects)
    }

    // Check if the project's repo is off-limits
    if (repoSlug && isRepoOffLimits(repoSlug)) {
      throw new ValidationError(`Repository ${repoSlug} is off-limits — contributions are not allowed`, {
        projectId,
        repo: repoSlug,
      });
    }

    // Dedup check: reject if an open PR or active work task already addresses the same issue.
    // Resolve issue ref from explicit input first, then fall back to parsing description.
    const dedupRepo = input.issueRef?.repo ?? repoSlug;
    const issueMatch = input.description.match(/#(\d+)/);
    const dedupIssueNumber = input.issueRef?.number ?? (issueMatch ? parseInt(issueMatch[1], 10) : null);

    if (dedupIssueNumber !== null) {
      // 1. Check for an active/pending work task already targeting this issue
      const existingTasks = findActiveTasksForIssue(this.db, dedupIssueNumber);
      if (existingTasks.length > 0) {
        const existing = existingTasks[0];
        log.info('Skipping work task — active task already addresses issue', {
          issueNumber: dedupIssueNumber,
          existingTaskId: existing.id,
          existingTaskStatus: existing.status,
        });
        throw new ConflictError(`An active work task already addresses issue #${dedupIssueNumber}. Skipping.`, {
          issueNumber: dedupIssueNumber,
          existingTaskId: existing.id,
          existingTaskStatus: existing.status,
        });
      }

      // 2. Check for an open PR already addressing this issue
      if (dedupRepo) {
        try {
          const search = await searchOpenPrsForIssue(dedupRepo, dedupIssueNumber);
          if (search.ok && search.prs.length > 0) {
            const existingPr = search.prs[0];
            log.info('Skipping work task — open PR already addresses issue', {
              issueNumber: dedupIssueNumber,
              existingPr: existingPr.number,
              prUrl: existingPr.url,
              repo: dedupRepo,
            });
            throw new ConflictError(
              `An open PR (or active work task) already addresses issue #${dedupIssueNumber}. Skipping.`,
              { issueNumber: dedupIssueNumber, existingPr: existingPr.number, prUrl: existingPr.url },
            );
          }
        } catch (err) {
          if (err instanceof ConflictError) throw err;
          // Non-fatal: if the GitHub check fails, proceed with task creation
          log.warn('Failed to check for existing PRs', {
            issueNumber: dedupIssueNumber,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Flock conflict check: verify no other agent in the flock is working on the same issue/repo
    if (this.conflictResolver && repoSlug) {
      const claimResult = this.conflictResolver.checkAndClaim({
        repo: repoSlug,
        issueNumber: dedupIssueNumber ?? undefined,
        description: input.description.slice(0, 200),
      });

      if (!claimResult.allowed) {
        const blocker = claimResult.conflicts[0];
        log.info('Work task blocked by flock conflict', {
          repo: repoSlug,
          issueNumber: dedupIssueNumber,
          blockedBy: blocker?.existingClaim.agentName,
          reason: blocker?.reason,
        });
        throw new ConflictError(
          `Another agent (${blocker?.existingClaim.agentName ?? 'unknown'}) is already working on this ${blocker?.reason === 'same_issue' ? 'issue' : 'repo'}. Skipping to avoid duplicate work.`,
          {
            repo: repoSlug,
            issueNumber: dedupIssueNumber,
            blockedByAgent: blocker?.existingClaim.agentName,
            conflictReason: blocker?.reason,
          },
        );
      }

      // Store claim ID on the task for release on completion
      if (claimResult.claim) {
        // Will be released when the task completes (see onTaskComplete handler)
        this._activeClaimMap.set(projectId, claimResult.claim.id);
      }
    }

    const priority: WorkTaskPriority = (input.priority ?? 2) as WorkTaskPriority;

    // Check if there's an active task on this project
    const activeTask = getActiveTaskForProject(this.db, projectId);
    const activePriority = activeTask ? this.getTaskPriority(activeTask.id) : 3;

    if (activeTask && activePriority <= priority) {
      // Active task has equal or higher priority — queue the new task.
      // Use non-atomic insert since we've already verified the active task
      // and intend to queue, not run immediately.
      const task = createWorkTask(this.db, {
        agentId: input.agentId,
        projectId,
        description: input.description,
        source: input.source,
        sourceId: input.sourceId,
        requesterInfo: input.requesterInfo,
        priority,
        tenantId,
      });

      // Mark as queued (waiting for active task to finish)
      updateWorkTaskStatus(this.db, task.id, 'queued');

      // Track priority in memory
      this.setTaskPriority(task, priority);
      this.storeTierOverride(task.id, input.modelTier);
      this.storeBuddyConfig(task.id, input);

      log.info('Work task queued behind active task', {
        taskId: task.id,
        activeTaskId: activeTask.id,
        taskPriority: priority,
        activePriority,
      });

      this.emitCreationNotifications(task, input);
      const enriched = getWorkTask(this.db, task.id) ?? task;
      return this.enrichTask(enriched);
    }

    if (activeTask && priority < activePriority) {
      // New task has HIGHER priority — preempt the active task
      log.info('Preempting lower-priority task', {
        preemptingPriority: priority,
        preemptedTaskId: activeTask.id,
        preemptedPriority: activePriority,
      });

      // Stop the running session if active
      if (activeTask.sessionId && this.processManager.isRunning(activeTask.sessionId)) {
        this.processManager.stopProcess(activeTask.sessionId);
      }

      // Create new task (we bypass atomic check since we're handling concurrency ourselves)
      const task = createWorkTask(this.db, {
        agentId: input.agentId,
        projectId,
        description: input.description,
        source: input.source,
        sourceId: input.sourceId,
        requesterInfo: input.requesterInfo,
        priority,
        tenantId,
      });

      // Track priority in memory
      this.setTaskPriority(task, priority);
      this.storeTierOverride(task.id, input.modelTier);
      this.storeBuddyConfig(task.id, input);

      // Pause the preempted task and track preemption in memory
      pauseWorkTask(this.db, activeTask.id);
      this.preemptionMap.set(activeTask.id, task.id);

      log.info('Work task created with preemption', {
        taskId: task.id,
        preemptedTaskId: activeTask.id,
        priority,
      });

      this.emitCreationNotifications(task, input);
      return this.executeTask(task, agent, project);
    }

    // No active task — run immediately
    const task = createWorkTaskAtomic(this.db, {
      agentId: input.agentId,
      projectId,
      description: input.description,
      source: input.source,
      sourceId: input.sourceId,
      requesterInfo: input.requesterInfo,
      tenantId,
    });
    if (!task) {
      // Race condition: another task became active between getActiveTaskForProject
      // and the atomic insert. Queue behind it instead of rejecting.
      const raceActiveTask = getActiveTaskForProject(this.db, projectId);
      if (raceActiveTask) {
        const queued = createWorkTask(this.db, {
          agentId: input.agentId,
          projectId,
          description: input.description,
          source: input.source,
          sourceId: input.sourceId,
          requesterInfo: input.requesterInfo,
          priority,
          tenantId,
        });
        updateWorkTaskStatus(this.db, queued.id, 'queued');
        this.setTaskPriority(queued, priority);
        this.storeTierOverride(queued.id, input.modelTier);
        this.storeBuddyConfig(queued.id, input);
        log.info('Work task queued (race condition recovery)', {
          taskId: queued.id,
          activeTaskId: raceActiveTask.id,
          priority,
        });
        this.emitCreationNotifications(queued, input);
        const enriched = getWorkTask(this.db, queued.id) ?? queued;
        return this.enrichTask(enriched);
      }
      // Race condition: blocker likely completed between checks. Retry once.
      await Bun.sleep(100);
      const retryTask = createWorkTaskAtomic(this.db, {
        agentId: input.agentId,
        projectId,
        description: input.description,
        source: input.source,
        sourceId: input.sourceId,
        requesterInfo: input.requesterInfo,
        tenantId,
      });
      if (retryTask) {
        this.setTaskPriority(retryTask, priority);
        this.storeTierOverride(retryTask.id, input.modelTier);
        this.storeBuddyConfig(retryTask.id, input);
        log.info('Work task created on atomic retry', {
          taskId: retryTask.id,
          agentId: input.agentId,
          projectId,
          priority,
        });
        this.emitCreationNotifications(retryTask, input);
        return this.executeTask(retryTask, agent, project);
      }

      // Atomic retry also failed — queue as fallback so task is not lost
      const fallback = createWorkTask(this.db, {
        agentId: input.agentId,
        projectId,
        description: input.description,
        source: input.source,
        sourceId: input.sourceId,
        requesterInfo: input.requesterInfo,
        priority,
        tenantId,
      });
      updateWorkTaskStatus(this.db, fallback.id, 'queued');
      this.setTaskPriority(fallback, priority);
      this.storeTierOverride(fallback.id, input.modelTier);
      this.storeBuddyConfig(fallback.id, input);
      log.warn('Work task queued as fallback (atomic retry failed)', {
        taskId: fallback.id,
        projectId,
        priority,
      });
      this.emitCreationNotifications(fallback, input);
      const enrichedFallback = getWorkTask(this.db, fallback.id) ?? fallback;
      return this.enrichTask(enrichedFallback);
    }

    // Track priority in memory
    this.setTaskPriority(task, priority);
    this.storeTierOverride(task.id, input.modelTier);

    log.info('Work task created', { taskId: task.id, agentId: input.agentId, projectId, priority });

    // Store buddy config if provided
    this.storeBuddyConfig(task.id, input);

    this.emitCreationNotifications(task, input);
    return this.executeTask(task, agent, project);
  }

  private emitCreationNotifications(task: WorkTask, input: CreateWorkTaskInput): void {
    // Fire-and-forget AlgoChat notification for task creation
    if (this.agentMessenger) {
      const snippet = input.description.slice(0, 100);
      const priorityLabel = ['P0', 'P1', 'P2', 'P3'][task.priority];
      this.agentMessenger
        .sendOnChainToSelf(input.agentId, `[WORK_TASK:created:${priorityLabel}] ${snippet}`)
        .catch((err) =>
          log.debug('AlgoChat task-created notification failed', {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
    }

    recordAudit(
      this.db,
      'work_task_create',
      input.agentId,
      'work_task',
      task.id,
      `Created work task (P${task.priority}): ${input.description.slice(0, 200)}`,
    );
  }

  /** Store buddy config for a task if provided in the input. */
  private storeBuddyConfig(taskId: string, input: CreateWorkTaskInput): void {
    const config = extractBuddyConfig(input);
    if (!config) return;

    this._buddyConfigMap.set(taskId, config);

    // Register a completion callback that triggers buddy review
    this.onComplete(taskId, (completedTask) => {
      const buddyConfig = this._buddyConfigMap.get(taskId);
      if (!buddyConfig || !this._buddyService) return;

      triggerBuddyReview(completedTask, buddyConfig, this._buddyService)
        .then(() => {
          this._buddyConfigMap.delete(taskId);
        })
        .catch((err) => {
          log.warn('Failed to trigger buddy review', {
            taskId: completedTask.id,
            error: err instanceof Error ? err.message : String(err),
          });
          this._buddyConfigMap.delete(taskId);
        });
    });
  }

  /**
   * Execute a pending work task: create worktree, install deps, start session.
   * Shared by both `create` (new tasks) and `recoverStaleTasks` (retried tasks).
   */
  async executeTask(
    task: WorkTask,
    agent: { id: string; name: string },
    project: { id: string; workingDir: string },
  ): Promise<WorkTask> {
    // Generate branch name
    const agentSlug = agent.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const taskSlug = task.description
      .slice(0, 40)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = Date.now().toString(36);
    const suffix = crypto.randomUUID().slice(0, 6);
    const branchName = `agent/${agentSlug}/${taskSlug}-${timestamp}-${suffix}`;

    // Update status to branching
    updateWorkTaskStatus(this.db, task.id, 'branching');
    this.fireStatusChange(task.id);

    // Create git worktree (isolated directory — does not touch the main working tree)
    const worktreeResult = await createWorktree({
      projectWorkingDir: project.workingDir,
      branchName,
      worktreeId: task.id,
    });

    if (!worktreeResult.success) {
      updateWorkTaskStatus(this.db, task.id, 'failed', {
        error: worktreeResult.error ?? 'Failed to create worktree',
      });
      const failed = getWorkTask(this.db, task.id);
      return failed ?? task;
    }

    const worktreeDir = worktreeResult.worktreeDir;

    // Install dependencies in the worktree (worktrees don't share node_modules).
    try {
      await runBunInstall(worktreeDir);
    } catch (err) {
      log.warn('Failed to install dependencies in worktree', {
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal — the agent session may still succeed if deps are available
    }

    // Update status to running with iteration count 1
    updateWorkTaskStatus(this.db, task.id, 'running', {
      branchName,
      worktreeDir,
      iterationCount: 1,
    });
    this.fireStatusChange(task.id);

    // Generate repo map for structural awareness (best-effort)
    const repoMap = this.astParserService ? await generateRepoMap(this.astParserService, worktreeDir) : null;

    // Extract relevant symbols based on task description keywords
    const relevantSymbols = this.astParserService
      ? extractRelevantSymbols(this.astParserService, worktreeDir, task.description)
      : null;

    // Assess governance impact of the task based on paths mentioned in the description.
    // This is ADVISORY only — a task description may mention protected files without
    // actually modifying them. The real governance enforcement happens in validation.ts
    // which inspects the actual git diff. Blocking here on description text produces
    // false positives (e.g. a task that says "reads from schema.ts" gets killed even
    // though it never modifies the file). See: https://github.com/CorvidLabs/corvid-agent/issues/1766
    const governanceImpact = assessGovernanceImpact(task.description);
    if (governanceImpact && governanceImpact.tier < 2) {
      log.warn('Work task description references protected paths (advisory — actual enforcement is on git diff)', {
        taskId: task.id,
        tier: governanceImpact.tier,
        tierLabel: governanceImpact.tierLabel,
        affectedPaths: governanceImpact.affectedPaths
          .filter((p) => p.tier < 2)
          .map((p) => `${p.path} (Layer ${p.tier})`),
      });
    }

    // Build work prompt (includes governance warnings for Layer 1 paths)
    const prompt = buildWorkPrompt(
      branchName,
      task.description,
      repoMap ?? undefined,
      relevantSymbols ?? undefined,
      governanceImpact,
    );

    // Create session with workDir pointing to the worktree
    const session = createSession(this.db, {
      projectId: project.id,
      agentId: agent.id,
      name: `Work: ${task.description.slice(0, 60)}`,
      initialPrompt: prompt,
      source: task.source ?? 'web',
      workDir: worktreeDir,
    });

    updateWorkTaskStatus(this.db, task.id, 'running', { sessionId: session.id, branchName });

    // Subscribe for completion (includes stall detection for chain continuation)
    this.subscribeForCompletion(task.id, session.id);

    // Resolve model: apply tier override if present (from chain continuation escalation).
    // We temporarily patch the agent's model in the DB so that ProcessManager's
    // synchronous getAgent() call inside startProcess() picks up the override.
    // This is safe in single-threaded JS: getAgent runs before any async work,
    // and we restore the original model immediately after startProcess returns.
    const agentRecord = getAgent(this.db, agent.id);
    const agentModel = agentRecord?.model ?? '';
    const resolvedModel = this.resolveModelForTask(task.id, agentModel);
    const hasModelOverride = !!agentModel && resolvedModel !== agentModel;

    if (hasModelOverride) {
      this.db.query('UPDATE agents SET model = ? WHERE id = ?').run(resolvedModel, agent.id);
    }

    // Start the process
    this.processManager.startProcess(session, prompt);

    if (hasModelOverride) {
      this.db.query('UPDATE agents SET model = ? WHERE id = ?').run(agentModel, agent.id);
    }

    log.info('Work task running', {
      taskId: task.id,
      sessionId: session.id,
      branchName,
      worktreeDir,
      ...(hasModelOverride ? { resolvedModel } : {}),
    });

    const updated = getWorkTask(this.db, task.id);
    return updated ?? task;
  }

  getTask(id: string, tenantId?: string): WorkTask | null {
    return getWorkTask(this.db, id, tenantId);
  }

  listTasks(agentId?: string, tenantId?: string): WorkTask[] {
    return dbListWorkTasks(this.db, agentId, tenantId);
  }

  getAttestation(taskId: string) {
    return this._attestation.getAttestation(taskId);
  }

  /**
   * Retry a failed work task: reset it to pending and re-execute from scratch.
   */
  async retryTask(id: string, tenantId?: string): Promise<WorkTask | null> {
    if (this._shuttingDown) {
      throw new ValidationError('Server is shutting down — retries are not accepted');
    }

    const task = getWorkTask(this.db, id, tenantId);
    if (!task) return null;

    if (task.status !== 'failed') {
      throw new ValidationError('Only failed tasks can be retried', { taskId: id, status: task.status });
    }

    const agent = getAgent(this.db, task.agentId, tenantId);
    if (!agent) {
      throw new NotFoundError('Agent', task.agentId);
    }

    const project = getProject(this.db, task.projectId, tenantId);
    if (!project?.workingDir) {
      throw new NotFoundError('Project', task.projectId);
    }

    if (task.worktreeDir) {
      await this.cleanupWorktree(task.id);
    }

    resetWorkTaskForRetry(this.db, task.id);

    log.info('Retrying failed work task', { taskId: task.id, description: task.description.slice(0, 80) });

    recordAudit(
      this.db,
      'work_task_retry',
      task.agentId,
      'work_task',
      task.id,
      `Retried work task: ${task.description.slice(0, 200)}`,
    );

    const resetTask = getWorkTask(this.db, task.id);
    if (!resetTask) return null;

    return this.executeTask(resetTask, agent, project);
  }

  /**
   * Resume or cancel a task that is in the `escalation_needed` state.
   * - `retry`: restart the task from scratch (same model tier)
   * - `retry_opus`: restart with the Opus model tier override
   * - `cancel`: mark the task as failed
   */
  async escalateResume(
    id: string,
    action: 'retry' | 'retry_opus' | 'cancel',
    tenantId?: string,
  ): Promise<WorkTask | null> {
    if (this._shuttingDown) {
      throw new ValidationError('Server is shutting down — escalation is not accepted');
    }

    const task = getWorkTask(this.db, id, tenantId);
    if (!task) return null;

    if (task.status !== 'escalation_needed') {
      throw new ValidationError('Only escalation_needed tasks can be escalated', { taskId: id, status: task.status });
    }

    if (action === 'cancel') {
      updateWorkTaskStatus(this.db, id, 'failed', { error: 'Cancelled by owner after escalation' });
      recordAudit(this.db, 'work_task_escalate_cancel', task.agentId, 'work_task', id, 'Cancelled via escalation');
      return getWorkTask(this.db, id) ?? task;
    }

    const agent = getAgent(this.db, task.agentId, tenantId);
    if (!agent) throw new NotFoundError('Agent', task.agentId);

    const project = getProject(this.db, task.projectId, tenantId);
    if (!project?.workingDir) throw new NotFoundError('Project', task.projectId);

    if (action === 'retry_opus') {
      this.storeTierOverride(id, 'opus');
    }

    resetWorkTaskForRetry(this.db, id);

    log.info('Escalation: resuming work task', { taskId: id, action });
    recordAudit(
      this.db,
      'work_task_escalate_resume',
      task.agentId,
      'work_task',
      id,
      `Resumed via escalation (action: ${action})`,
    );

    const resetTask = getWorkTask(this.db, id);
    if (!resetTask) return null;

    return this.executeTask(resetTask, agent, project);
  }

  async cancelTask(id: string): Promise<WorkTask | null> {
    const task = getWorkTask(this.db, id);
    if (!task) return null;

    if (task.sessionId && this.processManager.isRunning(task.sessionId)) {
      this.processManager.stopProcess(task.sessionId);
    }

    updateWorkTaskStatus(this.db, id, 'failed', { error: 'Cancelled by user' });

    // Clean up worktree
    await this.cleanupWorktree(id);

    const cancelled = getWorkTask(this.db, id);

    // Process queue — resume paused tasks and dequeue next
    if (cancelled) {
      this.processQueue(cancelled).catch((err) => {
        log.error('Failed to process queue after cancel', {
          taskId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return cancelled;
  }

  onComplete(taskId: string, callback: CompletionCallback): void {
    let callbacks = this.completionCallbacks.get(taskId);
    if (!callbacks) {
      callbacks = new Set();
      this.completionCallbacks.set(taskId, callbacks);
    }
    callbacks.add(callback);
  }

  /** Remove a specific completion callback (e.g. when a WebSocket disconnects). */
  offComplete(taskId: string, callback: CompletionCallback): void {
    const callbacks = this.completionCallbacks.get(taskId);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) this.completionCallbacks.delete(taskId);
    }
  }

  /** Subscribe to status changes for a task (branching, running, validating, etc.). */
  onStatusChange(taskId: string, callback: StatusChangeCallback): void {
    let callbacks = this.statusChangeCallbacks.get(taskId);
    if (!callbacks) {
      callbacks = new Set();
      this.statusChangeCallbacks.set(taskId, callbacks);
    }
    callbacks.add(callback);
  }

  /** Fire status-change callbacks for a task. Call after updating task status in DB. */
  private fireStatusChange(taskId: string): void {
    const task = getWorkTask(this.db, taskId);
    if (!task) return;
    const callbacks = this.statusChangeCallbacks.get(taskId);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        cb(task);
      } catch {
        /* ignore callback errors */
      }
    }
  }

  private subscribeForCompletion(taskId: string, sessionId: string): void {
    let responseBuffer = '';

    // Begin tracking stall state for this session
    this.stallDetector.track(sessionId);

    const callback = (sid: string, event: ClaudeStreamEvent) => {
      if (sid !== sessionId) return;

      if (event.type === 'assistant' && event.message?.content) {
        responseBuffer += extractContentText(event.message.content);
      }

      // Feed event to stall detector. content_block_start events carry
      // content_block.type which identifies tool_use vs text blocks.
      const contentBlockType =
        event.type === 'content_block_start'
          ? (event as { type: 'content_block_start'; content_block?: { type: string } }).content_block?.type
          : undefined;
      const stalled = this.stallDetector.onEvent(sessionId, event.type, contentBlockType);
      if (stalled) {
        this.stallDetector.markEscalated(sessionId);
        // Fire-and-forget escalation — don't block the event loop
        this.escalateTask(taskId, sessionId, responseBuffer.trim()).catch((err) => {
          log.warn('Chain continuation escalation failed', {
            taskId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      if (event.type === 'result' || event.type === 'session_exited') {
        this.processManager.unsubscribe(sessionId, callback);
        this.stallDetector.remove(sessionId);

        const fullOutput = responseBuffer.trim();

        // Run post-session validation
        this.handleSessionEnd(taskId, fullOutput);
      }
    };

    this.processManager.subscribe(sessionId, callback);
  }

  /**
   * Escalate a stalled work task to the next higher model tier.
   *
   * Security constraints:
   *   - Chain state serialization redacts secrets via serializeChainState().
   *   - The current task is failed BEFORE the new task is created, respecting
   *     the 1-active-task-per-project invariant.
   *   - Log line contains only tier-from/tier-to metadata — no session content.
   */
  private async escalateTask(taskId: string, sessionId: string, sessionSummary: string): Promise<void> {
    const task = getWorkTask(this.db, taskId);
    if (!task) return;

    // Don't escalate if the task already completed or failed
    if (task.status === 'completed' || task.status === 'failed') return;

    const agent = getAgent(this.db, task.agentId);
    if (!agent) return;

    // Determine current and next tier
    const storedTier = this.tierMap.get(taskId);
    const currentTier: ModelTier = storedTier ?? inferModelTier(agent.model);
    const nextTier = escalateTier(currentTier);

    if (!nextTier) {
      // Already at OPUS — cannot escalate further; let the session continue
      log.info('Chain continuation: already at max tier, cannot escalate further', {
        taskId,
        sessionId,
        tier: currentTier,
        stalledSteps: this.stallDetector.getStalledSteps(sessionId),
      });
      return;
    }

    const stalledSteps = this.stallDetector.getStalledSteps(sessionId);

    // Stop the stalled session process
    if (this.processManager.isRunning(sessionId)) {
      this.processManager.stopProcess(sessionId);
    }

    // Fail the current task (freed the project slot for the escalated task)
    updateWorkTaskStatus(this.db, taskId, 'failed', {
      error: `Auto-escalated after ${stalledSteps} stalled step(s): ${currentTier} → ${nextTier}`,
    });

    // Build escalated task description (safe — secrets are redacted)
    const escalatedDescription = serializeChainState({
      taskDescription: task.description,
      fromTier: currentTier,
      toTier: nextTier,
      stalledSteps,
      sessionSummary,
    });

    logEscalation({ taskId, sessionId, fromTier: currentTier, toTier: nextTier, stalledSteps });

    // Create new task at the higher tier — goes through normal queue/concurrency checks
    try {
      const newTask = await this.create({
        agentId: task.agentId,
        description: escalatedDescription,
        projectId: task.projectId,
        source: task.source,
        modelTier: nextTier,
      });
      logEscalation({
        taskId,
        sessionId,
        fromTier: currentTier,
        toTier: nextTier,
        stalledSteps,
        newTaskId: newTask.id,
      });
    } catch (err) {
      log.warn('Chain continuation: failed to create escalated task', {
        taskId,
        fromTier: currentTier,
        toTier: nextTier,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private _lifecycleCtx(): SessionLifecycleContext {
    const ns = this.notificationService;
    return {
      db: this.db,
      processManager: this.processManager,
      notifyCallbacks: (taskId) => this.notifyCallbacks(taskId),
      notifyStatusChange: (taskId) => this.fireStatusChange(taskId),
      subscribeForCompletion: (taskId, sessionId) => this.subscribeForCompletion(taskId, sessionId),
      notifyOwner: ns ? (params) => ns.notify(params).then(() => undefined) : null,
    };
  }

  private async handleSessionEnd(taskId: string, sessionOutput: string): Promise<void> {
    return _handleSessionEnd(this._lifecycleCtx(), taskId, sessionOutput);
  }

  private notifyCallbacks(taskId: string): void {
    const task = getWorkTask(this.db, taskId);
    if (task) {
      // Release flock conflict claim for this project
      this.releaseFlockClaim(task.projectId, task.status);

      // Fire-and-forget AlgoChat notification for task completion/failure
      if (this.agentMessenger && task.agentId) {
        const msg =
          task.status === 'completed'
            ? `[WORK_TASK:completed] ${task.prUrl ? `PR: ${task.prUrl}` : task.description.slice(0, 100)}`
            : `[WORK_TASK:failed] ${(task.error ?? task.description).slice(0, 100)}`;
        this.agentMessenger.sendOnChainToSelf(task.agentId, msg).catch((err) =>
          log.debug('AlgoChat task-completion notification failed', {
            error: err instanceof Error ? err.message : String(err),
          }),
        );

        // Publish a verifiable on-chain attestation of the task outcome (#1458).
        const messenger = this.agentMessenger;
        const agentId = task.agentId;
        this._attestation
          .attest(task, (note) => messenger.sendOnChainToSelf(agentId, note).then((txid) => txid ?? null))
          .catch((err) =>
            log.debug('Work task attestation publish failed (non-fatal)', {
              taskId: task.id,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
      }

      const callbacks = this.completionCallbacks.get(taskId);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            cb(task);
          } catch (err) {
            log.error('Completion callback error', {
              taskId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        this.completionCallbacks.delete(taskId);
      }
      this.statusChangeCallbacks.delete(taskId);

      // Resume paused tasks and process queue
      this.processQueue(task).catch((err) => {
        log.error('Failed to process queue after task completion', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  /**
   * After a task completes or fails, resume any tasks it paused
   * and dequeue the next highest-priority task for the project.
   */
  private async processQueue(completedTask: WorkTask): Promise<void> {
    if (this._shuttingDown) return;

    // Resume tasks that were paused by this task
    const pausedTasks = this.getTasksPausedBy(completedTask.id);
    for (const paused of pausedTasks) {
      resumePausedTask(this.db, paused.id);
      this.preemptionMap.delete(paused.id);
      log.info('Resumed paused task', { taskId: paused.id, resumedAfter: completedTask.id });
    }

    // Clean up priority tracking for completed task
    this.priorityMap.delete(completedTask.id);

    // Dequeue next task for this project (highest priority first, using in-memory priority)
    const next = this.dequeueNextTask(completedTask.projectId);
    if (!next) return;

    const agent = getAgent(this.db, next.agentId);
    const project = getProject(this.db, next.projectId);
    if (!agent || !project?.workingDir) {
      log.warn('Cannot dequeue task: agent or project missing', { taskId: next.id });
      updateWorkTaskStatus(this.db, next.id, 'failed', {
        error: 'Agent or project missing when dequeuing',
      });
      return;
    }

    log.info('Dequeuing next task from priority queue', {
      taskId: next.id,
      priority: next.priority,
      queuedRemaining: countQueuedTasks(this.db, next.projectId),
    });

    this.executeTask(next, agent, project).catch((err) => {
      log.error('Failed to execute dequeued task', {
        taskId: next.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  /**
   * Release the flock conflict claim for a project when a task finishes.
   */
  private releaseFlockClaim(projectId: string, status: string): void {
    const claimId = this._activeClaimMap.get(projectId);
    if (!claimId || !this.conflictResolver) return;

    this.conflictResolver.releaseClaim(claimId, status === 'completed' ? 'completed' : 'task_failed');
    this._activeClaimMap.delete(projectId);
    log.debug('Released flock claim', { projectId, claimId, taskStatus: status });
  }

  private async cleanupWorktree(taskId: string): Promise<void> {
    return _cleanupWorktree(this.db, taskId);
  }
}
