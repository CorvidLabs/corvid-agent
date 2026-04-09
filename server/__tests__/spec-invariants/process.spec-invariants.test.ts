/**
 * Spec invariant tests for process/* modules.
 *
 * Covers: approval, claude-process (types), session-lifecycle
 * Each test name starts with "spec: " to distinguish invariant tests
 * from unit tests in the sibling test files.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { runMigrations } from '../../db/schema';
import { ApprovalManager } from '../../process/approval-manager';
import { formatToolDescription } from '../../process/approval-types';
import { SessionLifecycleManager } from '../../process/session-lifecycle';
import { extractContentImageUrls, extractContentText } from '../../process/types';

// ── formatToolDescription ───────────────────────────────────────────────────

describe('formatToolDescription', () => {
  it('spec: Bash tool shows command with up to 400 chars', () => {
    const description = formatToolDescription('Bash', { command: 'ls -la' });
    expect(description).toBe('Run command: ls -la');
  });

  it('spec: Write tool shows file path', () => {
    const description = formatToolDescription('Write', { file_path: '/tmp/test.ts' });
    expect(description).toBe('Write file: /tmp/test.ts');
  });

  it('spec: Edit tool shows file path', () => {
    const description = formatToolDescription('Edit', { file_path: '/tmp/test.ts' });
    expect(description).toBe('Edit file: /tmp/test.ts');
  });

  it('spec: unknown tool falls back to "Use tool: <name>"', () => {
    const description = formatToolDescription('UnknownTool', { someInput: 'value' });
    expect(description).toBe('Use tool: UnknownTool');
  });

  it('spec: Bash command is truncated to 400 chars', () => {
    const longCmd = 'a'.repeat(500);
    const description = formatToolDescription('Bash', { command: longCmd });
    expect(description.length).toBeLessThanOrEqual('Run command: '.length + 400);
  });
});

// ── extractContentText ──────────────────────────────────────────────────────

describe('extractContentText', () => {
  it('spec: returns "" for undefined content', () => {
    expect(extractContentText(undefined)).toBe('');
  });

  it('spec: returns string unchanged when content is a string', () => {
    expect(extractContentText('hello world')).toBe('hello world');
  });

  it('spec: concatenates all text-type blocks from an array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'image', text: undefined },
      { type: 'text', text: ' world' },
    ];
    expect(extractContentText(content)).toBe('Hello world');
  });

  it('spec: returns "" for empty array', () => {
    expect(extractContentText([])).toBe('');
  });
});

// ── extractContentImageUrls ────────────────────────────────────────────────

describe('extractContentImageUrls', () => {
  it('spec: returns [] for string content', () => {
    expect(extractContentImageUrls('some text')).toEqual([]);
  });

  it('spec: returns [] for undefined', () => {
    expect(extractContentImageUrls(undefined)).toEqual([]);
  });

  it('spec: extracts urls from image blocks with source.url', () => {
    const content = [
      { type: 'image', source: { url: 'https://example.com/img.png' } },
      { type: 'text', text: 'caption' },
    ];
    expect(extractContentImageUrls(content)).toEqual(['https://example.com/img.png']);
  });
});

// ── ApprovalManager — mode invariants ──────────────────────────────────────

describe('ApprovalManager mode invariants', () => {
  let db: Database;
  let manager: ApprovalManager;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    manager = new ApprovalManager();
    manager.setDatabase(db);
  });

  afterEach(() => {
    manager.shutdown();
    db.close();
  });

  it('spec: paused mode — all requests immediately denied without queuing', async () => {
    manager.operationalMode = 'paused';
    const response = await manager.createRequest({
      id: crypto.randomUUID(),
      sessionId: 'sess-1',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
      description: 'Run command: ls',
      createdAt: Date.now(),
      timeoutMs: 10_000,
      source: 'web',
    });
    expect(response.behavior).toBe('deny');
    expect(manager.hasPendingRequests()).toBe(false);
    expect(manager.getQueuedRequests()).toHaveLength(0);
  });

  it('spec: resolveByShortId — rejects response from different sender address', async () => {
    const id = crypto.randomUUID();
    const promise = manager.createRequest(
      {
        id,
        sessionId: 'sess-1',
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        description: 'Run command: ls',
        createdAt: Date.now(),
        timeoutMs: 5_000,
        source: 'web',
      },
      'ALICE...',
    );
    const shortId = id.slice(0, 6);
    const resolved = manager.resolveByShortId(shortId, { behavior: 'allow' }, 'BOB...');
    expect(resolved).toBe(false);
    manager.cancelSession('sess-1');
    await promise;
  });

  it('spec: algochat source gets 120s default timeout; others get 55s', () => {
    expect(manager.getDefaultTimeout('algochat')).toBe(120_000);
    expect(manager.getDefaultTimeout('web')).toBe(55_000);
    expect(manager.getDefaultTimeout('discord')).toBe(55_000);
  });
});

// ── SessionLifecycleManager — limit enforcement includes paused sessions ───

describe('SessionLifecycleManager — paused sessions in limit enforcement', () => {
  let db: Database;

  function insertSession(id: string, projectId: string, status: string, ageHours: number = 48) {
    const updatedAt = new Date(Date.now() - ageHours * 3_600_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');
    db.query(`
            INSERT INTO sessions (id, name, project_id, agent_id, status, source, updated_at)
            VALUES (?, ?, ?, 'agent-1', ?, 'web', ?)
        `).run(id, id, projectId, status, updatedAt);
  }

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(
      `INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'claude-sonnet-4-6', 'test')`,
    ).run();
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES ('proj-1', 'TestProject', '/tmp')`).run();
  });

  afterEach(() => {
    db.close();
  });

  it('spec: paused sessions are subject to per-project limit enforcement (only running is fully protected)', async () => {
    // Insert 3 paused sessions older than 24h (limit is 2 for this test)
    insertSession('paused-1', 'proj-1', 'paused', 72);
    insertSession('paused-2', 'proj-1', 'paused', 72);
    insertSession('paused-3', 'proj-1', 'paused', 72);

    const manager = new SessionLifecycleManager(db, { maxSessionsPerProject: 2, cleanupIntervalMs: 60_000 });
    await manager.runCleanup();

    const remaining = (
      db.query(`SELECT COUNT(*) as cnt FROM sessions WHERE status = 'paused'`).get() as { cnt: number }
    ).cnt;
    // At least one paused session should be removed (limit enforcement applies)
    expect(remaining).toBeLessThan(3);
  });

  it('spec: running sessions are NEVER removed by limit enforcement', async () => {
    // Insert 3 running sessions (limit is 1)
    insertSession('running-1', 'proj-1', 'running', 72);
    insertSession('running-2', 'proj-1', 'running', 72);
    insertSession('running-3', 'proj-1', 'running', 72);

    const manager = new SessionLifecycleManager(db, { maxSessionsPerProject: 1, cleanupIntervalMs: 60_000 });
    await manager.runCleanup();

    const remaining = (
      db.query(`SELECT COUNT(*) as cnt FROM sessions WHERE status = 'running'`).get() as { cnt: number }
    ).cnt;
    expect(remaining).toBe(3); // All running sessions preserved
  });
});
