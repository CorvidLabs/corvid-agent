import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
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

    test('merges PR when all checks pass', async () => {
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
            if (key.includes('pr merge')) {
                return { ok: true, stdout: 'Merged', stderr: '' };
            }
            return { ok: false, stdout: '', stderr: 'not mocked' };
        };

        const service = new AutoMergeService(db, runGh);
        (service as any).running = true;
        await service.checkAll();

        // Should have made: search, checks, merge
        expect(calls.length).toBe(3);
        expect(calls[2].join(' ')).toContain('pr merge');
        expect(calls[2].join(' ')).toContain('--squash');
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
});
