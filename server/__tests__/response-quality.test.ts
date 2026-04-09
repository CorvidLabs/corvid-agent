import { describe, expect, test } from 'bun:test';
import {
  buildLoopNudge,
  buildQualityNudge,
  buildRepetitionNudge,
  countVacuousToolCalls,
  RepetitionTracker,
  RepetitiveToolCallDetector,
  ResponseQualityTracker,
  scoreResponseQuality,
  type ToolCallQualityInput,
} from '../lib/response-quality';

// ── scoreResponseQuality ─────────────────────────────────────────────────

describe('scoreResponseQuality', () => {
  test('empty text with tool calls scores 1.0', () => {
    const result = scoreResponseQuality('', true);
    expect(result.score).toBe(1.0);
    expect(result.signals).toContain('has_tool_calls');
  });

  test('empty text without tool calls scores 0.0', () => {
    const result = scoreResponseQuality('', false);
    expect(result.score).toBe(0.0);
  });

  test('pure cheerleading text scores low', () => {
    const text = "Great idea! I'm excited to help you with this! This is going to be amazing! Let's dive in!";
    const result = scoreResponseQuality(text, false);
    expect(result.score).toBeLessThan(0.35);
    expect(result.signals).toContain('cheerleading_phrases');
    expect(result.signals).toContain('high_exclamation_ratio');
  });

  test('substantive response with code blocks scores high', () => {
    const text =
      'I found the bug in `server/lib/crypto.ts`. The `hashPassword` function was using MD5:\n\n```typescript\nexport function hashPassword(pass: string): string {\n  return crypto.createHash("sha256").update(pass).digest("hex");\n}\n```';
    const result = scoreResponseQuality(text, false);
    expect(result.score).toBeGreaterThan(0.6);
    expect(result.signals).toContain('has_code_blocks');
    expect(result.signals).toContain('has_file_references');
  });

  test('response with file references scores higher than without', () => {
    const withRefs = 'The issue is in server/process/direct-process.ts at line 745.';
    const withoutRefs = 'The issue is somewhere in the codebase I think.';
    const scoreWithRefs = scoreResponseQuality(withRefs, false);
    const scoreWithoutRefs = scoreResponseQuality(withoutRefs, false);
    expect(scoreWithRefs.score).toBeGreaterThan(scoreWithoutRefs.score);
  });

  test('response with concrete class/function references scores higher', () => {
    const concrete = 'The ProcessManager class needs to call the ResponseQualityTracker before emitting events.';
    const vague = 'The thing needs to call the other thing before doing stuff.';
    const concretScore = scoreResponseQuality(concrete, false);
    const vagueScore = scoreResponseQuality(vague, false);
    expect(concretScore.score).toBeGreaterThan(vagueScore.score);
  });

  test('tool calls boost score significantly', () => {
    const text = 'Let me check that file.';
    const withTools = scoreResponseQuality(text, true);
    const withoutTools = scoreResponseQuality(text, false);
    expect(withTools.score).toBeGreaterThan(withoutTools.score);
  });

  test('restatement patterns reduce score', () => {
    const text =
      "You've asked me to review the code. As you mentioned, your request is to check the tests. Your task involves testing.";
    const result = scoreResponseQuality(text, false);
    expect(result.signals).toContain('restatement');
    expect(result.score).toBeLessThan(0.5);
  });

  test('action items boost score', () => {
    const text = 'Here is the plan:\n1. Fix the auth middleware\n2. Update the tests\n- [ ] Deploy to staging';
    const result = scoreResponseQuality(text, false);
    expect(result.signals).toContain('has_action_items');
  });

  test('single cheerleading phrase with substance still scores okay', () => {
    const text =
      "Great question! The `hashPassword` function in server/lib/crypto.ts uses SHA-256:\n\n```typescript\ncrypto.createHash('sha256')\n```";
    const result = scoreResponseQuality(text, false);
    // Should not be flagged as low-quality because there's real substance
    expect(result.score).toBeGreaterThan(0.35);
  });

  test('score is clamped between 0 and 1', () => {
    // Very positive — should not exceed 1.0
    const highText =
      '```ts\nconst x = 1;\n```\nSee server/lib/foo.ts line 42. The ProcessManager class handles this.\n1. Step one\n2. Step two';
    const high = scoreResponseQuality(highText, true);
    expect(high.score).toBeLessThanOrEqual(1.0);

    // Very negative — should not go below 0
    const lowText = "Great idea! I'm excited! This is going to be amazing! Absolutely! Let's do this! Sounds great!";
    const low = scoreResponseQuality(lowText, false);
    expect(low.score).toBeGreaterThanOrEqual(0.0);
  });
});

