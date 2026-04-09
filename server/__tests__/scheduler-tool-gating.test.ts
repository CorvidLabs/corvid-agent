import { describe, expect, test } from 'bun:test';

// Set env vars before importing the module so SCHEDULER_ALLOWED_ORGS is populated at load time
process.env.GITHUB_ALLOWED_ORGS = 'CorvidLabs,corvid-agent';

const {
  isToolBlockedForScheduler,
  isRepoAllowedForScheduler,
  checkSchedulerRateLimit,
  SCHEDULER_ALWAYS_BLOCKED,
  SCHEDULER_GATED_TOOLS,
  SCHEDULER_ESCALATION_LABEL,
  SCHEDULER_MAX_ISSUES_PER_SESSION,
  SCHEDULER_MAX_PRS_PER_SESSION,
  SCHEDULER_MAX_PR_COMMENTS_PER_SESSION,
  SCHEDULER_MAX_MESSAGES_PER_SESSION,
} = await import('../mcp/scheduler-tool-gating');

describe('isToolBlockedForScheduler', () => {
  test('allows corvid_send_message for send_message action', () => {
    expect(isToolBlockedForScheduler('corvid_send_message', 'send_message')).toBe(false);
  });

  test('allows corvid_send_message for status_checkin action', () => {
    expect(isToolBlockedForScheduler('corvid_send_message', 'status_checkin')).toBe(false);
  });

  test('allows corvid_send_message for daily_review action', () => {
    expect(isToolBlockedForScheduler('corvid_send_message', 'daily_review')).toBe(false);
  });

  test('allows corvid_send_message for custom action', () => {
    expect(isToolBlockedForScheduler('corvid_send_message', 'custom')).toBe(false);
  });

  test('blocks corvid_send_message for non-allowed action types', () => {
    expect(isToolBlockedForScheduler('corvid_send_message', 'work_task')).toBe(true);
    expect(isToolBlockedForScheduler('corvid_send_message', 'review_prs')).toBe(true);
    expect(isToolBlockedForScheduler('corvid_send_message', 'improvement_loop')).toBe(true);
  });

  test('blocks corvid_send_message when no action type provided', () => {
    expect(isToolBlockedForScheduler('corvid_send_message')).toBe(true);
  });

  test('always blocks corvid_grant_credits', () => {
    expect(isToolBlockedForScheduler('corvid_grant_credits', 'custom')).toBe(true);
  });

  test('always blocks corvid_credit_config', () => {
    expect(isToolBlockedForScheduler('corvid_credit_config', 'work_task')).toBe(true);
  });

  test('always blocks corvid_github_fork_repo', () => {
    expect(isToolBlockedForScheduler('corvid_github_fork_repo', 'custom')).toBe(true);
  });

  test('always blocks corvid_ask_owner', () => {
    expect(isToolBlockedForScheduler('corvid_ask_owner', 'daily_review')).toBe(true);
  });

  test('allows corvid_github_create_issue for daily_review', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_issue', 'daily_review')).toBe(false);
  });

  test('allows corvid_github_create_issue for improvement_loop', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_issue', 'improvement_loop')).toBe(false);
  });

  test('allows corvid_github_create_issue for custom', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_issue', 'custom')).toBe(false);
  });

  test('blocks corvid_github_create_issue for review_prs', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_issue', 'review_prs')).toBe(true);
  });

  test('blocks corvid_github_create_issue for codebase_review', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_issue', 'codebase_review')).toBe(true);
  });

  test('blocks corvid_github_create_issue when no action type provided', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_issue')).toBe(true);
  });

  test('allows corvid_github_create_pr for work_task', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_pr', 'work_task')).toBe(false);
  });

  test('allows corvid_github_create_pr for improvement_loop', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_pr', 'improvement_loop')).toBe(false);
  });

  test('allows corvid_github_create_pr for codebase_review', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_pr', 'codebase_review')).toBe(false);
  });

  test('blocks corvid_github_create_pr for daily_review', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_pr', 'daily_review')).toBe(true);
  });

  test('blocks corvid_github_create_pr when no action type provided', () => {
    expect(isToolBlockedForScheduler('corvid_github_create_pr')).toBe(true);
  });

  test('allows corvid_github_comment_on_pr for review_prs', () => {
    expect(isToolBlockedForScheduler('corvid_github_comment_on_pr', 'review_prs')).toBe(false);
  });

  test('allows corvid_github_comment_on_pr for daily_review', () => {
    expect(isToolBlockedForScheduler('corvid_github_comment_on_pr', 'daily_review')).toBe(false);
  });

  test('blocks corvid_github_comment_on_pr for custom', () => {
    expect(isToolBlockedForScheduler('corvid_github_comment_on_pr', 'custom')).toBe(true);
  });

  test('allows ungated tools like corvid_web_search', () => {
    expect(isToolBlockedForScheduler('corvid_web_search', 'custom')).toBe(false);
    expect(isToolBlockedForScheduler('corvid_web_search')).toBe(false);
  });

  test('allows corvid_save_memory (not in any blocked set)', () => {
    expect(isToolBlockedForScheduler('corvid_save_memory', 'daily_review')).toBe(false);
  });
});

