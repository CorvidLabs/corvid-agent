/**
 * Scheduler types — internal server types for the autonomous agent scheduler.
 *
 * Shared wire types live in shared/types.ts; these are the full internal
 * representations with all fields the service needs.
 */

// ─── Action Types ────────────────────────────────────────────────────────────

export type ActionType =
    | 'star_repos'
    | 'fork_repos'
    | 'review_prs'
    | 'work_on_repo'
    | 'suggest_improvements'
    | 'council_review'
    | 'custom';

/** Write actions that require approval when created by agents. */
export const WRITE_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
    'work_on_repo',
    'suggest_improvements',
    'fork_repos',
]);

// ─── Discriminated Action Configs ────────────────────────────────────────────

export interface StarRepoConfig {
    topics: string[];
    language?: string;
    minStars?: number;
    maxPerRun?: number;
}

export interface CustomConfig {
    prompt: string;
}

/** Generic action config — future action types will add their own shapes. */
export type ActionConfig =
    | { type: 'star_repos' } & StarRepoConfig
    | { type: 'custom' } & CustomConfig
    | { type: 'fork_repos'; [key: string]: unknown }
    | { type: 'review_prs'; [key: string]: unknown }
    | { type: 'work_on_repo'; [key: string]: unknown }
    | { type: 'suggest_improvements'; [key: string]: unknown }
    | { type: 'council_review'; [key: string]: unknown };

// ─── Schedule ────────────────────────────────────────────────────────────────

export type ScheduleStatus = 'active' | 'paused' | 'error';
export type ScheduleSource = 'owner' | 'agent';

export interface Schedule {
    id: string;
    name: string;
    actionType: ActionType;
    cronExpression: string;
    agentId: string | null;
    councilId: string | null;
    actionConfig: ActionConfig;
    source: ScheduleSource;
    requiresApproval: boolean;
    maxBudgetUsd: number;
    dailyBudgetUsd: number;
    approvalTimeoutH: number;
    dailyRuns: number;
    dailyCostUsd: number;
    dailyResetDate: string;
    status: ScheduleStatus;
    consecutiveFailures: number;
    nextRunAt: string | null;
    totalRuns: number;
    createdAt: string;
    updatedAt: string;
}

// ─── Schedule Run ────────────────────────────────────────────────────────────

export type ScheduleRunStatus =
    | 'pending'
    | 'running'
    | 'awaiting_approval'
    | 'completed'
    | 'failed'
    | 'interrupted'
    | 'skipped'
    | 'denied';

export interface ScheduleRun {
    id: string;
    scheduleId: string;
    configSnapshot: ActionConfig;
    status: ScheduleRunStatus;
    sessionId: string | null;
    workTaskId: string | null;
    costUsd: number;
    output: Record<string, unknown> | null;
    error: string | null;
    pendingApprovals: Record<string, unknown> | null;
    approvalDecidedBy: string | null;
    approvalDecidedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
}

// ─── WebSocket Events ────────────────────────────────────────────────────────

export type ScheduleEventType =
    | 'run_started'
    | 'run_completed'
    | 'run_failed'
    | 'run_interrupted'
    | 'approval_requested'
    | 'approval_resolved'
    | 'schedule_paused'
    | 'schedule_error';

export interface ScheduleEvent {
    type: 'schedule_event';
    event: ScheduleEventType;
    scheduleId: string;
    runId?: string;
    patch: Partial<Schedule>;
}

// ─── Health Report ───────────────────────────────────────────────────────────

export interface SchedulerHealth {
    running: boolean;
    paused: boolean;
    lastTickAt: string | null;
    activeSchedules: number;
    runningNow: number;
    pendingApprovals: number;
    todayRuns: number;
    todayCostUsd: number;
    nextRunAt: string | null;
}

// ─── Prompt Builder Result ───────────────────────────────────────────────────

export interface PromptBuildResult {
    prompt: string;
    sessionTimeout: number;
}

// ─── Create/Update Inputs ────────────────────────────────────────────────────

export interface CreateScheduleInput {
    name: string;
    actionType: ActionType;
    cronExpression: string;
    agentId?: string | null;
    councilId?: string | null;
    actionConfig: Record<string, unknown>;
    source?: ScheduleSource;
    requiresApproval?: boolean;
    maxBudgetUsd?: number;
    dailyBudgetUsd?: number;
    approvalTimeoutH?: number;
}

export interface UpdateScheduleInput {
    name?: string;
    cronExpression?: string;
    actionConfig?: Record<string, unknown>;
    requiresApproval?: boolean;
    maxBudgetUsd?: number;
    dailyBudgetUsd?: number;
    approvalTimeoutH?: number;
    status?: ScheduleStatus;
}

// ─── Tools blocked in scheduler mode ─────────────────────────────────────────

export const SCHEDULER_BLOCKED_TOOLS: ReadonlySet<string> = new Set([
    'corvid_send_message',
    'corvid_grant_credits',
    'corvid_credit_config',
]);
