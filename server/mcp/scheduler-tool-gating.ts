/**
 * Tiered tool gating for scheduler-initiated sessions.
 *
 * Instead of a blanket blocked set, tools are either:
 * - Always blocked (never appropriate for automation)
 * - Gated by action type (allowed for specific schedule actions)
 *
 * This lets scheduled sessions escalate to GitHub issues, create PRs,
 * or comment on PRs when appropriate, while still preventing financial
 * and messaging side effects.
 */

import type { ScheduleActionType } from '../../shared/types/schedules';

/** Tools that are never appropriate for automated scheduler sessions. */
export const SCHEDULER_ALWAYS_BLOCKED = new Set([
    'corvid_grant_credits',
    'corvid_credit_config',
    'corvid_github_fork_repo',
    'corvid_ask_owner',
]);

/**
 * Tools that are blocked by default in scheduler mode but allowed for specific action types.
 * Key: tool name → Value: set of action types that may use the tool.
 */
export const SCHEDULER_GATED_TOOLS: ReadonlyMap<string, ReadonlySet<ScheduleActionType>> = new Map([
    ['corvid_github_create_issue', new Set<ScheduleActionType>(['daily_review', 'improvement_loop', 'custom'])],
    ['corvid_github_create_pr', new Set<ScheduleActionType>(['work_task', 'improvement_loop', 'codebase_review'])],
    ['corvid_github_comment_on_pr', new Set<ScheduleActionType>(['review_prs', 'daily_review'])],
    ['corvid_send_message', new Set<ScheduleActionType>(['send_message', 'status_checkin', 'daily_review', 'custom'])],
]);

/** Max issues a single scheduler session may create (rate limiting). */
export const SCHEDULER_MAX_ISSUES_PER_SESSION = 3;

/** Max PRs a single scheduler session may create (rate limiting). */
export const SCHEDULER_MAX_PRS_PER_SESSION = 3;

/** Max PR comments a single scheduler session may create (rate limiting). */
export const SCHEDULER_MAX_PR_COMMENTS_PER_SESSION = 5;

/** Max messages a single scheduler session may send (rate limiting). */
export const SCHEDULER_MAX_MESSAGES_PER_SESSION = 3;

/** Parse GITHUB_ALLOWED_ORGS env var into a Set (evaluated at call time so tests can set env). */
export function getSchedulerAllowedOrgs(): ReadonlySet<string> {
    return new Set(
        (process.env.GITHUB_ALLOWED_ORGS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    );
}

/**
 * Orgs that scheduled sessions are allowed to create issues/PRs in.
 * @deprecated Use `getSchedulerAllowedOrgs()` for runtime-correct values.
 */
export const SCHEDULER_ALLOWED_ORGS: ReadonlySet<string> = getSchedulerAllowedOrgs();

/** Label automatically applied to issues created by scheduled sessions. */
export const SCHEDULER_ESCALATION_LABEL = 'agent-escalation';

/**
 * Determine whether a tool is blocked for the current scheduler session.
 *
 * @returns true if the tool should be removed from the tool set
 */
export function isToolBlockedForScheduler(
    toolName: string,
    actionType?: ScheduleActionType,
): boolean {
    // Always-blocked tools are blocked regardless of action type
    if (SCHEDULER_ALWAYS_BLOCKED.has(toolName)) return true;

    // Check gated tools
    const allowedActions = SCHEDULER_GATED_TOOLS.get(toolName);
    if (!allowedActions) return false; // Not gated — tool is allowed

    // If no action type is provided, fall back to blocking (conservative default)
    if (!actionType) return true;

    // Tool is allowed only if the action type is in the allowed set
    return !allowedActions.has(actionType);
}

/**
 * Check whether a repo is in an allowed org for scheduler-created issues/PRs.
 * Format: "owner/repo"
 */
export function isRepoAllowedForScheduler(repo: string): boolean {
    const owner = repo.split('/')[0];
    return getSchedulerAllowedOrgs().has(owner);
}

/** Per-tool rate limits for scheduler sessions. */
const SCHEDULER_RATE_LIMITS: Record<string, number> = {
    corvid_github_create_issue: SCHEDULER_MAX_ISSUES_PER_SESSION,
    corvid_github_create_pr: SCHEDULER_MAX_PRS_PER_SESSION,
    corvid_github_comment_on_pr: SCHEDULER_MAX_PR_COMMENTS_PER_SESSION,
    corvid_send_message: SCHEDULER_MAX_MESSAGES_PER_SESSION,
};

/**
 * Check and increment the rate-limit counter for a gated tool.
 * Returns null if allowed, or an error string if the limit has been reached.
 */
export function checkSchedulerRateLimit(
    toolName: string,
    usage: Map<string, number>,
): string | null {
    const limit = SCHEDULER_RATE_LIMITS[toolName];
    if (limit === undefined) return null; // no rate limit for this tool

    const current = usage.get(toolName) ?? 0;
    if (current >= limit) {
        return `Scheduler rate limit reached: max ${limit} ${toolName} calls per session (used ${current})`;
    }
    usage.set(toolName, current + 1);
    return null;
}