// ── countVacuousToolCalls ────────────────────────────────────────────────

describe('countVacuousToolCalls', () => {
  test('returns 0 for substantive tool calls', () => {
    const calls: ToolCallQualityInput[] = [
      { name: 'read_file', arguments: { path: 'server/lib/crypto.ts' } },
      { name: 'run_command', arguments: { command: 'bun test' } },
    ];
    expect(countVacuousToolCalls(calls)).toBe(0);
  });

  test('detects save_memory with empty content', () => {
    const calls: ToolCallQualityInput[] = [{ name: 'save_memory', arguments: { content: 'ok' } }];
    expect(countVacuousToolCalls(calls)).toBe(1);
  });

  test('does not flag save_memory with real content', () => {
    const calls: ToolCallQualityInput[] = [
      {
        name: 'save_memory',
        arguments: {
          content: 'The auth middleware stores session tokens in localStorage which violates compliance requirements.',
        },
      },
    ];
    expect(countVacuousToolCalls(calls)).toBe(0);
  });

  test('detects corvid_manage_workflow with vacuous notes', () => {
    const calls: ToolCallQualityInput[] = [
      { name: 'corvid_manage_workflow', arguments: { status: 'in_progress', notes: 'working on it' } },
    ];
    expect(countVacuousToolCalls(calls)).toBe(1);
  });

  test('detects corvid_manage_workflow with very short notes', () => {
    const calls: ToolCallQualityInput[] = [
      { name: 'corvid_manage_workflow', arguments: { status: 'in_progress', notes: 'doing stuff' } },
    ];
    expect(countVacuousToolCalls(calls)).toBe(1);
  });

  test('does not flag workflow with substantive notes', () => {
    const calls: ToolCallQualityInput[] = [
      {
        name: 'corvid_manage_workflow',
        arguments: { status: 'in_progress', notes: 'Refactored hashPassword to use SHA-256, updated 3 call sites' },
      },
    ];
    expect(countVacuousToolCalls(calls)).toBe(0);
  });

  test('counts multiple vacuous calls', () => {
    const calls: ToolCallQualityInput[] = [
      { name: 'corvid_manage_workflow', arguments: { status: 'in_progress', notes: 'checking...' } },
      { name: 'save_memory', arguments: { content: 'yes' } },
      { name: 'read_file', arguments: { path: 'server/lib/crypto.ts' } },
    ];
    expect(countVacuousToolCalls(calls)).toBe(2);
  });

  test('detects corvid_save_memory with empty content', () => {
    const calls: ToolCallQualityInput[] = [{ name: 'corvid_save_memory', arguments: { value: 'ok' } }];
    expect(countVacuousToolCalls(calls)).toBe(1);
  });
});

// ── ResponseQualityTracker ───────────────────────────────────────────────

