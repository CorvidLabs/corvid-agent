/**
 * AutonomousLoopService — orchestrates the improvement feedback loop.
 *
 * Connects health collection, memory recall, reputation gating, session creation,
 * and outcome tracking into a single autonomous cycle.
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { MemoryManager } from '../memory/index';
import type { ReputationScorer } from '../reputation/scorer';
import type { TrustLevel } from '../reputation/types';
import type { ScoredMemory } from '../memory/semantic-search';
import { CodebaseHealthCollector } from './health-collector';
import type { HealthMetrics } from './health-collector';
import { buildImprovementPrompt } from './prompt-builder';
import { saveHealthSnapshot, getRecentSnapshots, computeTrends, formatTrendsForPrompt } from './health-store';
import { getAgent } from '../db/agents';
import { getProject } from '../db/projects';
import { createSession } from '../db/sessions';
import { createLogger } from '../lib/logger';

const log = createLogger('ImprovementLoop');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImprovementLoopOptions {
    maxTasks?: number;
    focusArea?: string;
}

export interface ImprovementRunResult {
    sessionId: string;
    health: HealthMetrics;
    reputationScore: number;
    trustLevel: TrustLevel;
    pastAttemptCount: number;
    maxTasksAllowed: number;
}

// ─── Reputation Gating ───────────────────────────────────────────────────────

function computeMaxTasks(trustLevel: TrustLevel, requestedMax: number): number {
    switch (trustLevel) {
        case 'untrusted':
            return 0; // blocked
        case 'low':
            return 1;
        case 'medium':
            return Math.min(requestedMax, 2);
        case 'high':
        case 'verified':
            return Math.min(requestedMax, 5);
    }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AutonomousLoopService {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService;
    private memoryManager: MemoryManager;
    private reputationScorer: ReputationScorer;
    private healthCollector: CodebaseHealthCollector;

    constructor(
        db: Database,
        processManager: ProcessManager,
        workTaskService: WorkTaskService,
        memoryManager: MemoryManager,
        reputationScorer: ReputationScorer,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.workTaskService = workTaskService;
        this.memoryManager = memoryManager;
        this.reputationScorer = reputationScorer;
        this.healthCollector = new CodebaseHealthCollector();
    }

    async run(
        agentId: string,
        projectId: string,
        options: ImprovementLoopOptions = {},
    ): Promise<ImprovementRunResult> {
        const requestedMax = options.maxTasks ?? 3;

        // 1. Validate agent and project
        const agent = getAgent(this.db, agentId);
        if (!agent) throw new Error(`Agent not found: ${agentId}`);

        const project = getProject(this.db, projectId);
        if (!project) throw new Error(`Project not found: ${projectId}`);
        if (!project.workingDir) throw new Error(`Project has no workingDir: ${projectId}`);

        log.info('Starting improvement loop', { agentId, projectId, requestedMax });

        // 2. Collect codebase health metrics
        const health = await this.healthCollector.collect(project.workingDir);
        log.info('Health metrics collected', {
            tscErrors: health.tscErrorCount,
            testFailures: health.testFailureCount,
            todos: health.todoCount,
            largeFiles: health.largeFiles.length,
            timeMs: health.collectionTimeMs,
        });

        // 2b. Save health snapshot for trend tracking
        saveHealthSnapshot(this.db, agentId, projectId, health);

        // 2c. Compute trends from historical snapshots
        let trendSummary: string | undefined;
        try {
            const snapshots = getRecentSnapshots(this.db, agentId, projectId, 10);
            const trends = computeTrends(snapshots);
            if (trends.length > 0) {
                trendSummary = formatTrendsForPrompt(trends);
            }
        } catch (err) {
            log.warn('Failed to compute health trends', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        // 3. Recall past improvement attempts
        let pastAttempts: ScoredMemory[] = [];
        try {
            pastAttempts = this.memoryManager.searchFast(agentId, 'improvement_loop outcome', { limit: 10 });
        } catch (err) {
            log.warn('Failed to recall past attempts', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        // 4. Compute reputation
        const reputation = this.reputationScorer.computeScore(agentId);
        log.info('Reputation computed', {
            score: reputation.overallScore,
            trustLevel: reputation.trustLevel,
        });

        // 5. Reputation gating
        const maxTasksAllowed = computeMaxTasks(reputation.trustLevel, requestedMax);
        if (maxTasksAllowed === 0) {
            log.warn('Improvement loop blocked — agent is untrusted', { agentId, score: reputation.overallScore });
            throw new Error(
                `Agent ${agentId} is untrusted (score: ${reputation.overallScore}). ` +
                `Improvement loop requires at least "low" trust level.`,
            );
        }

        // 6. Build enriched prompt
        const prompt = buildImprovementPrompt(health, pastAttempts, reputation, {
            maxTasks: maxTasksAllowed,
            focusArea: options.focusArea,
        }, trendSummary);

        // 7. Create session and start agent
        const session = createSession(this.db, {
            projectId,
            agentId,
            name: 'Improvement Loop',
            initialPrompt: prompt,
            source: 'agent',
        });

        this.processManager.startProcess(session, prompt, { schedulerMode: true });

        log.info('Improvement loop session started', {
            sessionId: session.id,
            maxTasks: maxTasksAllowed,
            pastAttempts: pastAttempts.length,
        });

        // 8. Register feedback hooks (async, non-blocking)
        this.registerFeedbackHooks(agentId, session.id, session.createdAt);

        return {
            sessionId: session.id,
            health,
            reputationScore: reputation.overallScore,
            trustLevel: reputation.trustLevel,
            pastAttemptCount: pastAttempts.length,
            maxTasksAllowed,
        };
    }

    // ─── Feedback Loop ───────────────────────────────────────────────────────

    private registerFeedbackHooks(agentId: string, sessionId: string, sessionCreatedAt: string): void {
        // Subscribe to session completion to save learnings
        const handleSessionEnd = () => {
            this.processManager.unsubscribe(sessionId, handleSessionEnd);
            this.saveLearnings(agentId, sessionId, sessionCreatedAt);
        };

        this.processManager.subscribe(sessionId, (event: unknown) => {
            // Check for session end events
            const ev = event as { type?: string };
            if (ev.type === 'result' || ev.type === 'error') {
                handleSessionEnd();
            }
        });
    }

    private saveLearnings(agentId: string, sessionId: string, sessionCreatedAt: string): void {
        try {
            // Find work tasks created during this session
            const allTasks = this.workTaskService.listTasks(agentId);
            const newTasks = allTasks.filter((t) => t.createdAt >= sessionCreatedAt);

            const timestamp = new Date().toISOString();
            const taskSummaries = newTasks.map((t) => `- [${t.status}] ${t.description?.slice(0, 100)}`).join('\n');

            // Save session outcome to memory
            this.memoryManager.save({
                agentId,
                key: `improvement_loop:outcome:${timestamp}`,
                content: `Improvement loop session ${sessionId} completed at ${timestamp}.\n` +
                    `Created ${newTasks.length} work task(s).\n` +
                    (taskSummaries ? `Tasks:\n${taskSummaries}` : 'No tasks created.'),
            });

            // Register completion callbacks for each new task
            for (const task of newTasks) {
                this.workTaskService.onComplete(task.id, (completedTask) => {
                    this.handleTaskCompletion(agentId, completedTask);
                });
            }

            log.info('Improvement loop learnings saved', {
                agentId,
                sessionId,
                tasksCreated: newTasks.length,
            });
        } catch (err) {
            log.error('Failed to save improvement learnings', {
                agentId,
                sessionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private handleTaskCompletion(agentId: string, task: { id: string; status: string; prUrl: string | null; error: string | null; description?: string }): void {
        try {
            if (task.status === 'completed') {
                this.reputationScorer.recordEvent({
                    agentId,
                    eventType: 'improvement_loop_completed',
                    scoreImpact: 5,
                    metadata: { taskId: task.id, prUrl: task.prUrl },
                });

                this.memoryManager.save({
                    agentId,
                    key: `improvement_task:${task.id}:outcome`,
                    content: `Work task ${task.id} SUCCEEDED. ` +
                        `${task.prUrl ? `PR: ${task.prUrl}` : 'No PR created.'}` +
                        `${task.description ? ` Description: ${task.description.slice(0, 200)}` : ''}`,
                });
            } else {
                this.reputationScorer.recordEvent({
                    agentId,
                    eventType: 'improvement_loop_failed',
                    scoreImpact: -2,
                    metadata: { taskId: task.id, error: task.error },
                });

                this.memoryManager.save({
                    agentId,
                    key: `improvement_task:${task.id}:outcome`,
                    content: `Work task ${task.id} FAILED. ` +
                        `Error: ${task.error ?? 'unknown'}. ` +
                        `${task.description ? `Description: ${task.description.slice(0, 200)}` : ''}` +
                        ` — avoid this approach in future loops.`,
                });
            }
        } catch (err) {
            log.error('Failed to record task completion', {
                agentId,
                taskId: task.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
