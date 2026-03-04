import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { CIRetryService, type RunGhFn } from '../polling/ci-retry';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
});

afterEach(() => {
    db.close();
});

function insertPollingConfig(repo: string, username: string, overrides: Record<string, string> = {}) {
    db.query(`INSERT INTO mention_polling_configs (id, repo, mention_username, agent_id, project_id, status)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
        overrides.id ?? crypto.randomUUID(),
        repo,
        username,
        overrides.agentId ?? AGENT_ID,
        overrides.projectId ?? PROJECT_ID,
        overrides.status ?? 'active',
    );
}

function mockProcessManager() {
    return {
        startProcess: () => {},
        stopProcess: () => {},
        resumeProcess: () => {},
    } as any;
}

// ── Lifecycle ────────────────────────────────────────────────────────

describe('CIRetryService lifecycle', () => {
    test('start and stop without errors', () => {
        const service = new CIRetryService(db, mockProcessManager(), async () => ({ ok: false, stdout: '', stderr: '' }));
        service.start();
        service.stop();
    });

    test('double start is idempotent', () => {
        const service = new CIRetryService(db, mockProcessManager(), async () => ({ ok: false, stdout: '', stderr: '' }));
        service.start();
        service.start();
        service.stop();
    });

    test('double stop is safe', () => {
        const service = new CIRetryService(db, mockProcessManager(), async () => ({ ok: false, stdout: '', stderr: '' }));
        service.start();
        service.stop();
        service.stop();
    });
});

// ── checkAll ─────────────────────────────────────────────────────────

describe('CIRetryService.checkAll', () => {
    test('does nothing when not running', async () => {
        let called = false;
        const service = new CIRetryService(db, mockProcessManager(), async () => {
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
        const service = new CIRetryService(db, mockProcessManager(), runGh);
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

        const service = new CIRetryService(db, mockProcessManager(), runGh);
        (service as any).running = true;
        await service.checkAll();

        expect(calls.length).toBe(1);
    });

    test('spawns fix session for PR with failed CI', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        let sessionStarted = false;
        const pm = {
            ...mockProcessManager(),
            startProcess: () => { sessionStarted = true; },
        } as any;

        const runGh: RunGhFn = async (args) => {
            const key = args.join(' ');
            if (key.includes('search/issues')) {
                return {
                    ok: true,
                    stdout: JSON.stringify({
                        items: [{ number: 42, title: 'Fix bug', html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
                    }),
                    stderr: '',
                };
            }
            if (key.includes('pr checks')) {
                return {
                    ok: true,
                    stdout: JSON.stringify([
                        { name: 'lint', state: 'SUCCESS' },
                        { name: 'test', state: 'FAILURE' },
                    ]),
                    stderr: '',
                };
            }
            return { ok: false, stdout: '', stderr: '' };
        };

        const service = new CIRetryService(db, pm, runGh);
        (service as any).running = true;
        await service.checkAll();

        expect(sessionStarted).toBe(true);
        // Verify a session was created in the DB
        const sessions = db.query('SELECT name FROM sessions').all() as Array<{ name: string }>;
        expect(sessions.length).toBe(1);
        expect(sessions[0].name).toContain('Poll: CorvidLabs/corvid-agent #42');
    });

    test('skips PR when all checks pass', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        let sessionStarted = false;
        const pm = {
            ...mockProcessManager(),
            startProcess: () => { sessionStarted = true; },
        } as any;

        const runGh: RunGhFn = async (args) => {
            const key = args.join(' ');
            if (key.includes('search/issues')) {
                return {
                    ok: true,
                    stdout: JSON.stringify({
                        items: [{ number: 42, title: 'Fix', html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
                    }),
                    stderr: '',
                };
            }
            if (key.includes('pr checks')) {
                return {
                    ok: true,
                    stdout: JSON.stringify([
                        { name: 'lint', state: 'SUCCESS' },
                        { name: 'test', state: 'SUCCESS' },
                    ]),
                    stderr: '',
                };
            }
            return { ok: false, stdout: '', stderr: '' };
        };

        const service = new CIRetryService(db, pm, runGh);
        (service as any).running = true;
        await service.checkAll();

        expect(sessionStarted).toBe(false);
    });

    test('skips PR when checks are pending', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        let sessionStarted = false;
        const pm = {
            ...mockProcessManager(),
            startProcess: () => { sessionStarted = true; },
        } as any;

        const runGh: RunGhFn = async (args) => {
            const key = args.join(' ');
            if (key.includes('search/issues')) {
                return {
                    ok: true,
                    stdout: JSON.stringify({
                        items: [{ number: 42, title: 'Fix', html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
                    }),
                    stderr: '',
                };
            }
            if (key.includes('pr checks')) {
                return {
                    ok: true,
                    stdout: JSON.stringify([
                        { name: 'test', state: 'FAILURE' },
                        { name: 'build', state: 'PENDING' },
                    ]),
                    stderr: '',
                };
            }
            return { ok: false, stdout: '', stderr: '' };
        };

        const service = new CIRetryService(db, pm, runGh);
        (service as any).running = true;
        await service.checkAll();

        expect(sessionStarted).toBe(false);
    });

    test('enforces cooldown per PR', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        let startCount = 0;
        const pm = {
            ...mockProcessManager(),
            startProcess: () => { startCount++; },
        } as any;

        const runGh: RunGhFn = async (args) => {
            const key = args.join(' ');
            if (key.includes('search/issues')) {
                return {
                    ok: true,
                    stdout: JSON.stringify({
                        items: [{ number: 42, title: 'Fix', html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
                    }),
                    stderr: '',
                };
            }
            if (key.includes('pr checks')) {
                return {
                    ok: true,
                    stdout: JSON.stringify([
                        { name: 'test', state: 'FAILURE' },
                    ]),
                    stderr: '',
                };
            }
            return { ok: false, stdout: '', stderr: '' };
        };

        const service = new CIRetryService(db, pm, runGh);
        (service as any).running = true;

        await service.checkAll();
        expect(startCount).toBe(1);

        // Delete the created session so it won't be skipped for "existing session" reason
        db.query('DELETE FROM sessions').run();

        // Second call should be cooldown-blocked
        await service.checkAll();
        expect(startCount).toBe(1);
    });

    test('skips PR with existing running session', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        // Pre-create a running session for this PR
        db.query(`INSERT INTO sessions (id, project_id, agent_id, name, status, source)
                  VALUES (?, ?, ?, ?, 'running', 'agent')`).run(
            crypto.randomUUID(), PROJECT_ID, AGENT_ID,
            'Poll: CorvidLabs/corvid-agent #42: Fix bug',
        );

        let sessionStarted = false;
        const pm = {
            ...mockProcessManager(),
            startProcess: () => { sessionStarted = true; },
        } as any;

        const runGh: RunGhFn = async (args) => {
            const key = args.join(' ');
            if (key.includes('search/issues')) {
                return {
                    ok: true,
                    stdout: JSON.stringify({
                        items: [{ number: 42, title: 'Fix', html_url: 'https://github.com/CorvidLabs/corvid-agent/pull/42' }],
                    }),
                    stderr: '',
                };
            }
            return { ok: false, stdout: '', stderr: '' };
        };

        const service = new CIRetryService(db, pm, runGh);
        (service as any).running = true;
        await service.checkAll();

        expect(sessionStarted).toBe(false);
    });

    test('handles search API failure gracefully', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        const runGh: RunGhFn = async () => {
            return { ok: false, stdout: '', stderr: 'API error' };
        };

        const service = new CIRetryService(db, mockProcessManager(), runGh);
        (service as any).running = true;
        await service.checkAll();
        // Should not throw
    });

    test('handles empty search results', async () => {
        insertPollingConfig('CorvidLabs/corvid-agent', 'corvid-agent');

        const runGh: RunGhFn = async () => {
            return { ok: true, stdout: JSON.stringify({ items: [] }), stderr: '' };
        };

        const service = new CIRetryService(db, mockProcessManager(), runGh);
        (service as any).running = true;
        await service.checkAll();
    });

    test('uses org: qualifier for org-level configs', async () => {
        insertPollingConfig('CorvidLabs', 'corvid-agent');

        const calls: string[][] = [];
        const runGh: RunGhFn = async (args) => {
            calls.push(args);
            return { ok: true, stdout: JSON.stringify({ items: [] }), stderr: '' };
        };

        const service = new CIRetryService(db, mockProcessManager(), runGh);
        (service as any).running = true;
        await service.checkAll();

        const searchCall = calls[0].join(' ');
        expect(searchCall).toContain('org:CorvidLabs');
    });
});