describe('isRepoAllowedForScheduler', () => {
  test('allows CorvidLabs repos', () => {
    expect(isRepoAllowedForScheduler('CorvidLabs/corvid-agent')).toBe(true);
    expect(isRepoAllowedForScheduler('CorvidLabs/ts-algochat')).toBe(true);
  });

  test('allows corvid-agent org repos', () => {
    expect(isRepoAllowedForScheduler('corvid-agent/a2a-algorand')).toBe(true);
  });

  test('blocks external repos', () => {
    expect(isRepoAllowedForScheduler('anthropics/claude-code')).toBe(false);
    expect(isRepoAllowedForScheduler('0xLeif/Fork')).toBe(false);
  });
});

describe('checkSchedulerRateLimit', () => {
  test('allows calls under the limit', () => {
    const usage = new Map<string, number>();
    expect(checkSchedulerRateLimit('corvid_github_create_issue', usage)).toBeNull();
    expect(usage.get('corvid_github_create_issue')).toBe(1);
  });

  test('allows up to max issues per session', () => {
    const usage = new Map<string, number>();
    for (let i = 0; i < SCHEDULER_MAX_ISSUES_PER_SESSION; i++) {
      expect(checkSchedulerRateLimit('corvid_github_create_issue', usage)).toBeNull();
    }
    expect(usage.get('corvid_github_create_issue')).toBe(SCHEDULER_MAX_ISSUES_PER_SESSION);
  });

  test('blocks after exceeding issue limit', () => {
    const usage = new Map<string, number>([['corvid_github_create_issue', SCHEDULER_MAX_ISSUES_PER_SESSION]]);
    const result = checkSchedulerRateLimit('corvid_github_create_issue', usage);
    expect(result).not.toBeNull();
    expect(result).toContain('rate limit');
  });

  test('blocks after exceeding PR limit', () => {
    const usage = new Map<string, number>([['corvid_github_create_pr', SCHEDULER_MAX_PRS_PER_SESSION]]);
    const result = checkSchedulerRateLimit('corvid_github_create_pr', usage);
    expect(result).not.toBeNull();
    expect(result).toContain('rate limit');
  });

  test('blocks after exceeding PR comment limit', () => {
    const usage = new Map<string, number>([['corvid_github_comment_on_pr', SCHEDULER_MAX_PR_COMMENTS_PER_SESSION]]);
    const result = checkSchedulerRateLimit('corvid_github_comment_on_pr', usage);
    expect(result).not.toBeNull();
  });

  test('allows up to max messages per session', () => {
    const usage = new Map<string, number>();
    for (let i = 0; i < SCHEDULER_MAX_MESSAGES_PER_SESSION; i++) {
      expect(checkSchedulerRateLimit('corvid_send_message', usage)).toBeNull();
    }
    expect(usage.get('corvid_send_message')).toBe(SCHEDULER_MAX_MESSAGES_PER_SESSION);
  });

  test('blocks after exceeding message limit', () => {
    const usage = new Map<string, number>([['corvid_send_message', SCHEDULER_MAX_MESSAGES_PER_SESSION]]);
    const result = checkSchedulerRateLimit('corvid_send_message', usage);
    expect(result).not.toBeNull();
    expect(result).toContain('rate limit');
  });

  test('returns null for tools without rate limits', () => {
    const usage = new Map<string, number>();
    expect(checkSchedulerRateLimit('corvid_save_memory', usage)).toBeNull();
    expect(usage.has('corvid_save_memory')).toBe(false);
  });

  test('tracks each tool independently', () => {
    const usage = new Map<string, number>();
    checkSchedulerRateLimit('corvid_github_create_issue', usage);
    checkSchedulerRateLimit('corvid_github_create_pr', usage);
    expect(usage.get('corvid_github_create_issue')).toBe(1);
    expect(usage.get('corvid_github_create_pr')).toBe(1);
  });
});

describe('constants', () => {
  test('SCHEDULER_ALWAYS_BLOCKED contains expected tools', () => {
    expect(SCHEDULER_ALWAYS_BLOCKED.has('corvid_grant_credits')).toBe(true);
    expect(SCHEDULER_ALWAYS_BLOCKED.has('corvid_credit_config')).toBe(true);
    expect(SCHEDULER_ALWAYS_BLOCKED.has('corvid_github_fork_repo')).toBe(true);
    expect(SCHEDULER_ALWAYS_BLOCKED.has('corvid_ask_owner')).toBe(true);
  });

  test('corvid_send_message is gated, not always blocked', () => {
    expect(SCHEDULER_ALWAYS_BLOCKED.has('corvid_send_message')).toBe(false);
    expect(SCHEDULER_GATED_TOOLS.has('corvid_send_message')).toBe(true);
  });

  test('SCHEDULER_GATED_TOOLS contains 4 tools', () => {
    expect(SCHEDULER_GATED_TOOLS.size).toBe(4);
  });

  test('SCHEDULER_ESCALATION_LABEL is agent-escalation', () => {
    expect(SCHEDULER_ESCALATION_LABEL).toBe('agent-escalation');
  });
});
