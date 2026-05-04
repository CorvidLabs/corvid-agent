import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { addSessionMessage, createSession, getSession } from '../db/sessions';
import { ProcessManager } from '../process/manager';
import type { TurnCompleteMetrics } from '../process/sdk-process';

/**
 * Tests for warm-turn context token tracking.
 *
 * Verifies that handleTurnComplete updates context tokens in the DB
 * after each keep-alive warm turn, using SDK metrics when available
 * and falling back to message-based estimation with system overhead.
 */

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query(
    `INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'claude-opus-4-6', 'test')`,
  ).run(AGENT_ID);
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
  const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Test' });
  sessionId = session.id;
  // Seed sessionMeta so handleTurnComplete can find it
  (pm as any)?.shutdown?.();
  pm = new ProcessManager(db);
  const meta = {
    startedAt: Date.now(),
    source: 'web',
    restartCount: 0,
    lastKnownCostUsd: 0,
    turnCount: 0,
    lastActivityAt: Date.now(),
  };
  (pm as any).sessionMeta.set(sessionId, meta);
});

afterEach(() => {
  pm.shutdown();
  db.close();
});

describe('handleTurnComplete context token updates', () => {
  test('updates DB with SDK-provided inputTokens and contextWindow', () => {
    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.5,
      durationMs: 3000,
      numTurns: 3,
      inputTokens: 45000,
      contextWindow: 200000,
    };

    (pm as any).handleTurnComplete(sessionId, metrics);

    const session = getSession(db, sessionId);
    expect(session).not.toBeNull();
    expect(session!.lastContextTokens).toBe(45000);
    expect(session!.lastContextWindow).toBe(200000);
  });

  test('updates meta.lastContextUsagePercent from SDK metrics', () => {
    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.1,
      durationMs: 1000,
      numTurns: 1,
      inputTokens: 50000,
      contextWindow: 200000,
    };

    (pm as any).handleTurnComplete(sessionId, metrics);

    const meta = (pm as any).sessionMeta.get(sessionId);
    expect(meta.lastContextUsagePercent).toBe(25); // 50k / 200k = 25%
  });

  test('falls back to message-based estimation when SDK tokens missing', () => {
    // Add some messages so the fallback has data
    addSessionMessage(db, sessionId, 'user', 'Hello, how are you doing today?');
    addSessionMessage(db, sessionId, 'assistant', 'I am doing well! How can I help you with your project?');
    addSessionMessage(db, sessionId, 'user', 'Can you fix the bug in the authentication module?');
    addSessionMessage(db, sessionId, 'assistant', 'Sure, let me look at the authentication code and find the issue.');

    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.1,
      durationMs: 1000,
      numTurns: 1,
      // No inputTokens or contextWindow — SDK didn't provide them
    };

    (pm as any).handleTurnComplete(sessionId, metrics);

    const session = getSession(db, sessionId);
    expect(session).not.toBeNull();
    // Should be > 0 (messages + system overhead)
    expect(session!.lastContextTokens).toBeGreaterThan(0);
    // System overhead alone is 12k, so total should be well above raw message tokens
    expect(session!.lastContextTokens!).toBeGreaterThan(12000);
    expect(session!.lastContextWindow).toBeGreaterThan(0);
  });

  test('marks session as idle on turn complete', () => {
    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.1,
      durationMs: 1000,
      numTurns: 1,
      inputTokens: 10000,
      contextWindow: 200000,
    };

    (pm as any).handleTurnComplete(sessionId, metrics);

    const session = getSession(db, sessionId);
    expect(session!.status).toBe('idle');
  });

  test('context tokens grow with more messages', () => {
    // First turn with few messages
    addSessionMessage(db, sessionId, 'user', 'Hello');
    addSessionMessage(db, sessionId, 'assistant', 'Hi!');

    const metrics1: TurnCompleteMetrics = {
      totalCostUsd: 0.05,
      durationMs: 500,
      numTurns: 1,
    };

    (pm as any).handleTurnComplete(sessionId, metrics1);
    const session1 = getSession(db, sessionId);
    const tokens1 = session1!.lastContextTokens!;

    // Add more messages for second turn
    for (let i = 0; i < 20; i++) {
      addSessionMessage(
        db,
        sessionId,
        'user',
        `Message ${i}: This is a longer message to simulate real conversation content.`,
      );
      addSessionMessage(
        db,
        sessionId,
        'assistant',
        `Response ${i}: Here is a detailed response with some analysis and recommendations.`,
      );
    }

    (pm as any).handleTurnComplete(sessionId, metrics1);
    const session2 = getSession(db, sessionId);
    const tokens2 = session2!.lastContextTokens!;

    expect(tokens2).toBeGreaterThan(tokens1);
  });

  test('SDK metrics take precedence over fallback', () => {
    // Add messages that would produce a fallback estimate
    addSessionMessage(db, sessionId, 'user', 'Hello');
    addSessionMessage(db, sessionId, 'assistant', 'Hi!');

    const sdkTokens = 75000;
    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.5,
      durationMs: 5000,
      numTurns: 5,
      inputTokens: sdkTokens,
      contextWindow: 200000,
    };

    (pm as any).handleTurnComplete(sessionId, metrics);

    const session = getSession(db, sessionId);
    // Should use SDK value, not the fallback estimate
    expect(session!.lastContextTokens).toBe(sdkTokens);
  });
});

