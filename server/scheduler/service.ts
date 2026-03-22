/**
 * SchedulerService — cron/interval-based automation engine for agent schedules.
 *
 * Polls for due schedules every 30 seconds, executes their actions,
 * and manages approval workflows for PR submissions.
 *
 * Action execution is delegated to focused handler modules in ./handlers/.
 * Execution lifecycle (dispatch, error handling, notifications) lives in ./execution.ts.
 */

import type { Database } from 'bun:sqlite';
import { queryCount } from '../db/types';
import type { ProcessManager } from '../process/manager';
import type { WorkTaskService } from '../work/service';
import type { AutonomousLoopService } from '../improvement/service';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { ReputationScorer } from '../reputation/scorer';
import type { ReputationAttestation } from '../reputation/attestation';
import type { NotificationService } from '../notifications/service';
import type { AgentSchedule, ScheduleAction, ScheduleExecution } from '../../shared/types';
import {
    listDueSchedules,
    updateScheduleLastRun,
    updateScheduleNextRun,
    updateSchedule,
    getSchedule,
    createExecution,
    updateExecutionStatus,
    getExecution,
    resolveScheduleApproval,
} from '../db/schedules';
import { getAgent } from '../db/agents';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { getNextCronDate } from './cron-parser';
import { createLogger } from '../lib/logger';
import { NotFoundError, ValidationError } from '../lib/errors';
import { recordAudit } from '../db/audit';
import { createEventContext, runWithEventContext } from '../observability/event-context';
import { cleanExpiredLocks } from '../db/repo-locks';
import type { OutcomeTrackerService } from '../feedback/outcome-tracker';
import type { DailyReviewService } from '../improvement/daily-review';
import { SystemStateDetector, type SystemStateResult, type SystemStateConfig } from './system-state';
import { getAllRules } from './priority-rules';
import type { HandlerContext } from './handlers/types';
import { runAction, type RunActionDeps } from './execution';
import { executePipeline } from './pipeline';
import {
    shouldSkipByHealthGate,
    handleApprovalIfNeeded,
    handleRepoLocking,
} from './orchestration';

const log = createLogger('Scheduler');

const POLL_INTERVAL_MS = 30_000;
const MAX_CONCURRENT_EXECUTIONS = 2;
const MIN_SCHEDULE_INTERVAL_MS = 300_000; // 5 minutes

type ScheduleEventCallback = (event: {
    type: 'schedule_update' | 'schedule_execution_update' | 'schedule_approval_request';
    data: unknown;
}) => void;

/**
 * Validate that a schedule doesn't fire more often than every 5 minutes.
 */
export function validateScheduleFrequency(cronExpression?: string | null, intervalMs?: number | null): void {
    if (intervalMs !== undefined && intervalMs !== null) {
        if (intervalMs < MIN_SCHEDULE_INTERVAL_MS) {
            throw new ValidationError(`Schedule interval too short: ${intervalMs}ms. Minimum is ${MIN_SCHEDULE_INTERVAL_MS}ms (5 minutes).`);
        }
    }

    if (cronExpression) {
        const now = new Date();
        try {
            const first = getNextCronDate(cronExpression, now);
            const second = getNextCronDate(cronExpression, first);
            const gapMs = second.getTime() - first.getTime();
            if (gapMs < MIN_SCHEDULE_INTERVAL_MS) {
                throw new ValidationError(
                    `Cron expression "${cronExpression}" fires every ${Math.round(gapMs / 1000)}s. ` +
                    `Minimum interval is 5 minutes.`
                );
            }
        } catch (err) {
            if (err instanceof ValidationError) throw err;
            throw new ValidationError(`Invalid cron expression: ${cronExpression}`);
        }
    }
}

