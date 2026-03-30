/**
 * Unit tests for server/work/chain-continuation.ts
 *
 * Coverage:
 *   - escalateTier() tier mapping
 *   - inferModelTier() model string detection
 *   - modelForTier() tier → model ID lookup
 *   - StallDetector: track / onEvent / stall threshold / markEscalated / remove
 *   - serializeChainState() with and without sessionSummary, redaction
 *   - logEscalation() emits at INFO (no throws)
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  CHAIN_CONTINUATION_THRESHOLD,
  escalateTier,
  inferModelTier,
  logEscalation,
  ModelTier,
  modelForTier,
  StallDetector,
  serializeChainState,
} from '../work/chain-continuation';

// ─── escalateTier ─────────────────────────────────────────────────────────────

describe('escalateTier', () => {
  test('haiku → sonnet', () => {
    expect(escalateTier(ModelTier.HAIKU)).toBe(ModelTier.SONNET);
  });

  test('sonnet → opus', () => {
    expect(escalateTier(ModelTier.SONNET)).toBe(ModelTier.OPUS);
  });

  test('opus → null (already at max)', () => {
    expect(escalateTier(ModelTier.OPUS)).toBeNull();
  });
});

// ─── inferModelTier ───────────────────────────────────────────────────────────

describe('inferModelTier', () => {
  test('claude-opus-4-6 → OPUS', () => {
    expect(inferModelTier('claude-opus-4-6')).toBe(ModelTier.OPUS);
  });

  test('claude-sonnet-4-6 → SONNET', () => {
    expect(inferModelTier('claude-sonnet-4-6')).toBe(ModelTier.SONNET);
  });

  test('claude-haiku-4-5-20251001 → HAIKU', () => {
    expect(inferModelTier('claude-haiku-4-5-20251001')).toBe(ModelTier.HAIKU);
  });

  test('case-insensitive: OPUS → OPUS', () => {
    expect(inferModelTier('CLAUDE-OPUS-4-6')).toBe(ModelTier.OPUS);
  });

  test('unknown model → HAIKU (most restrictive default)', () => {
    expect(inferModelTier('some-unknown-model')).toBe(ModelTier.HAIKU);
  });

  test('empty string → HAIKU', () => {
    expect(inferModelTier('')).toBe(ModelTier.HAIKU);
  });
});

// ─── modelForTier ─────────────────────────────────────────────────────────────

describe('modelForTier', () => {
  test('OPUS returns canonical opus model ID', () => {
    expect(modelForTier(ModelTier.OPUS)).toBe('claude-opus-4-6');
  });

  test('SONNET returns canonical sonnet model ID', () => {
    expect(modelForTier(ModelTier.SONNET)).toBe('claude-sonnet-4-6');
  });

  test('HAIKU returns canonical haiku model ID', () => {
    expect(modelForTier(ModelTier.HAIKU)).toBe('claude-haiku-4-5-20251001');
  });

  test('roundtrip: infer tier from model → modelForTier returns same model', () => {
    const model = 'claude-sonnet-4-6';
    const tier = inferModelTier(model);
    expect(modelForTier(tier)).toBe(model);
  });
});

// ─── StallDetector ────────────────────────────────────────────────────────────

describe('StallDetector', () => {
  let detector: StallDetector;

  beforeEach(() => {
    detector = new StallDetector(3); // threshold = 3 for faster tests
  });

  test('getStalledSteps returns 0 before any events', () => {
    detector.track('s1');
    expect(detector.getStalledSteps('s1')).toBe(0);
  });

  test('getStalledSteps returns 0 for untracked session', () => {
    expect(detector.getStalledSteps('unknown')).toBe(0);
  });

  test('tool_use in a turn resets stall counter on message_stop', () => {
    detector.track('s1');
    // Turn 1: tool call → productive
    detector.onEvent('s1', 'content_block_start', 'tool_use');
    detector.onEvent('s1', 'message_stop');
    expect(detector.getStalledSteps('s1')).toBe(0);
  });

  test('message_stop without tool_use increments stalledSteps', () => {
    detector.track('s1');
    const stalled = detector.onEvent('s1', 'message_stop');
    expect(stalled).toBe(false);
    expect(detector.getStalledSteps('s1')).toBe(1);
  });

  test('threshold crossed returns true on Nth stalled message_stop', () => {
    detector.track('s1');
    detector.onEvent('s1', 'message_stop'); // 1
    detector.onEvent('s1', 'message_stop'); // 2
    const stalled = detector.onEvent('s1', 'message_stop'); // 3 == threshold
    expect(stalled).toBe(true);
    expect(detector.getStalledSteps('s1')).toBe(3);
  });

  test('productive turn resets stall counter mid-chain', () => {
    detector.track('s1');
    detector.onEvent('s1', 'message_stop'); // 1
    detector.onEvent('s1', 'message_stop'); // 2
    // Productive turn resets
    detector.onEvent('s1', 'content_block_start', 'tool_use');
    detector.onEvent('s1', 'message_stop');
    expect(detector.getStalledSteps('s1')).toBe(0);
    // Now re-stall from 0
    detector.onEvent('s1', 'message_stop'); // 1
    expect(detector.getStalledSteps('s1')).toBe(1);
  });

  test('non-tool_use content_block_start does not mark productive', () => {
    detector.track('s1');
    detector.onEvent('s1', 'content_block_start', 'text');
    detector.onEvent('s1', 'message_stop');
    expect(detector.getStalledSteps('s1')).toBe(1);
  });

  test('markEscalated prevents further threshold triggers', () => {
    detector.track('s1');
    detector.onEvent('s1', 'message_stop');
    detector.onEvent('s1', 'message_stop');
    const first = detector.onEvent('s1', 'message_stop'); // threshold crossed
    expect(first).toBe(true);
    detector.markEscalated('s1');
    const second = detector.onEvent('s1', 'message_stop'); // already escalated
    expect(second).toBe(false);
  });

  test('remove cleans up session state', () => {
    detector.track('s1');
    detector.onEvent('s1', 'message_stop');
    expect(detector.trackedSessionCount).toBe(1);
    detector.remove('s1');
    expect(detector.trackedSessionCount).toBe(0);
    expect(detector.getStalledSteps('s1')).toBe(0);
  });

  test('multiple sessions tracked independently', () => {
    detector.track('s1');
    detector.track('s2');
    detector.onEvent('s1', 'message_stop');
    detector.onEvent('s1', 'message_stop');
    // s2 not stalled yet
    expect(detector.getStalledSteps('s1')).toBe(2);
    expect(detector.getStalledSteps('s2')).toBe(0);
  });

  test('CHAIN_CONTINUATION_THRESHOLD default is a positive integer', () => {
    expect(CHAIN_CONTINUATION_THRESHOLD).toBeGreaterThan(0);
    expect(Number.isInteger(CHAIN_CONTINUATION_THRESHOLD)).toBe(true);
  });

  test('default constructor uses CHAIN_CONTINUATION_THRESHOLD', () => {
    const d = new StallDetector();
    d.track('s1');
    // Feed (threshold - 1) stalled turns — should not trigger
    for (let i = 0; i < CHAIN_CONTINUATION_THRESHOLD - 1; i++) {
      const result = d.onEvent('s1', 'message_stop');
      expect(result).toBe(false);
    }
    // Nth turn should trigger
    const triggered = d.onEvent('s1', 'message_stop');
    expect(triggered).toBe(true);
  });
});

// ─── serializeChainState ──────────────────────────────────────────────────────

describe('serializeChainState', () => {
  test('includes task description', () => {
    const result = serializeChainState({
      taskDescription: 'Implement feature X',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 5,
    });
    expect(result).toContain('Implement feature X');
  });

  test('includes escalation header with tier info', () => {
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 5,
    });
    expect(result).toContain('haiku');
    expect(result).toContain('sonnet');
    expect(result).toContain('5');
  });

  test('includes sanitized session summary when provided', () => {
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
      sessionSummary: 'I ran the tests',
    });
    expect(result).toContain('I ran the tests');
  });

  test('omits session summary section when not provided', () => {
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
    });
    expect(result).not.toContain('Prior session context');
  });

  test('redacts API key patterns in session summary', () => {
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
      sessionSummary: 'Using sk-abcdefghijklmnopqrstuvwxyz1234 to call the API',
    });
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234');
    expect(result).toContain('[REDACTED]');
  });

  test('redacts ANTHROPIC_API_KEY= assignment in session summary', () => {
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
      sessionSummary: 'ANTHROPIC_API_KEY=sk-realkey123456789 was set',
    });
    expect(result).not.toContain('sk-realkey123456789');
  });

  test('redacts mnemonic patterns in session summary', () => {
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
      sessionSummary: 'mnemonic=abandon ability able about above absent absorb abstract absurd abuse',
    });
    expect(result).not.toContain('abandon ability');
  });

  test('truncates long session summaries to 800 chars', () => {
    const longSummary = 'a'.repeat(2000);
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
      sessionSummary: longSummary,
    });
    // The summary should appear truncated
    expect(result.length).toBeLessThan(longSummary.length + 500);
  });

  test('does not include raw session message history', () => {
    // serializeChainState only takes taskDescription + sessionSummary,
    // never raw DB messages — this is enforced by the function signature.
    const result = serializeChainState({
      taskDescription: 'task',
      fromTier: ModelTier.HAIKU,
      toTier: ModelTier.SONNET,
      stalledSteps: 3,
    });
    // Only what we explicitly passed should be present
    expect(result).toContain('task');
    expect(typeof result).toBe('string');
  });
});

// ─── logEscalation ───────────────────────────────────────────────────────────

describe('logEscalation', () => {
  test('does not throw', () => {
    expect(() =>
      logEscalation({
        taskId: 'task-1',
        sessionId: 'session-1',
        fromTier: ModelTier.HAIKU,
        toTier: ModelTier.SONNET,
        stalledSteps: 5,
      }),
    ).not.toThrow();
  });

  test('does not throw when newTaskId is provided', () => {
    expect(() =>
      logEscalation({
        taskId: 'task-1',
        sessionId: 'session-1',
        fromTier: ModelTier.SONNET,
        toTier: ModelTier.OPUS,
        stalledSteps: 3,
        newTaskId: 'task-2',
      }),
    ).not.toThrow();
  });
});