describe('computeFallbackContextUsage includes system overhead', () => {
  test('adds system prompt overhead to message tokens', () => {
    addSessionMessage(db, sessionId, 'user', 'Short message');
    addSessionMessage(db, sessionId, 'assistant', 'Short reply');

    const fallback = (pm as any).computeFallbackContextUsage(sessionId);

    expect(fallback).not.toBeNull();
    // Raw message tokens would be ~10-15, but with 12k system overhead it should be much higher
    expect(fallback!.estimatedTokens).toBeGreaterThan(12000);
    expect(fallback!.messagesCount).toBe(2);
  });

  test('scales tool overhead with message count', () => {
    // 2 messages
    addSessionMessage(db, sessionId, 'user', 'Hello');
    addSessionMessage(db, sessionId, 'assistant', 'Hi');
    const fallback2 = (pm as any).computeFallbackContextUsage(sessionId);

    // 50 more messages
    for (let i = 0; i < 25; i++) {
      addSessionMessage(db, sessionId, 'user', 'X');
      addSessionMessage(db, sessionId, 'assistant', 'Y');
    }
    const fallback52 = (pm as any).computeFallbackContextUsage(sessionId);

    // 50 extra messages × 50 tokens/msg overhead = 2500 additional tokens
    const overhead = fallback52!.estimatedTokens - fallback2!.estimatedTokens;
    // Each extra message adds ~50 tokens of tool overhead + ~1 token of content
    expect(overhead).toBeGreaterThan(2500);
  });

  test('returns null for session with no messages', () => {
    const fallback = (pm as any).computeFallbackContextUsage(sessionId);
    expect(fallback).toBeNull();
  });

  test('computes usagePercent correctly', () => {
    // Add enough messages to make the math meaningful
    for (let i = 0; i < 10; i++) {
      addSessionMessage(db, sessionId, 'user', 'A'.repeat(400)); // ~100 tokens each
      addSessionMessage(db, sessionId, 'assistant', 'B'.repeat(400));
    }

    const fallback = (pm as any).computeFallbackContextUsage(sessionId);
    expect(fallback).not.toBeNull();
    // usagePercent = round(estimatedTokens / contextWindow * 100)
    const expected = Math.round((fallback!.estimatedTokens / fallback!.contextWindow) * 100);
    expect(fallback!.usagePercent).toBe(expected);
  });
});

describe('TurnCompleteMetrics token fields', () => {
  test('inputTokens and contextWindow are optional', () => {
    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.1,
      durationMs: 1000,
      numTurns: 1,
    };
    // Should not throw
    expect(metrics.inputTokens).toBeUndefined();
    expect(metrics.contextWindow).toBeUndefined();
  });

  test('accepts inputTokens and contextWindow when provided', () => {
    const metrics: TurnCompleteMetrics = {
      totalCostUsd: 0.1,
      durationMs: 1000,
      numTurns: 1,
      inputTokens: 30000,
      contextWindow: 200000,
    };
    expect(metrics.inputTokens).toBe(30000);
    expect(metrics.contextWindow).toBe(200000);
  });
});