export class SchedulerService {
    private db: Database;
    private processManager: ProcessManager;
    private workTaskService: WorkTaskService | null;
    private agentMessenger: AgentMessenger | null;
    private improvementLoopService: AutonomousLoopService | null = null;
    private reputationScorer: ReputationScorer | null = null;
    private reputationAttestation: ReputationAttestation | null = null;
    private notificationService: NotificationService | null = null;
    private outcomeTrackerService: OutcomeTrackerService | null = null;
    private dailyReviewService: DailyReviewService | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private tickPromise: Promise<void> | null = null;
    private runningExecutions = new Set<string>();
    private eventCallbacks = new Set<ScheduleEventCallback>();
    private consecutiveFailures = new Map<string, number>();
    private systemStateDetector: SystemStateDetector;
    private lastSystemState: SystemStateResult | null = null;

    constructor(
        db: Database,
        processManager: ProcessManager,
        workTaskService?: WorkTaskService | null,
        agentMessenger?: AgentMessenger | null,
        systemStateConfig?: Partial<SystemStateConfig>,
    ) {
        this.db = db;
        this.processManager = processManager;
        this.workTaskService = workTaskService ?? null;
        this.agentMessenger = agentMessenger ?? null;
        this.systemStateDetector = new SystemStateDetector(db, systemStateConfig);
    }

    // ─── Dependency setters ──────────────────────────────────────────────────

    setAgentMessenger(messenger: AgentMessenger): void { this.agentMessenger = messenger; }
    setImprovementLoopService(service: AutonomousLoopService): void { this.improvementLoopService = service; }
    setReputationServices(scorer: ReputationScorer, attestation: ReputationAttestation): void {
        this.reputationScorer = scorer;
        this.reputationAttestation = attestation;
    }
    setOutcomeTrackerService(service: OutcomeTrackerService): void { this.outcomeTrackerService = service; }
    setDailyReviewService(service: DailyReviewService): void { this.dailyReviewService = service; }
    setNotificationService(service: NotificationService): void { this.notificationService = service; }
    setHealthCheck(fn: () => Promise<{ status: string }>): void { this.systemStateDetector.setHealthCheck(fn); }

    // ─── Public API ──────────────────────────────────────────────────────────

    async getSystemState(): Promise<SystemStateResult> { return this.systemStateDetector.evaluate(); }
    getLastSystemState(): SystemStateResult | null { return this.lastSystemState; }

    start(): void {
        if (this.pollTimer) return;
        log.info('Scheduler started', { pollIntervalMs: POLL_INTERVAL_MS });
        this.initializeNextRuns();
        this.pollTimer = setInterval(() => { this.tickPromise = this.tick(); }, POLL_INTERVAL_MS);
        this.tickPromise = this.tick();
    }

    async stop(): Promise<void> {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
        if (this.tickPromise) { await this.tickPromise.catch((err) => log.debug('Pending tick error during shutdown', { error: err instanceof Error ? err.message : String(err) })); this.tickPromise = null; }
        log.info('Scheduler stopped');
    }

    getStats(): {
        running: boolean; activeSchedules: number; pausedSchedules: number;
        runningExecutions: number; maxConcurrent: number; recentFailures: number;
        systemState: SystemStateResult | null; priorityRules: ReturnType<typeof getAllRules>;
    } {
        return {
            running: this.pollTimer !== null,
            activeSchedules: queryCount(this.db, "SELECT COUNT(*) as cnt FROM agent_schedules WHERE status = 'active'"),
            pausedSchedules: queryCount(this.db, "SELECT COUNT(*) as cnt FROM agent_schedules WHERE status = 'paused'"),
            runningExecutions: this.runningExecutions.size,
            maxConcurrent: MAX_CONCURRENT_EXECUTIONS,
            recentFailures: queryCount(this.db, "SELECT COUNT(*) as cnt FROM schedule_executions WHERE status = 'failed' AND started_at >= datetime('now', '-24 hours')"),
            systemState: this.lastSystemState,
            priorityRules: getAllRules(),
        };
    }

    onEvent(callback: ScheduleEventCallback): () => void {
        this.eventCallbacks.add(callback);
        return () => this.eventCallbacks.delete(callback);
    }

    async triggerNow(scheduleId: string): Promise<void> {
        const schedule = getSchedule(this.db, scheduleId);
        if (!schedule) throw new NotFoundError('Schedule', scheduleId);
        if (schedule.status !== 'active') throw new ValidationError('Schedule is not active', { scheduleId, status: schedule.status });
        await this.executeSchedule(schedule);
    }