describe('ResponseQualityTracker', () => {
  test('does not trigger nudge on first low-quality response', () => {
    const tracker = new ResponseQualityTracker();
    const shouldNudge = tracker.recordResponse({ score: 0.1, signals: ['cheerleading_phrases'] });
    expect(shouldNudge).toBe(false);
  });

  test('triggers nudge after 2 consecutive low-quality responses', () => {
    const tracker = new ResponseQualityTracker();
    tracker.recordResponse({ score: 0.2, signals: ['cheerleading_phrases'] });
    const shouldNudge = tracker.recordResponse({ score: 0.1, signals: ['cheerleading_phrases', 'no_code_blocks'] });
    expect(shouldNudge).toBe(true);
  });

  test('resets consecutive count on good response', () => {
    const tracker = new ResponseQualityTracker();
    tracker.recordResponse({ score: 0.2, signals: ['cheerleading_phrases'] });
    tracker.recordResponse({ score: 0.8, signals: ['has_code_blocks', 'has_file_references'] });
    const shouldNudge = tracker.recordResponse({ score: 0.1, signals: ['cheerleading_phrases'] });
    expect(shouldNudge).toBe(false);
  });

  test('tracks total low-quality responses across resets', () => {
    const tracker = new ResponseQualityTracker();
    tracker.recordResponse({ score: 0.2, signals: [] });
    tracker.recordResponse({ score: 0.8, signals: [] }); // reset
    tracker.recordResponse({ score: 0.1, signals: [] });
    const metrics = tracker.getMetrics();
    expect(metrics.totalLowQualityResponses).toBe(2);
  });

  test('tracks vacuous tool calls', () => {
    const tracker = new ResponseQualityTracker();
    tracker.recordVacuousToolCalls(3);
    tracker.recordVacuousToolCalls(1);
    expect(tracker.getMetrics().totalVacuousToolCalls).toBe(4);
  });

  test('incrementNudgeCount returns incremented value', () => {
    const tracker = new ResponseQualityTracker();
    expect(tracker.incrementNudgeCount()).toBe(1);
    expect(tracker.incrementNudgeCount()).toBe(2);
    expect(tracker.getMetrics().qualityNudgeCount).toBe(2);
  });

  test('custom threshold and trigger values', () => {
    const tracker = new ResponseQualityTracker(0.5, 3);
    // Score 0.4 < threshold 0.5
    tracker.recordResponse({ score: 0.4, signals: [] });
    tracker.recordResponse({ score: 0.3, signals: [] });
    const shouldNudge2 = tracker.recordResponse({ score: 0.2, signals: [] });
    expect(shouldNudge2).toBe(true); // trigger = 3
  });

  test('does not trigger at threshold boundary (score === threshold)', () => {
    const tracker = new ResponseQualityTracker(0.35, 2);
    tracker.recordResponse({ score: 0.35, signals: [] });
    const shouldNudge = tracker.recordResponse({ score: 0.35, signals: [] });
    // score === threshold is NOT less than, so should not trigger
    expect(shouldNudge).toBe(false);
  });
});

// ── buildQualityNudge ────────────────────────────────────────────────────

describe('buildQualityNudge', () => {
  test('returns a non-empty corrective message', () => {
    const nudge = buildQualityNudge();
    expect(nudge.length).toBeGreaterThan(0);
    expect(nudge).toContain('STOP');
    expect(nudge).toContain('filler');
  });
});

// ── RepetitiveToolCallDetector ────────────────────────────────────────────

