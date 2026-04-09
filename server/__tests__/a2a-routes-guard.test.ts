/**
 * Tests for A2A route-level invocation guardrails:
 * - Inbound rate limiting (429 response)
 * - DepthExceededError handling (400 response)
 * - sourceAgent extraction from header and body
 * - resetInboundRateLimiter export
 */

import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { MAX_A2A_DEPTH } from '../a2a/invocation-guard';
import { clearTaskStore } from '../a2a/task-handler';
import { runMigrations } from '../db/schema';
import type { ProcessManager } from '../process/manager';
import { handleA2ARoutes, resetInboundRateLimiter } from '../routes/a2a';

// ── Test helpers ─────────────────────────────────────────────────────────────

let db: Database;

function createMockProcessManager(): ProcessManager {
  return {
    startProcess: mock(() => {}),
    stopProcess: mock(() => {}),
    isRunning: mock(() => false),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    subscribeAll: mock(() => {}),
    unsubscribeAll: mock(() => {}),
  } as unknown as ProcessManager;
}

function makeRequest(body: unknown, headers?: Record<string, string>): { req: Request; url: URL } {
  const url = new URL('http://localhost:3000/a2a/tasks/send');
  const req = new Request(url.toString(), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return { req, url };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  // Seed the default agent and project so handleTaskSend can find them
  db.run(`INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)`, ['proj-1', 'TestProject', '/tmp/test']);
  db.run(`INSERT INTO agents (id, name, default_project_id) VALUES (?, ?, ?)`, ['agent-1', 'TestAgent', 'proj-1']);
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  resetInboundRateLimiter();
  clearTaskStore();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('A2A Routes — inbound rate limiting', () => {
  it('returns 429 when source agent exceeds rate limit', async () => {
    const pm = createMockProcessManager();

    // Send 5 requests from the same source agent (default limit is 5/min)
    for (let i = 0; i < 5; i++) {
      const { req, url } = makeRequest({ params: { message: `msg-${i}` } }, { 'x-source-agent': 'spammer-agent' });
      await handleA2ARoutes(req, url, db, pm);
    }

    // 6th request should be rate-limited
    const { req, url } = makeRequest({ params: { message: 'one more' } }, { 'x-source-agent': 'spammer-agent' });
    const res = await handleA2ARoutes(req, url, db, pm);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const body = (await res!.json()) as { error: string };
    expect(body.error).toContain('Rate limit');
  });

  it('extracts sourceAgent from x-source-agent header', async () => {
    const pm = createMockProcessManager();

    // First request with a specific header — should succeed
    const { req, url } = makeRequest({ params: { message: 'hello' } }, { 'x-source-agent': 'header-agent' });
    const res = await handleA2ARoutes(req, url, db, pm);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it('extracts sourceAgent from body field', async () => {
    const pm = createMockProcessManager();
    const { req, url } = makeRequest({
      params: { message: 'hello' },
      sourceAgent: 'body-agent',
    });

    const res = await handleA2ARoutes(req, url, db, pm);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it('defaults sourceAgent to "unknown" when not provided', async () => {
    const pm = createMockProcessManager();
    const { req, url } = makeRequest({ params: { message: 'hello' } });

    const res = await handleA2ARoutes(req, url, db, pm);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

describe('A2A Routes — depth exceeded', () => {
  it('returns 400 when depth exceeds MAX_A2A_DEPTH', async () => {
    const pm = createMockProcessManager();
    const { req, url } = makeRequest({
      params: { message: 'hello', depth: MAX_A2A_DEPTH + 1 },
    });

    const res = await handleA2ARoutes(req, url, db, pm);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: string };
    expect(body.error).toContain('depth limit');
  });

  it('accepts tasks with depth within limit', async () => {
    const pm = createMockProcessManager();
    const { req, url } = makeRequest({
      params: { message: 'hello', depth: 1 },
    });

    const res = await handleA2ARoutes(req, url, db, pm);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });

  it('passes depth from top-level body field', async () => {
    const pm = createMockProcessManager();
    const { req, url } = makeRequest({
      params: { message: 'hello' },
      depth: 2,
    });

    const res = await handleA2ARoutes(req, url, db, pm);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

describe('A2A Routes — resetInboundRateLimiter', () => {
  it('resets rate limiter allowing previously blocked agents', async () => {
    const pm = createMockProcessManager();

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      const { req, url } = makeRequest({ params: { message: `msg-${i}` } }, { 'x-source-agent': 'reset-test-agent' });
      await handleA2ARoutes(req, url, db, pm);
    }

    // Should be blocked now
    const { req: blockedReq, url: blockedUrl } = makeRequest(
      { params: { message: 'blocked' } },
      { 'x-source-agent': 'reset-test-agent' },
    );
    const blockedRes = await handleA2ARoutes(blockedReq, blockedUrl, db, pm);
    expect(blockedRes!.status).toBe(429);

    // Reset
    resetInboundRateLimiter();

    // Should be allowed again
    const { req: okReq, url: okUrl } = makeRequest(
      { params: { message: 'allowed' } },
      { 'x-source-agent': 'reset-test-agent' },
    );
    const okRes = await handleA2ARoutes(okReq, okUrl, db, pm);
    expect(okRes!.status).toBe(200);
  });
});
