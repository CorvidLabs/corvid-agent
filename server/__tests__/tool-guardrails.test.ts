/**
 * Tests for tool guardrails (#1054):
 * - Tool access policy resolution by session source
 * - Expensive networking tool filtering
 * - Per-session messaging rate limiting
 * - Environment variable config loading
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  EXPENSIVE_NETWORKING_TOOLS,
  filterToolsByGuardrail,
  isToolBlockedByGuardrail,
  loadSessionMessageLimits,
  resolveToolAccessPolicy,
  SessionMessageRateLimiter,
  type ToolAccessConfig,
} from '../mcp/tool-guardrails';

// ── Tool Access Policy Resolution ────────────────────────────────────────────

describe('resolveToolAccessPolicy', () => {
  it('returns "full" for web sessions', () => {
    expect(resolveToolAccessPolicy('web')).toBe('full');
  });

  it('returns "restricted" for agent-to-agent sessions', () => {
    expect(resolveToolAccessPolicy('agent')).toBe('restricted');
  });

  it('returns "full" for discord sessions (networking tools available, tier enforcement in handler)', () => {
    expect(resolveToolAccessPolicy('discord')).toBe('full');
  });

  it('returns "full" for telegram sessions', () => {
    expect(resolveToolAccessPolicy('telegram')).toBe('full');
  });

  it('returns "full" for slack sessions', () => {
    expect(resolveToolAccessPolicy('slack')).toBe('full');
  });

  it('returns "full" for algochat sessions', () => {
    expect(resolveToolAccessPolicy('algochat')).toBe('full');
  });

  it('returns "full" for undefined source', () => {
    expect(resolveToolAccessPolicy(undefined)).toBe('full');
  });
});

// ── Tool Blocking ────────────────────────────────────────────────────────────

describe('isToolBlockedByGuardrail', () => {
  it('never blocks tools under "full" policy', () => {
    const config: ToolAccessConfig = { policy: 'full' };
    for (const tool of EXPENSIVE_NETWORKING_TOOLS) {
      expect(isToolBlockedByGuardrail(tool, config)).toBe(false);
    }
  });

  it('blocks expensive tools under "standard" policy', () => {
    const config: ToolAccessConfig = { policy: 'standard' };
    expect(isToolBlockedByGuardrail('corvid_send_message', config)).toBe(true);
    expect(isToolBlockedByGuardrail('corvid_invoke_remote_agent', config)).toBe(true);
    expect(isToolBlockedByGuardrail('corvid_list_agents', config)).toBe(true);
  });

  it('does not block non-expensive tools under "standard" policy', () => {
    const config: ToolAccessConfig = { policy: 'standard' };
    expect(isToolBlockedByGuardrail('corvid_save_memory', config)).toBe(false);
    expect(isToolBlockedByGuardrail('corvid_web_search', config)).toBe(false);
    expect(isToolBlockedByGuardrail('corvid_check_credits', config)).toBe(false);
  });

  it('blocks expensive tools under "restricted" policy', () => {
    const config: ToolAccessConfig = { policy: 'restricted' };
    expect(isToolBlockedByGuardrail('corvid_send_message', config)).toBe(true);
    expect(isToolBlockedByGuardrail('corvid_launch_council', config)).toBe(true);
    expect(isToolBlockedByGuardrail('corvid_flock_directory', config)).toBe(true);
  });

  it('allows explicitly enabled expensive tools under "standard" policy', () => {
    const config: ToolAccessConfig = {
      policy: 'standard',
      allowedExpensiveTools: ['corvid_list_agents'],
    };
    expect(isToolBlockedByGuardrail('corvid_list_agents', config)).toBe(false);
    // Other expensive tools still blocked
    expect(isToolBlockedByGuardrail('corvid_send_message', config)).toBe(true);
  });

  it('allows explicitly enabled expensive tools under "restricted" policy', () => {
    const config: ToolAccessConfig = {
      policy: 'restricted',
      allowedExpensiveTools: ['corvid_send_message', 'corvid_list_agents'],
    };
    expect(isToolBlockedByGuardrail('corvid_send_message', config)).toBe(false);
    expect(isToolBlockedByGuardrail('corvid_list_agents', config)).toBe(false);
    expect(isToolBlockedByGuardrail('corvid_invoke_remote_agent', config)).toBe(true);
  });
});

// ── Filter Tools ─────────────────────────────────────────────────────────────

describe('filterToolsByGuardrail', () => {
  const mockTools = [
    { name: 'corvid_save_memory' },
    { name: 'corvid_send_message' },
    { name: 'corvid_list_agents' },
    { name: 'corvid_web_search' },
    { name: 'corvid_invoke_remote_agent' },
    { name: 'corvid_discover_agent' },
    { name: 'corvid_launch_council' },
    { name: 'corvid_flock_directory' },
    { name: 'corvid_check_credits' },
  ];

  it('returns all tools under "full" policy', () => {
    const filtered = filterToolsByGuardrail(mockTools, { policy: 'full' });
    expect(filtered.length).toBe(mockTools.length);
  });

  it('removes expensive tools under "standard" policy', () => {
    const filtered = filterToolsByGuardrail(mockTools, { policy: 'standard' });
    const names = filtered.map((t) => t.name);

    expect(names).toContain('corvid_save_memory');
    expect(names).toContain('corvid_web_search');
    expect(names).toContain('corvid_check_credits');

    expect(names).not.toContain('corvid_send_message');
    expect(names).not.toContain('corvid_list_agents');
    expect(names).not.toContain('corvid_invoke_remote_agent');
    expect(names).not.toContain('corvid_discover_agent');
    expect(names).not.toContain('corvid_launch_council');
    expect(names).not.toContain('corvid_flock_directory');
  });

  it('keeps explicitly allowed expensive tools under "standard"', () => {
    const filtered = filterToolsByGuardrail(mockTools, {
      policy: 'standard',
      allowedExpensiveTools: ['corvid_list_agents'],
    });
    const names = filtered.map((t) => t.name);

    expect(names).toContain('corvid_list_agents');
    expect(names).not.toContain('corvid_send_message');
  });

  it('preserves the correct count after filtering', () => {
    const filtered = filterToolsByGuardrail(mockTools, { policy: 'standard' });
    // 9 total - 6 expensive = 3 remaining
    expect(filtered.length).toBe(3);
  });
});

// ── EXPENSIVE_NETWORKING_TOOLS set ──────────────────────────────────────────

describe('EXPENSIVE_NETWORKING_TOOLS', () => {
  it('contains the expected tools', () => {
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_send_message')).toBe(true);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_invoke_remote_agent')).toBe(true);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_list_agents')).toBe(true);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_discover_agent')).toBe(true);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_launch_council')).toBe(true);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_flock_directory')).toBe(true);
  });

  it('does not contain non-networking tools', () => {
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_save_memory')).toBe(false);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('corvid_web_search')).toBe(false);
    expect(EXPENSIVE_NETWORKING_TOOLS.has('read_file')).toBe(false);
  });
});

// ── Session Message Rate Limiter ─────────────────────────────────────────────

describe('SessionMessageRateLimiter', () => {
  it('allows messages within budget', () => {
    const limiter = new SessionMessageRateLimiter({
      maxMessagesPerSession: 5,
      maxUniqueTargetsPerSession: 3,
      minIntervalMs: 0,
    });

    expect(limiter.check('agent-a')).toBeNull();
  });

  it('blocks after max messages reached', () => {
    const limiter = new SessionMessageRateLimiter({
      maxMessagesPerSession: 2,
      maxUniqueTargetsPerSession: 10,
      minIntervalMs: 0,
    });

    limiter.record('agent-a');
    limiter.record('agent-a');

    const result = limiter.check('agent-a');
    expect(result).not.toBeNull();
    expect(result).toContain('Session message limit reached');
  });

  it('blocks when unique target limit reached for new agent', () => {
    const limiter = new SessionMessageRateLimiter({
      maxMessagesPerSession: 100,
      maxUniqueTargetsPerSession: 2,
      minIntervalMs: 0,
    });

    limiter.record('agent-a');
    limiter.record('agent-b');

    // Same agent should still be allowed
    expect(limiter.check('agent-a')).toBeNull();

    // New agent should be blocked
    const result = limiter.check('agent-c');
    expect(result).not.toBeNull();
    expect(result).toContain('Session target limit reached');
  });

  it('enforces cooldown between sends', () => {
    const limiter = new SessionMessageRateLimiter({
      maxMessagesPerSession: 100,
      maxUniqueTargetsPerSession: 100,
      minIntervalMs: 10_000,
    });

    limiter.record('agent-a');

    const result = limiter.check('agent-a');
    expect(result).not.toBeNull();
    expect(result).toContain('cooldown');
  });

  it('allows send after cooldown expires', () => {
    const limiter = new SessionMessageRateLimiter({
      maxMessagesPerSession: 100,
      maxUniqueTargetsPerSession: 100,
      minIntervalMs: 1, // 1ms cooldown
    });

    limiter.record('agent-a');

    // Wait for cooldown
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }

    expect(limiter.check('agent-a')).toBeNull();
  });

  it('tracks counts accurately', () => {
    const limiter = new SessionMessageRateLimiter({
      maxMessagesPerSession: 100,
      maxUniqueTargetsPerSession: 100,
      minIntervalMs: 0,
    });

    expect(limiter.getSendCount()).toBe(0);
    expect(limiter.getUniqueTargetCount()).toBe(0);

    limiter.record('agent-a');
    limiter.record('agent-b');
    limiter.record('agent-a');

    expect(limiter.getSendCount()).toBe(3);
    expect(limiter.getUniqueTargetCount()).toBe(2);
  });
});

// ── loadSessionMessageLimits ─────────────────────────────────────────────────

describe('loadSessionMessageLimits', () => {
  const envKeys = ['SESSION_MAX_AGENT_MESSAGES', 'SESSION_MAX_UNIQUE_TARGETS', 'SESSION_MESSAGE_INTERVAL_MS'];

  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('returns correct defaults when no env vars set', () => {
    const config = loadSessionMessageLimits();
    expect(config.maxMessagesPerSession).toBe(5);
    expect(config.maxUniqueTargetsPerSession).toBe(2);
    expect(config.minIntervalMs).toBe(3000);
  });

  it('reads values from environment variables', () => {
    process.env.SESSION_MAX_AGENT_MESSAGES = '10';
    process.env.SESSION_MAX_UNIQUE_TARGETS = '5';
    process.env.SESSION_MESSAGE_INTERVAL_MS = '1000';

    const config = loadSessionMessageLimits();
    expect(config.maxMessagesPerSession).toBe(10);
    expect(config.maxUniqueTargetsPerSession).toBe(5);
    expect(config.minIntervalMs).toBe(1000);
  });

  it('falls back to defaults for invalid values', () => {
    process.env.SESSION_MAX_AGENT_MESSAGES = 'abc';
    process.env.SESSION_MAX_UNIQUE_TARGETS = '';
    process.env.SESSION_MESSAGE_INTERVAL_MS = 'NaN';

    const config = loadSessionMessageLimits();
    expect(config.maxMessagesPerSession).toBe(5);
    expect(config.maxUniqueTargetsPerSession).toBe(2);
    expect(config.minIntervalMs).toBe(3000);
  });

  it('falls back to defaults for zero/negative values (except minIntervalMs)', () => {
    process.env.SESSION_MAX_AGENT_MESSAGES = '0';
    process.env.SESSION_MAX_UNIQUE_TARGETS = '-1';
    process.env.SESSION_MESSAGE_INTERVAL_MS = '0';

    const config = loadSessionMessageLimits();
    expect(config.maxMessagesPerSession).toBe(5);
    expect(config.maxUniqueTargetsPerSession).toBe(2);
    // minIntervalMs allows 0 (disable cooldown)
    expect(config.minIntervalMs).toBe(0);
  });
});
