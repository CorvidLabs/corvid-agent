/**
 * Execution lifecycle — wraps action handler dispatch with error handling,
 * failure tracking, notifications, and repo lock management.
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
    updateSchedule,
    getSchedule,
} from '../db/schedules';
import { releaseAllLocks } from '../db/repo-locks';
import { createLogger } from '../lib/logger';
import type { AgentMessenger } from '../algochat/agent-messenger';

import type { HandlerContext } from './handlers/types';
import {
    execStarRepos,
    execForkRepos,
    execReviewPrs,
    execGithubSuggest,
    execWorkTask,
    execCouncilLaunch,
    execSendMessage,
    execCodebaseReview,
    execDependencyAudit,
    execImprovementLoop,
    execMemoryMaintenance,
    execReputationAttestation,
    execOutcomeAnalysis,
    execDailyReview,
    execStatusCheckin,
    execMarketplaceBilling,
    execFlockTesting,
    execCustom,
} from './handlers';

const log = createLogger('Scheduler');
const MAX_CONSECUTIVE_FAILURES = 5;

const BROADCAST_ACTION_TYPES: ScheduleActionType[] = [
    'work_task', 'council_launch', 'daily_review', 'review_prs',
    'github_suggest', 'codebase_review', 'dependency_audit',
    'improvement_loop', 'custom', 'status_checkin', 'flock_testing',
];

/** Dispatch an action to its handler. */
async function dispatchAction(
    hctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
    db: Database,
): Promise<void> {
    switch (action.type) {
        case 'star_repo':              await execStarRepos(hctx, executionId, action); break;
        case 'fork_repo':              await execForkRepos(hctx, executionId, action); break;
        case 'review_prs':             await execReviewPrs(hctx, executionId, schedule, action); break;
        case 'work_task':              await execWorkTask(hctx, executionId, schedule, action); break;
        case 'council_launch':         await execCouncilLaunch(hctx, executionId, schedule, action); break;
        case 'send_message':           await execSendMessage(hctx, executionId, schedule, action); break;
        case 'github_suggest':         await execGithubSuggest(hctx, executionId, schedule, action); break;
        case 'codebase_review':        await execCodebaseReview(hctx, executionId, schedule, action); break;
        case 'dependency_audit':       await execDependencyAudit(hctx, executionId, schedule, action); break;
        case 'improvement_loop':       await execImprovementLoop(hctx, executionId, schedule, action); break;
        case 'memory_maintenance':     await execMemoryMaintenance(hctx, executionId, schedule); break;
        case 'reputation_attestation': await execReputationAttestation(hctx, executionId, schedule); break;
        case 'outcome_analysis':       await execOutcomeAnalysis(hctx, executionId, schedule); break;
        case 'daily_review':           execDailyReview(hctx, executionId, schedule); break;
        case 'status_checkin':         await execStatusCheckin(hctx, executionId, schedule); break;
        case 'marketplace_billing':    execMarketplaceBilling(hctx, executionId); break;
        case 'flock_testing':          await execFlockTesting(hctx, executionId, schedule); break;
        case 'custom':                 await execCustom(hctx, executionId, schedule, action); break;
        default:
            updateExecutionStatus(db, executionId, 'failed', {
                result: `Unknown action type: ${action.type}`,
            });
    }
}

export interface RunActionDeps {
    db: Database;
    agentMessenger: AgentMessenger | null;
    runningExecutions: Set<string>;
    consecutiveFailures: Map<string, number>;
    emit: (event: { type: string; data: unknown }) => void;
}

/**
 * Execute an action with full lifecycle management:
 * dispatch → error handling → lock cleanup → failure tracking → notifications.
 */
export async function runAction(
    deps: RunActionDeps,
    hctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
    deps.runningExecutions.add(executionId);

    try {
        await dispatchAction(hctx, executionId, schedule, action, deps.db);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Schedule action failed', { executionId, actionType: action.type, error: message });
        updateExecutionStatus(deps.db, executionId, 'failed', { result: message });
    } finally {
        releaseAllLocks(deps.db, executionId);
        deps.runningExecutions.delete(executionId);

        const updated = getExecution(deps.db, executionId);
        if (updated) {
            deps.emit({ type: 'schedule_execution_update', data: updated });

            const resultSnippet = updated.result ? updated.result.slice(0, 200) : '';
            if (updated.status === 'completed') {
                notifyScheduleEvent(deps, schedule, 'completed',
                    `Schedule "${schedule.name}" completed (${action.type}): ${resultSnippet}`);
                broadcastScheduleResult(deps.agentMessenger, schedule.agentId, action.type, resultSnippet);
            } else if (updated.status === 'failed') {
                notifyScheduleEvent(deps, schedule, 'failed',
                    `Schedule "${schedule.name}" FAILED (${action.type}): ${resultSnippet}`);
            }

            trackConsecutiveFailures(deps, schedule, updated);
        }
    }
}

function trackConsecutiveFailures(
    deps: RunActionDeps,
    schedule: AgentSchedule,
    execution: ScheduleExecution,
): void {
    if (execution.status === 'failed') {
        const count = (deps.consecutiveFailures.get(schedule.id) ?? 0) + 1;
        deps.consecutiveFailures.set(schedule.id, count);
        if (count >= MAX_CONSECUTIVE_FAILURES) {
            log.warn('Auto-pausing schedule after consecutive failures', {
                scheduleId: schedule.id, failures: count,
            });
            updateSchedule(deps.db, schedule.id, { status: 'paused' });
            deps.consecutiveFailures.delete(schedule.id);
            const pausedSchedule = getSchedule(deps.db, schedule.id);
            if (pausedSchedule) deps.emit({ type: 'schedule_update', data: pausedSchedule });
        }
    } else if (execution.status === 'completed') {
        deps.consecutiveFailures.delete(schedule.id);
    }
}

function broadcastScheduleResult(
    agentMessenger: AgentMessenger | null,
    agentId: string,
    actionType: ScheduleActionType,
    summary: string,
): void {
    if (!agentMessenger) return;
    if (!BROADCAST_ACTION_TYPES.includes(actionType)) return;
    const msg = `[SCHEDULE:${actionType}] ${summary.slice(0, 200)}`;
    agentMessenger.sendOnChainToSelf(agentId, msg)
        .catch((err) => log.debug('AlgoChat schedule notification failed', { error: err instanceof Error ? err.message : String(err) }));
}

function notifyScheduleEvent(
    deps: RunActionDeps,
    schedule: AgentSchedule,
    event: 'started' | 'completed' | 'failed',
    message: string,
): void {
    if (!schedule.notifyAddress || !deps.agentMessenger) return;
    deps.agentMessenger.sendNotificationToAddress(
        schedule.agentId, schedule.notifyAddress,
        `[schedule:${event}] ${message}`,
    ).catch((err) => {
        log.debug('Schedule notification send failed', {
            scheduleId: schedule.id, notifyAddress: schedule.notifyAddress,
            error: err instanceof Error ? err.message : String(err),
        });
    });
}
