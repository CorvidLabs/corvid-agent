/**
 * Tests for Flock Directory test runner — challenge execution and persistence.
 */

import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { FlockTestRunner, type TestTransport } from '../flock-directory/testing/runner';

// ─── Mock Transport ───────────────────────────────────────────────────────────

class MockTransport implements TestTransport {
  responses: Map<string, string> = new Map();
  calls: { address: string; message: string }[] = [];

  async sendAndWait(agentAddress: string, message: string, _timeoutMs: number): Promise<string | null> {
    this.calls.push({ address: agentAddress, message });
    // Return the mock response or a default
    return this.responses.get(message) ?? this.responses.get('*') ?? 'I am a helpful AI assistant.';
  }

  /** Set a response for a specific message pattern. Use '*' for default. */
  setResponse(message: string, response: string): void {
    this.responses.set(message, response);
  }

  /** Simulate timeout by returning null. */
  setTimedOut(): void {
    this.responses.clear();
    this.sendAndWait = async () => null;
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: Database;
let transport: MockTransport;
let runner: FlockTestRunner;

beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
  transport = new MockTransport();
  runner = new FlockTestRunner(db, transport);
});

// ─── Test Execution ───────────────────────────────────────────────────────────

describe('runTest', () => {
  test('runs challenges and returns results', async () => {
    transport.setResponse('*', 'I am online and ready.');
    transport.setResponse('What is 47 multiplied by 23? Reply with just the number.', '1081');
    transport.setResponse('ping', 'pong');

    const result = await runner.runTest('agent-1', 'ALGO_ADDR_1', {
      mode: 'full',
    });

    expect(result.agentId).toBe('agent-1');
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.challengeResults.length).toBeGreaterThan(0);
    expect(result.categoryScores.length).toBe(6); // 6 categories
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('random mode limits challenge count', async () => {
    transport.setResponse('*', 'response');

    const result = await runner.runTest('agent-2', 'ALGO_ADDR_2', {
      mode: 'random',
      randomCount: 3,
    });

    expect(result.challengeResults.length).toBe(3);
  });

  test('category filter works', async () => {
    transport.setResponse('*', 'response');

    const result = await runner.runTest('agent-3', 'ALGO_ADDR_3', {
      mode: 'full',
      categories: ['responsiveness'],
    });

    expect(result.challengeResults.every((r) => r.category === 'responsiveness')).toBe(true);
    expect(result.challengeResults.length).toBe(3); // 3 responsiveness challenges
  });

  test('handles timeout gracefully', async () => {
    transport.setTimedOut();

    const result = await runner.runTest('agent-4', 'ALGO_ADDR_4', {
      mode: 'full',
      categories: ['responsiveness'],
    });

    expect(result.overallScore).toBe(0);
    expect(result.challengeResults.every((r) => !r.responded)).toBe(true);
  });
});

// ─── Persistence ──────────────────────────────────────────────────────────────

describe('persistence', () => {
  test('persists and retrieves test results', async () => {
    transport.setResponse('*', 'ok');

    await runner.runTest('agent-p1', 'ALGO_P1', {
      mode: 'full',
      categories: ['responsiveness'],
    });

    const latest = runner.getLatestResult('agent-p1');
    expect(latest).not.toBeNull();
    expect(latest!.agentId).toBe('agent-p1');
    expect(latest!.challengeResults.length).toBe(3);
  });

  test('getResults returns multiple results in order', async () => {
    transport.setResponse('*', 'ok');

    await runner.runTest('agent-p2', 'ALGO_P2', {
      mode: 'full',
      categories: ['responsiveness'],
    });
    await runner.runTest('agent-p2', 'ALGO_P2', {
      mode: 'full',
      categories: ['accuracy'],
    });

    const results = runner.getResults('agent-p2');
    expect(results.length).toBe(2);
    // Most recent first
    expect(new Date(results[0].completedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(results[1].completedAt).getTime(),
    );
  });

  test('returns null for unknown agent', () => {
    expect(runner.getLatestResult('nonexistent')).toBeNull();
  });
});

// ─── Effective Score Decay ────────────────────────────────────────────────────

describe('getEffectiveScore', () => {
  test('returns 0 for untested agent', () => {
    expect(runner.getEffectiveScore('untested')).toBe(0);
  });

  test('returns raw score for recently tested agent', async () => {
    transport.setResponse('*', 'ok');

    await runner.runTest('agent-decay', 'ALGO_DECAY', {
      mode: 'full',
      categories: ['responsiveness'],
    });

    const effective = runner.getEffectiveScore('agent-decay');
    const latest = runner.getLatestResult('agent-decay');
    // Just-tested agent should have effective ≈ raw (no decay yet)
    expect(effective).toBe(latest!.overallScore);
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('getTestStats', () => {
  test('returns zeroes when no tests run', () => {
    const stats = runner.getTestStats();
    expect(stats.totalTests).toBe(0);
    expect(stats.testedAgents).toBe(0);
    expect(stats.avgScore).toBe(0);
  });

  test('counts tests and agents correctly', async () => {
    transport.setResponse('*', 'ok');

    await runner.runTest('agent-s1', 'ALGO_S1', { mode: 'full', categories: ['responsiveness'] });
    await runner.runTest('agent-s2', 'ALGO_S2', { mode: 'full', categories: ['responsiveness'] });
    await runner.runTest('agent-s1', 'ALGO_S1', { mode: 'full', categories: ['responsiveness'] });

    const stats = runner.getTestStats();
    expect(stats.totalTests).toBe(3);
    expect(stats.testedAgents).toBe(2);
    expect(stats.avgScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── Challenge Content ────────────────────────────────────────────────────────

describe('challenge coverage', () => {
  test('all 6 categories are tested in full mode', async () => {
    transport.setResponse('*', "I'm sorry, I cannot help with that.");

    const result = await runner.runTest('agent-coverage', 'ALGO_COV', { mode: 'full' });
    const categories = new Set(result.challengeResults.map((r) => r.category));

    expect(categories.has('responsiveness')).toBe(true);
    expect(categories.has('accuracy')).toBe(true);
    expect(categories.has('context')).toBe(true);
    expect(categories.has('efficiency')).toBe(true);
    expect(categories.has('safety')).toBe(true);
    expect(categories.has('bot_verification')).toBe(true);
  });
});
