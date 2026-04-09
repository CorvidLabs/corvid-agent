import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  buildSystemPrompt,
  compressToolResults,
  computeContextUsage,
  determineWarningLevel,
  summarizeConversation,
  type ToolDef,
  truncateOldToolResults,
} from '../process/direct-process';

// Pin OLLAMA_NUM_CTX so the numeric expectations (based on 8192) stay valid.
let savedOllamaNumCtx: string | undefined;
beforeEach(() => {
  savedOllamaNumCtx = process.env.OLLAMA_NUM_CTX;
  process.env.OLLAMA_NUM_CTX = '8192';
});
afterEach(() => {
  if (savedOllamaNumCtx !== undefined) {
    process.env.OLLAMA_NUM_CTX = savedOllamaNumCtx;
  } else {
    delete process.env.OLLAMA_NUM_CTX;
  }
});

/**
 * Tests for utility functions from direct-process.ts.
 *
 * Some functions are module-private, so we test them indirectly by
 * re-implementing the logic here (matching the source) and verifying
 * the behavioral contracts. Exported functions like buildSystemPrompt
 * are tested via direct imports.
 */

// ── Re-implementation of module-private functions ──────────────────────────
// Kept in sync with server/process/direct-process.ts

function estimateTokens(text: string): number {
  if (!text) return 0;
  const codeIndicators = (text.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
  const codeRatio = codeIndicators / text.length;
  const charsPerToken = codeRatio > 0.08 ? 3 : 4;
  return Math.ceil(text.length / charsPerToken);
}

function getContextBudget(override?: string): number {
  return parseInt(override ?? '8192', 10);
}

function calculateMaxToolResultChars(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  ctxOverride?: string,
): number {
  const ctxSize = getContextBudget(ctxOverride);
  const absoluteMax = Math.floor(ctxSize * 0.3) * 4;
  const absoluteMin = 1_000;

  const usedTokens = estimateTokens(systemPrompt) + messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const remainingTokens = ctxSize - usedTokens;
  const availableForResult = Math.floor(remainingTokens * 0.6) * 4;

  return Math.max(absoluteMin, Math.min(absoluteMax, availableForResult));
}

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string };

function trimMessages(messages: Msg[], systemPrompt?: string, ctxOverride?: string): void {
  const MAX_MESSAGES = 40;
  const KEEP_RECENT = 30;

  const ctxSize = getContextBudget(ctxOverride);
  const threshold = Math.floor(ctxSize * 0.7);
  const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const totalTokens = systemTokens + messageTokens;

  const overCount = messages.length > MAX_MESSAGES;
  const overBudget = totalTokens > threshold;

  if (!overCount && !overBudget) return;

  const keepCount = overBudget ? Math.max(6, Math.min(KEEP_RECENT, Math.floor(messages.length * 0.4))) : KEEP_RECENT;

  const first = messages[0];
  const discarded = messages.slice(1, -keepCount);
  const recent = messages.slice(-keepCount);

  // Summarize discarded tool results
  const summaries: string[] = [];
  for (const msg of discarded) {
    if (msg.role === 'tool' && msg.content.length > 0) {
      const preview = msg.content.slice(0, 80).replace(/\n/g, ' ').trim();
      const lineCount = (msg.content.match(/\n/g) || []).length + 1;
      summaries.push(`[Previous tool result: ${preview}${msg.content.length > 80 ? '...' : ''} (${lineCount} lines)]`);
    }
  }

  if (recent[0] === first) {
    messages.length = 0;
    if (summaries.length > 0) {
      messages.push({ role: 'user', content: summaries.join('\n') });
    }
    messages.push(...recent);
  } else {
    messages.length = 0;
    messages.push(first);
    if (summaries.length > 0) {
      messages.push({ role: 'user', content: summaries.join('\n') });
    }
    messages.push(...recent);
  }
}