describe('RepetitiveToolCallDetector', () => {
  test('does not trigger for distinct tool calls', () => {
    const detector = new RepetitiveToolCallDetector();
    const result1 = detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    const result2 = detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'b.ts' } }]);
    const result3 = detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'c.ts' } }]);
    expect(result1).toBe(false);
    expect(result2).toBe(false);
    expect(result3).toBe(false);
  });

  test('triggers after N identical tool calls', () => {
    const detector = new RepetitiveToolCallDetector(3);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    const result = detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    expect(result).toBe(true);
    expect(detector.loopDetected).toBe(true);
    expect(detector.totalLoopsDetected).toBe(1);
  });

  test('does not trigger when args differ', () => {
    const detector = new RepetitiveToolCallDetector(3);
    detector.recordToolCalls([{ name: 'search', arguments: { query: 'foo' } }]);
    detector.recordToolCalls([{ name: 'search', arguments: { query: 'bar' } }]);
    const result = detector.recordToolCalls([{ name: 'search', arguments: { query: 'foo' } }]);
    expect(result).toBe(false);
  });

  test('reset clears state', () => {
    const detector = new RepetitiveToolCallDetector(3);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    detector.reset();
    const result = detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    expect(result).toBe(false);
    expect(detector.loopDetected).toBe(false);
  });

  test('tracks total loops across resets', () => {
    const detector = new RepetitiveToolCallDetector(2);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    expect(detector.totalLoopsDetected).toBe(1);
    detector.reset();
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'b.ts' } }]);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'b.ts' } }]);
    expect(detector.totalLoopsDetected).toBe(2);
  });

  test('respects window size — old calls fall off', () => {
    const detector = new RepetitiveToolCallDetector(3, 4);
    // Fill window with different calls, then repeat
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'a.ts' } }]);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'b.ts' } }]);
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'c.ts' } }]);
    // Now repeat c.ts — the first 'a.ts' has fallen off, window is [b, c, c]
    detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'c.ts' } }]);
    // Only 2 consecutive c.ts, not 3 — should not trigger
    expect(detector.loopDetected).toBe(false);
    // One more c.ts → window is [c, c, c, c] → triggers
    const result = detector.recordToolCalls([{ name: 'read_file', arguments: { path: 'c.ts' } }]);
    expect(result).toBe(true);
  });

  test('arg order does not affect fingerprint', () => {
    const detector = new RepetitiveToolCallDetector(2);
    detector.recordToolCalls([{ name: 'search', arguments: { query: 'foo', limit: 10 } }]);
    const result = detector.recordToolCalls([{ name: 'search', arguments: { limit: 10, query: 'foo' } }]);
    expect(result).toBe(true);
  });
});

// ── buildLoopNudge ──────────────────────────────────────────────────────

describe('buildLoopNudge', () => {
  test('includes tool name in message', () => {
    const nudge = buildLoopNudge('read_file');
    expect(nudge).toContain('read_file');
    expect(nudge).toContain('STOP');
    expect(nudge).toContain('DIFFERENT');
  });
});

// ── ResponseQualityTracker nudge exhaustion ─────────────────────────────

describe('ResponseQualityTracker nudge exhaustion', () => {
  test('nudgesExhausted is false by default', () => {
    const tracker = new ResponseQualityTracker();
    expect(tracker.nudgesExhausted).toBe(false);
    expect(tracker.getMetrics().nudgesExhausted).toBe(false);
  });

  test('markNudgesExhausted sets the flag', () => {
    const tracker = new ResponseQualityTracker();
    tracker.markNudgesExhausted();
    expect(tracker.nudgesExhausted).toBe(true);
    expect(tracker.getMetrics().nudgesExhausted).toBe(true);
  });
});

// ── RepetitionTracker ────────────────────────────────────────────────────

describe('RepetitionTracker', () => {
  test('returns null for first response', () => {
    const tracker = new RepetitionTracker();
    expect(tracker.recordResponse('I will investigate the login bug in the auth module.')).toBeNull();
  });

  test('returns null for distinct responses', () => {
    const tracker = new RepetitionTracker();
    tracker.recordResponse('I will investigate the login bug in the auth module.');
    expect(tracker.recordResponse('The error is in server/lib/crypto.ts on line 42. Here is the fix.')).toBeNull();
  });

  test('returns nudge for rephrased responses', () => {
    const tracker = new RepetitionTracker();
    tracker.recordResponse(
      'I will look into the login bug and investigate the authentication module to find the root cause.',
    );
    const action = tracker.recordResponse(
      'Let me investigate the login bug in the authentication module and look into the root cause of the issue.',
    );
    expect(action).toBe('nudge');
  });

  test('returns break after 3 consecutive repetitions', () => {
    const tracker = new RepetitionTracker(3, 3);
    const base = 'I will investigate the login bug and find the root cause in the authentication system.';
    tracker.recordResponse(base);
    expect(
      tracker.recordResponse('Let me investigate the login bug and find the root cause in the authentication system.'),
    ).toBe('nudge');
    expect(
      tracker.recordResponse('I am investigating the login bug to find the root cause in the authentication system.'),
    ).toBe('nudge');
    expect(
      tracker.recordResponse('Looking into the login bug, investigating the root cause in the authentication system.'),
    ).toBe('break');
  });

  test('resets consecutive count on novel response', () => {
    const tracker = new RepetitionTracker();
    tracker.recordResponse('I will investigate the login bug and find the root cause.');
    tracker.recordResponse('Let me investigate the login bug and find the root cause of the issue.');
    // Now a genuinely different response
    tracker.recordResponse(
      'Here is the fix:\n```ts\nfunction hashPassword(pass: string) { return sha256(pass); }\n```',
    );
    // Next repetition should be back to nudge, not break
    tracker.recordResponse('I will investigate the login bug and find the root cause of the issue.');
    expect(tracker.getMetrics().consecutiveRepetitions).toBe(1);
  });

  test('ignores very short responses', () => {
    const tracker = new RepetitionTracker();
    tracker.recordResponse('ok');
    expect(tracker.recordResponse('ok')).toBeNull();
  });

  test('tracks total repetitions across resets', () => {
    const tracker = new RepetitionTracker();
    tracker.recordResponse('I will investigate the login bug and find the root cause in the authentication system.');
    tracker.recordResponse('Let me investigate the login bug and find the root cause in the authentication system.');
    // Reset with novel response
    tracker.recordResponse('Here is the fix in server/lib/auth.ts:\n```ts\nconst token = generateSecureToken();\n```');
    // Another repetition
    tracker.recordResponse('Let me investigate the login bug and find the root cause in the authentication system.');
    expect(tracker.getMetrics().totalRepetitions).toBe(2);
  });
});