    cancelExecution(executionId: string): ScheduleExecution | null {
        const execution = getExecution(this.db, executionId);
        if (!execution || execution.status !== 'running') return null;
        if (execution.sessionId) {
            try { this.processManager.stopProcess(execution.sessionId); } catch { /* best-effort */ }
        }
        this.runningExecutions.delete(executionId);
        updateExecutionStatus(this.db, executionId, 'cancelled', { result: 'Cancelled by user' });
        const updated = getExecution(this.db, executionId);
        if (updated) this.emit({ type: 'schedule_execution_update', data: updated });
        return updated;
    }

    resolveApproval(executionId: string, approved: boolean): ScheduleExecution | null {
        const execution = resolveScheduleApproval(this.db, executionId, approved);
        if (!execution) return null;
        this.emit({ type: 'schedule_execution_update', data: execution });
        if (approved) {
            const schedule = getSchedule(this.db, execution.scheduleId);
            if (schedule) this.executeApprovedAction(execution, schedule);
        }
        return execution;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    private resolveScheduleTenantId(agentId: string): string {
        const row = this.db.query('SELECT tenant_id FROM agents WHERE id = ?')
            .get(agentId) as { tenant_id: string } | null;
        return row?.tenant_id ?? DEFAULT_TENANT_ID;
    }

    private initializeNextRuns(): void {
        const schedules = this.db.query(
            `SELECT * FROM agent_schedules WHERE status = 'active' AND next_run_at IS NULL`
        ).all() as Record<string, unknown>[];
        for (const row of schedules) {
            const nextRun = this.calculateNextRun(row.cron_expression as string | null, row.interval_ms as number | null);
            if (nextRun) updateScheduleNextRun(this.db, row.id as string, nextRun);
        }
    }

    private async tick(): Promise<void> {
        cleanExpiredLocks(this.db);
        if (this.runningExecutions.size >= MAX_CONCURRENT_EXECUTIONS) return;

        try { this.lastSystemState = await this.systemStateDetector.evaluate(); }
        catch (err) {
            log.warn('System state evaluation failed', { error: err instanceof Error ? err.message : String(err) });
        }

        const dueSchedules = listDueSchedules(this.db);
        if (dueSchedules.length === 0) return;
        log.info(`Processing ${dueSchedules.length} due schedule(s)`);

        for (const schedule of dueSchedules) {
            if (this.runningExecutions.size >= MAX_CONCURRENT_EXECUTIONS) break;
            if (schedule.maxExecutions !== null && schedule.executionCount >= schedule.maxExecutions) {
                updateSchedule(this.db, schedule.id, { status: 'completed' });
                const updated = getSchedule(this.db, schedule.id);
                if (updated) this.emit({ type: 'schedule_update', data: updated });
                continue;
            }
            await this.executeSchedule(schedule);
        }
    }

    private async executeSchedule(schedule: AgentSchedule): Promise<void> {
        const ctx = createEventContext('scheduler');
        return runWithEventContext(ctx, async () => {
            const tenantId = this.resolveScheduleTenantId(schedule.agentId);
            const agent = getAgent(this.db, schedule.agentId, tenantId);
            if (!agent) { log.warn('Schedule agent not found', { scheduleId: schedule.id, agentId: schedule.agentId }); return; }

            updateScheduleLastRun(this.db, schedule.id);
            updateScheduleNextRun(this.db, schedule.id, this.calculateNextRun(schedule.cronExpression, schedule.intervalMs));
            const updatedSchedule = getSchedule(this.db, schedule.id);
            if (updatedSchedule) this.emit({ type: 'schedule_update', data: updatedSchedule });

            // Pipeline mode: run steps sequentially with shared context.
            if (schedule.executionMode === 'pipeline' && schedule.pipelineSteps?.length) {
                this.notifyScheduleEvent(schedule, 'started',
                    `Pipeline "${schedule.name}" started (${schedule.pipelineSteps.length} steps)`);
                const emitFn = (e: { type: string; data: unknown }) => this.emit(e);
                executePipeline(
                    this.buildRunActionDeps(), this.buildHandlerContext(),
                    schedule, schedule.pipelineSteps, emitFn,
                );
                return;
            }

            // Independent mode (default): run actions independently.
            for (const action of schedule.actions) {
                if (this.runningExecutions.size >= MAX_CONCURRENT_EXECUTIONS) break;

                const execution = createExecution(this.db, schedule.id, schedule.agentId,
                    action.type, action as unknown as Record<string, unknown>,
                    { actions: schedule.actions, approvalPolicy: schedule.approvalPolicy,
                      cronExpression: schedule.cronExpression, intervalMs: schedule.intervalMs });
                this.emit({ type: 'schedule_execution_update', data: execution });
                recordAudit(this.db, 'schedule_execute', schedule.agentId,
                    'schedule_execution', execution.id,
                    `Executing action: ${action.type} for schedule "${schedule.name}"`);

                const emitFn = (e: { type: string; data: unknown }) => this.emit(e);
                if (shouldSkipByHealthGate(this.db, schedule, execution, action, this.lastSystemState, emitFn)) continue;
                if (handleApprovalIfNeeded(this.db, schedule, execution, action, this.notificationService, emitFn)) continue;
                if (handleRepoLocking(this.db, schedule, execution, action, emitFn)) continue;

                this.notifyScheduleEvent(schedule, 'started', `Schedule "${schedule.name}" started: ${action.type}`);
                runAction(this.buildRunActionDeps(), this.buildHandlerContext(), execution.id, schedule, action);
            }
        });
    }

    private buildHandlerContext(): HandlerContext {
        return {
            db: this.db, processManager: this.processManager,
            workTaskService: this.workTaskService, agentMessenger: this.agentMessenger,
            improvementLoopService: this.improvementLoopService,
            reputationScorer: this.reputationScorer, reputationAttestation: this.reputationAttestation,
            outcomeTrackerService: this.outcomeTrackerService, dailyReviewService: this.dailyReviewService,
            systemStateDetector: this.systemStateDetector, runningExecutions: this.runningExecutions,
            resolveScheduleTenantId: (agentId: string) => this.resolveScheduleTenantId(agentId),
        };
    }

    private buildRunActionDeps(): RunActionDeps {
        return {
            db: this.db, agentMessenger: this.agentMessenger,
            runningExecutions: this.runningExecutions,
            consecutiveFailures: this.consecutiveFailures,
            emit: (event) => this.emit(event),
        };
    }

    private async executeApprovedAction(execution: ScheduleExecution, schedule: AgentSchedule): Promise<void> {
        const action = execution.actionInput as unknown as ScheduleAction;
        updateExecutionStatus(this.db, execution.id, 'running');
        const updated = getExecution(this.db, execution.id);
        if (updated) this.emit({ type: 'schedule_execution_update', data: updated });
        await runAction(this.buildRunActionDeps(), this.buildHandlerContext(), execution.id, schedule, action);
    }

    private calculateNextRun(cronExpression: string | null, intervalMs: number | null): string | null {
        if (cronExpression) {
            try { return getNextCronDate(cronExpression).toISOString(); }
            catch (err) { log.warn('Invalid cron expression', { cronExpression, error: String(err) }); return null; }
        }
        if (intervalMs && intervalMs > 0) return new Date(Date.now() + intervalMs).toISOString();
        return null;
    }

    private emit(event: { type: string; data: unknown }): void {
        for (const cb of this.eventCallbacks) {
            try { cb(event as Parameters<ScheduleEventCallback>[0]); }
            catch (err) { log.error('Schedule event callback error', { error: err instanceof Error ? err.message : String(err) }); }
        }
    }

    private notifyScheduleEvent(schedule: AgentSchedule, event: 'started' | 'completed' | 'failed', message: string): void {
        if (!schedule.notifyAddress || !this.agentMessenger) return;
        this.agentMessenger.sendNotificationToAddress(
            schedule.agentId, schedule.notifyAddress, `[schedule:${event}] ${message}`,
        ).catch((err) => {
            log.debug('Schedule notification send failed', {
                scheduleId: schedule.id, notifyAddress: schedule.notifyAddress,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }
}