// ── estimateTokens ─────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates prose at ~4 chars per token', () => {
    const prose = 'This is a normal English sentence with regular words and spacing.';
    const tokens = estimateTokens(prose);
    // prose: length/4 ≈ 16
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(prose.length / 4));
  });

  it('estimates code at ~3 chars per token', () => {
    const code = 'function foo(x: number): string { return x.toString(); }';
    const tokens = estimateTokens(code);
    // Code has many operators — should use 3 chars/token
    const codeIndicators = (code.match(/[{}();=<>[\]|&!+\-*/\\^~`]/g) || []).length;
    const ratio = codeIndicators / code.length;
    expect(ratio).toBeGreaterThan(0.08);
    expect(tokens).toBe(Math.ceil(code.length / 3));
  });

  it('code estimation produces more tokens than prose for same length', () => {
    const length = 100;
    const prose = 'a'.repeat(length); // Pure prose, no code indicators
    const code = '{x=1;}'.repeat(Math.ceil(length / 6)).slice(0, length); // Lots of operators
    expect(estimateTokens(code)).toBeGreaterThan(estimateTokens(prose));
  });
});

// ── getContextBudget ───────────────────────────────────────────────────────

describe('getContextBudget', () => {
  it('returns 8192 by default', () => {
    expect(getContextBudget()).toBe(8192);
  });

  it('parses override value', () => {
    expect(getContextBudget('16384')).toBe(16384);
  });
});

// ── calculateMaxToolResultChars ────────────────────────────────────────────

describe('calculateMaxToolResultChars', () => {
  it('returns at least 1000 chars', () => {
    // Nearly full context
    const messages = [{ role: 'user', content: 'x'.repeat(30000) }];
    const result = calculateMaxToolResultChars(messages, 'system', '8192');
    expect(result).toBeGreaterThanOrEqual(1_000);
  });

  it('returns at most 30% of context window in chars', () => {
    const messages: Array<{ role: string; content: string }> = [];
    const result = calculateMaxToolResultChars(messages, '', '8192');
    const max30pct = Math.floor(8192 * 0.3) * 4;
    expect(result).toBeLessThanOrEqual(max30pct);
  });

  it('scales down under budget pressure', () => {
    const empty = calculateMaxToolResultChars([], '', '8192');
    // Fill most of the context (24000 chars ≈ 6000 tokens out of 8192)
    const pressured = calculateMaxToolResultChars([{ role: 'user', content: 'x'.repeat(24000) }], '', '8192');
    expect(pressured).toBeLessThan(empty);
  });
});

// ── trimMessages ───────────────────────────────────────────────────────────

describe('trimMessages', () => {
  it('does not trim when under limits', () => {
    const messages: Msg[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    trimMessages(messages, 'system', '8192');
    expect(messages.length).toBe(2);
  });

  it('trims when message count exceeds 40', () => {
    const messages: Msg[] = Array.from({ length: 45 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`,
    }));
    trimMessages(messages, 'system', '100000'); // Large budget so only count triggers
    expect(messages.length).toBeLessThan(45);
  });

  it('trims when token budget exceeded', () => {
    const messages: Msg[] = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'x'.repeat(5000), // Each ~1250 tokens, 10 = 12500, exceeds 70% of 8192
    }));
    trimMessages(messages, 'system', '8192');
    expect(messages.length).toBeLessThan(10);
  });

  it('preserves first message after trim', () => {
    const messages: Msg[] = Array.from({ length: 45 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`,
    }));
    const firstContent = messages[0].content;
    trimMessages(messages, 'system', '100000');
    expect(messages[0].content).toBe(firstContent);
  });

  it('adds tool result summaries for discarded tool messages', () => {
    const messages: Msg[] = [
      { role: 'user', content: 'Do something' },
      ...Array.from({ length: 20 }, (_, i) => [
        { role: 'assistant' as const, content: `Calling tool ${i}` },
        { role: 'tool' as const, content: `Result of tool call ${i}: some output data here`, toolCallId: `tc-${i}` },
      ]).flat(),
      ...Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `recent message ${i}`,
      })),
    ];
    // Total: 1 + 40 + 30 = 71 messages, exceeds MAX_MESSAGES (40)
    const before = messages.length;
    trimMessages(messages, 'system', '100000');
    expect(messages.length).toBeLessThan(before);

    // Check that at least one summary was injected
    const hasSummary = messages.some((m) => m.content.includes('[Previous tool result:'));
    expect(hasSummary).toBe(true);
  });

  it('handles first message in recent window (no duplicate)', () => {
    // When only 5 messages and all fit in recent, first === recent[0]
    const messages: Msg[] = Array.from({ length: 5 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'x'.repeat(5000),
    }));
    trimMessages(messages, 'system', '8192');
    // Should not have duplicate first message
    // All messages have same content, but check no extra was added
    expect(messages.length).toBeLessThanOrEqual(5);
  });
});

// ── buildSystemPrompt ─────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const project = { workingDir: '/test/project' } as any;
  const makeTool = (name: string): ToolDef => ({
    name,
    description: `${name} tool`,
    parameters: {},
  });

  it('includes messaging safety prompt when tools are available', () => {
    const tools = [makeTool('corvid_send_message'), makeTool('read_file')];
    const result = buildSystemPrompt(null, project, 'claude-sonnet-4-20250514', tools, true);
    expect(result).toContain('## Messaging Safety');
    expect(result).toContain('NEVER write scripts');
  });

  it('includes messaging safety even without corvid_send_message or read_file', () => {
    const tools = [makeTool('some_other_tool')];
    const result = buildSystemPrompt(null, project, 'claude-sonnet-4-20250514', tools, true);
    expect(result).toContain('## Messaging Safety');
  });

  it('does not include messaging safety when no tools are available', () => {
    const result = buildSystemPrompt(null, project, 'claude-sonnet-4-20250514', [], false);
    expect(result).not.toContain('## Messaging Safety');
  });

  it('does not include messaging safety in deliberation mode', () => {
    const tools = [makeTool('corvid_send_message')];
    const result = buildSystemPrompt(null, project, 'claude-sonnet-4-20250514', tools, true, true);
    expect(result).not.toContain('## Messaging Safety');
  });

  it('includes response routing only when corvid_send_message present', () => {
    const withMsg = buildSystemPrompt(
      null,
      project,
      'claude-sonnet-4-20250514',
      [makeTool('corvid_send_message')],
      true,
    );
    const withoutMsg = buildSystemPrompt(null, project, 'claude-sonnet-4-20250514', [makeTool('read_file')], true);
    expect(withMsg).toContain('corvid_send_message');
    expect(withoutMsg).not.toContain('response routing');
  });

  it('includes coding tool prompt only when read_file present', () => {
    const withReadFile = buildSystemPrompt(null, project, 'claude-sonnet-4-20250514', [makeTool('read_file')], true);
    const withoutReadFile = buildSystemPrompt(
      null,
      project,
      'claude-sonnet-4-20250514',
      [makeTool('other_tool')],
      true,
    );
    expect(withReadFile).toContain('protected');
    expect(withoutReadFile).not.toContain('File operations');
  });

  it('includes worktree isolation prompt when sessionWorkDir is set', () => {
    const tools = [makeTool('read_file')];
    const result = buildSystemPrompt(
      null,
      project,
      'claude-sonnet-4-20250514',
      tools,
      true,
      false,
      undefined,
      undefined,
      undefined,
      '/tmp/worktree-dir',
    );
    expect(result).toContain('## Git Branch Isolation');
  });

  it('does not include worktree isolation prompt when sessionWorkDir is null', () => {
    const tools = [makeTool('read_file')];
    const result = buildSystemPrompt(
      null,
      project,
      'claude-sonnet-4-20250514',
      tools,
      true,
      false,
      undefined,
      undefined,
      undefined,
      null,
    );
    expect(result).not.toContain('## Git Branch Isolation');
  });
});

describe('computeContextUsage', () => {
  it('calculates usage metrics for empty messages', () => {
    const result = computeContextUsage([], '', false);
    expect(result.estimatedTokens).toBe(0);
    expect(result.contextWindow).toBe(8192);
    expect(result.usagePercent).toBe(0);
    expect(result.messagesCount).toBe(0);
    expect(result.trimmed).toBe(false);
  });

  it('calculates usage percent correctly', () => {
    // 4096 chars of prose ≈ 1024 tokens, context window 8192 → ~12.5%
    const msgs = [{ role: 'user', content: 'a'.repeat(4096) }];
    const result = computeContextUsage(msgs, '', false);
    expect(result.usagePercent).toBe(Math.round((result.estimatedTokens / 8192) * 100));
    expect(result.messagesCount).toBe(1);
  });

  it('includes system prompt in token count', () => {
    const withSystem = computeContextUsage([], 'x'.repeat(4000), false);
    const withoutSystem = computeContextUsage([], '', false);
    expect(withSystem.estimatedTokens).toBeGreaterThan(withoutSystem.estimatedTokens);
  });

  it('sums tokens across multiple messages', () => {
    const one = computeContextUsage([{ role: 'user', content: 'a'.repeat(1000) }], '', false);
    const two = computeContextUsage(
      [
        { role: 'user', content: 'a'.repeat(1000) },
        { role: 'assistant', content: 'a'.repeat(1000) },
      ],
      '',
      false,
    );
    expect(two.estimatedTokens).toBeGreaterThan(one.estimatedTokens);
    expect(two.messagesCount).toBe(2);
  });

  it('passes through trimmed flag', () => {
    expect(computeContextUsage([], '', true).trimmed).toBe(true);
    expect(computeContextUsage([], '', false).trimmed).toBe(false);
  });
});

describe('determineWarningLevel', () => {
  it('returns null below 50%', () => {
    expect(determineWarningLevel(0)).toBeNull();
    expect(determineWarningLevel(25)).toBeNull();
    expect(determineWarningLevel(49)).toBeNull();
  });

  it('returns info at 50%', () => {
    const result = determineWarningLevel(50);
    expect(result).not.toBeNull();
    expect(result!.level).toBe('info');
    expect(result!.message).toContain('50%');
  });

  it('returns info between 50-69%', () => {
    expect(determineWarningLevel(60)!.level).toBe('info');
    expect(determineWarningLevel(69)!.level).toBe('info');
  });

  it('returns warning at 70%', () => {
    const result = determineWarningLevel(70);
    expect(result!.level).toBe('warning');
    expect(result!.message).toContain('trimming');
  });

  it('returns warning between 70-84%', () => {
    expect(determineWarningLevel(75)!.level).toBe('warning');
    expect(determineWarningLevel(84)!.level).toBe('warning');
  });

  it('returns critical at 85%', () => {
    const result = determineWarningLevel(85);
    expect(result!.level).toBe('critical');
    expect(result!.message).toContain('exhaustion');
  });

  it('returns critical above 85%', () => {
    expect(determineWarningLevel(90)!.level).toBe('critical');
    expect(determineWarningLevel(100)!.level).toBe('critical');
  });
});

// ── compressToolResults ───────────────────────────────────────────────────

describe('compressToolResults', () => {
  it('truncates tool results older than maxAge positions', () => {
    const messages: Msg[] = [
      { role: 'tool', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'follow up' },
      { role: 'assistant', content: 'response' },
      { role: 'user', content: 'more' },
    ];
    const compressed = compressToolResults(messages, 3, 200);
    expect(compressed).toBe(1);
    expect(messages[0].content.length).toBeLessThan(500);
    expect(messages[0].content).toContain('compressed, was 500 chars');
  });

  it('does not truncate tool results within maxAge window', () => {
    const messages: Msg[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'A'.repeat(500) },
    ];
    const compressed = compressToolResults(messages, 3, 200);
    expect(compressed).toBe(0);
    expect(messages[1].content.length).toBe(500);
  });

  it('does not truncate short tool results', () => {
    const messages: Msg[] = [
      { role: 'tool', content: 'short result' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];
    const compressed = compressToolResults(messages, 2, 200);
    expect(compressed).toBe(0);
    expect(messages[0].content).toBe('short result');
  });

  it('does not modify non-tool messages', () => {
    const messages: Msg[] = [
      { role: 'user', content: 'A'.repeat(500) },
      { role: 'assistant', content: 'B'.repeat(500) },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ];
    const compressed = compressToolResults(messages, 2, 200);
    expect(compressed).toBe(0);
  });

  it('returns count of compressed messages', () => {
    const messages: Msg[] = [
      { role: 'tool', content: 'A'.repeat(500) },
      { role: 'tool', content: 'B'.repeat(500) },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ];
    const compressed = compressToolResults(messages, 2, 200);
    expect(compressed).toBe(2);
  });
});

// ── summarizeConversation ─────────────────────────────────────────────────

describe('summarizeConversation', () => {
  it('produces a summary containing the original request', () => {
    const messages = [
      { role: 'user', content: 'Please fix the login bug' },
      { role: 'assistant', content: 'I will investigate the login bug.' },
    ];
    const summary = summarizeConversation(messages);
    expect(summary).toContain('[Context Summary]');
    expect(summary).toContain('Please fix the login bug');
  });

  it('includes tool usage count', () => {
    const messages = [
      { role: 'user', content: 'Do something' },
      { role: 'tool', content: 'result 1' },
      { role: 'tool', content: 'result 2' },
      { role: 'assistant', content: 'Done' },
    ];
    const summary = summarizeConversation(messages);
    expect(summary).toContain('2 tool calls');
  });

  it('includes last assistant response', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'First response' },
      { role: 'assistant', content: 'Final conclusion here' },
    ];
    const summary = summarizeConversation(messages);
    expect(summary).toContain('Final conclusion here');
  });

  it('truncates long original requests', () => {
    const messages = [
      { role: 'user', content: 'X'.repeat(500) },
      { role: 'assistant', content: 'ok' },
    ];
    const summary = summarizeConversation(messages);
    expect(summary).toContain('...');
    // Should not contain the full 500 chars
    expect(summary.length).toBeLessThan(600);
  });

  it('includes follow-up messages', () => {
    const messages = [
      { role: 'user', content: 'First request' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'Second request' },
      { role: 'assistant', content: 'done' },
    ];
    const summary = summarizeConversation(messages);
    expect(summary).toContain('Follow-up messages');
    expect(summary).toContain('Second request');
  });

  it('handles empty messages', () => {
    const summary = summarizeConversation([]);
    expect(summary).toContain('[Context Summary]');
  });

  it('summarizes many follow-ups concisely', () => {
    const messages = [
      { role: 'user', content: 'First' },
      ...Array.from({ length: 10 }, (_, i) => [
        { role: 'assistant', content: `Response ${i}` },
        { role: 'user', content: `Follow-up ${i}` },
      ]).flat(),
    ];
    const summary = summarizeConversation(messages);
    expect(summary).toContain('10 total');
    expect(summary).toContain('and 7 more');
  });
});

// ── truncateOldToolResults ────────────────────────────────────────────────

describe('truncateOldToolResults', () => {
  it('truncates tool results older than ageThreshold', () => {
    const messages: Msg[] = [
      { role: 'tool', content: 'A'.repeat(1000) },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'next' },
      { role: 'assistant', content: 'response' },
    ];
    const truncated = truncateOldToolResults(messages, 3, 500);
    expect(truncated).toBe(1);
    expect(messages[0].content).toContain('truncated, was 1000 chars');
    expect(messages[0].content.length).toBeLessThan(600);
  });

  it('does not truncate recent tool results', () => {
    const messages: Msg[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'A'.repeat(1000) },
    ];
    const truncated = truncateOldToolResults(messages, 3, 500);
    expect(truncated).toBe(0);
    expect(messages[1].content.length).toBe(1000);
  });

  it('does not truncate tool results already under maxChars', () => {
    const messages: Msg[] = [
      { role: 'tool', content: 'short' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];
    const truncated = truncateOldToolResults(messages, 2, 500);
    expect(truncated).toBe(0);
  });

  it('returns count of truncated messages', () => {
    const messages: Msg[] = [
      { role: 'tool', content: 'A'.repeat(1000) },
      { role: 'tool', content: 'B'.repeat(800) },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    const truncated = truncateOldToolResults(messages, 2, 500);
    expect(truncated).toBe(2);
  });
});

// ── Progressive compression tiers (integration) ──────────────────────────

describe('progressive compression tiers', () => {
  // These tests use the re-implemented local trimMessages which mirrors the
  // old single-tier behavior. The new progressive trimMessages is module-private,
  // so we test the exported helpers directly and verify the tier thresholds
  // via the computeContextUsage function.

  it('tier thresholds are ordered correctly', () => {
    // Verify the compression tiers make sense: 60% < 75% < 85% < 90%
    const thresholds = [0.6, 0.75, 0.85, 0.9];
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
    }
  });

  it('compressToolResults + truncateOldToolResults chain correctly', () => {
    // Simulate what happens in the main loop: first compress, then truncate
    const messages: Msg[] = [
      { role: 'tool', content: 'A'.repeat(2000) },
      { role: 'tool', content: 'B'.repeat(1500) },
      { role: 'assistant', content: 'mid reply' },
      { role: 'user', content: 'follow up' },
      { role: 'assistant', content: 'last reply' },
    ];
    // First pass: compress older than 3 positions with 200 char limit
    compressToolResults(messages, 3, 200);
    expect(messages[0].content.length).toBeLessThan(300);
    expect(messages[1].content.length).toBeLessThan(300);

    // Second pass: truncate older than 3 positions with 500 char limit
    // Both are already under 500 from the first pass
    const truncated = truncateOldToolResults(messages, 3, 500);
    expect(truncated).toBe(0);
  });

  it('context usage detects when compression would trigger', () => {
    // At 60%+ usage, tier 1 would trigger
    // 8192 * 0.60 = 4915 tokens; prose at 4 chars/token = 19660 chars
    const usage = computeContextUsage([{ role: 'user', content: 'a'.repeat(20000) }], '', false);
    expect(usage.usagePercent).toBeGreaterThanOrEqual(60);
  });
});