// ── buildRepetitionNudge ─────────────────────────────────────────────────

describe('buildRepetitionNudge', () => {
  test('returns a non-empty corrective message about repetition', () => {
    const nudge = buildRepetitionNudge();
    expect(nudge.length).toBeGreaterThan(0);
    expect(nudge).toContain('repeating');
  });
});

// ── buildSessionMetrics integration ──────────────────────────────────────

describe('buildSessionMetrics with quality metrics', () => {
  // Import here to test the integration
  const { buildSessionMetrics } = require('../process/direct-process');

  test('includes quality metrics when provided', () => {
    const m = buildSessionMetrics({
      model: 'llama3.1:70b',
      tier: 'standard',
      iteration: 5,
      toolCallCount: 12,
      maxChainDepth: 4,
      nudgeCount: 1,
      midChainNudgeCount: 0,
      totalExplorationDrifts: 0,
      stallType: null,
      terminationReason: 'normal',
      loopDurationMs: 15000,
      needsSummary: false,
      qualityMetrics: {
        totalLowQualityResponses: 3,
        totalVacuousToolCalls: 2,
        qualityNudgeCount: 1,
        nudgesExhausted: false,
      },
    });
    expect(m.totalLowQualityResponses).toBe(3);
    expect(m.totalVacuousToolCalls).toBe(2);
    expect(m.qualityNudgeCount).toBe(1);
  });

  test('detects stall_repetitive as stallDetected', () => {
    const m = buildSessionMetrics({
      model: 'qwen3:14b',
      tier: 'standard',
      iteration: 8,
      toolCallCount: 0,
      maxChainDepth: 0,
      nudgeCount: 0,
      midChainNudgeCount: 0,
      totalExplorationDrifts: 0,
      stallType: 'repetitive',
      terminationReason: 'stall_repetitive',
      loopDurationMs: 30000,
      needsSummary: true,
    });
    expect(m.stallDetected).toBe(true);
    expect(m.stallType).toBe('repetitive');
    expect(m.terminationReason).toBe('stall_repetitive');
  });

  test('defaults quality metrics to 0 when not provided', () => {
    const m = buildSessionMetrics({
      model: 'llama3.1:70b',
      tier: 'standard',
      iteration: 5,
      toolCallCount: 12,
      maxChainDepth: 4,
      nudgeCount: 1,
      midChainNudgeCount: 0,
      totalExplorationDrifts: 0,
      stallType: null,
      terminationReason: 'normal',
      loopDurationMs: 15000,
      needsSummary: false,
    });
    expect(m.totalLowQualityResponses).toBe(0);
    expect(m.totalVacuousToolCalls).toBe(0);
    expect(m.qualityNudgeCount).toBe(0);
  });
});
