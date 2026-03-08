/**
 * Per-action orchestration checks: health gating, approval workflows, repo locking.
 *
 * These are evaluated before dispatching each action in a schedule tick.
 */
import type { Database } from 'bun:sqlite';
import type {
    AgentSchedule,
    ScheduleAction,
    ScheduleActionType,
    ScheduleExecution,
} from '../../shared/types';
import {
    updateExecutionStatus,
    getExecution,
} from '../db/schedules';
import { acquireRepoLock, releaseAllLocks } from '../db/repo-locks';
import { recordAudit } from '../db/audit';
import { createLogger } from '../lib/logger';
import type { NotificationService } from '../notifications/service';
import { evaluateAction } from './priority-rules';
import type { SystemStateResult } from './system-state';

const log = createLogger('Scheduler');

type EmitFn = (event: { type: string; data: unknown }) => void;

const DESTRUCTIVE_ACTIONS: ScheduleActionType[] = [
    'work_task', 'github_suggest', 'fork_repo',
    'codebase_review', 'dependency_audit', 'improvement_loop',
];

export function needsApproval(schedule: AgentSchedule, action: ScheduleAction): boolean {
    if (schedule.approvalPolicy === 'auto') return false;
    if (schedule.approvalPolicy === 'owner_approve') return DESTRUCTIVE_ACTIONS.includes(action.type);
    return true; // council_approve
}

export function resolveActionRepos(action: ScheduleAction): string[] {
    const repos: string[] = [];
    if (action.repos?.length) repos.push(...action.repos);
    if (action.projectId && !action.repos?.length) repos.push(`project:${action.projectId}`);
    return repos;
}

export function shouldSkipByHealthGate(
    db: Database,
    schedule: AgentSchedule,
    execution: ScheduleExecution,
    action: ScheduleAction,
    lastSystemState: SystemStateResult | null,
    emit: EmitFn,
): boolean {
    if (!lastSystemState) return false;
    const gate = evaluateAction(action.type, lastSystemState.states);
    if (gate.decision !== 'skip') return false;

    log.info('Action skipped by health gate', {
        scheduleId: schedule.id, executionId: execution.id,
        actionType: action.type, reasons: gate.reasons,
    });
    updateExecutionStatus(db, execution.id, 'cancelled', {
        result: `Skipped by health gate: ${gate.reasons.join('; ')}`,
    });
    const gatedExec = getExecution(db, execution.id);
    if (gatedExec) emit({ type: 'schedule_execution_update', data: gatedExec });
    recordAudit(db, 'schedule_skip', schedule.agentId, 'schedule_execution', execution.id,
        `Action ${action.type} skipped by health gate: ${gate.reasons.join('; ')}`);
    return true;
}

export function handleApprovalIfNeeded(
    db: Database,
    schedule: AgentSchedule,
    execution: ScheduleExecution,
    action: ScheduleAction,
    notificationService: NotificationService | null,
    emit: EmitFn,
): boolean {
    if (!needsApproval(schedule, action)) return false;

    updateExecutionStatus(db, execution.id, 'awaiting_approval');
    const updated = getExecution(db, execution.id);
    emit({
        type: 'schedule_approval_request',
        data: {
            executionId: execution.id, scheduleId: schedule.id,
            agentId: schedule.agentId, actionType: action.type,
            description: action.description ?? `${action.type} on ${action.repos?.join(', ') ?? 'N/A'}`,
        },
    });
    if (updated) emit({ type: 'schedule_execution_update', data: updated });

    if (notificationService) {
        const desc = action.description ?? `${action.type} on ${action.repos?.join(', ') ?? 'N/A'}`;
        notificationService.notify({
            agentId: schedule.agentId,
            title: `Approval needed: ${schedule.name}`,
            message: `Schedule "${schedule.name}" wants to run ${action.type}:\n${desc}\n\nApprove in the dashboard.`,
            level: 'warning',
        }).catch(err => log.warn('Approval notification failed', {
            scheduleId: schedule.id, error: err instanceof Error ? err.message : String(err),
        }));
    }
    return true;
}

export function handleRepoLocking(
    db: Database,
    schedule: AgentSchedule,
    execution: ScheduleExecution,
    action: ScheduleAction,
    emit: EmitFn,
): boolean {
    const repos = resolveActionRepos(action);
    if (repos.length === 0) return false;

    const acquired: string[] = [];
    for (const repo of repos) {
        if (acquireRepoLock(db, repo, execution.id, schedule.id, action.type)) {
            acquired.push(repo);
        } else {
            if (acquired.length > 0) releaseAllLocks(db, execution.id);
            log.info('Action skipped — repo locked', {
                scheduleId: schedule.id, executionId: execution.id, actionType: action.type, blockedRepo: repo,
            });
            updateExecutionStatus(db, execution.id, 'cancelled', {
                result: `Repo "${repo}" is locked by another schedule execution`,
            });
            const skipped = getExecution(db, execution.id);
            if (skipped) emit({ type: 'schedule_execution_update', data: skipped });
            recordAudit(db, 'schedule_skip', schedule.agentId, 'schedule_execution', execution.id,
                `Action ${action.type} skipped: repo "${repo}" locked`);
            return true;
        }
    }
    return false;
}
