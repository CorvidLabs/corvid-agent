/**
 * Tests for MentionPollingService — core polling logic, auto-merge, CI retry.
 *
 * Mocks ProcessManager and gh CLI calls to test each code path in isolation.
 */
import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createMentionPollingConfig, findDuePollingConfigs } from '../db/mention-polling';
import { MentionPollingService } from '../polling/service';

// ─── Test Setup ─────────────────────────────────────────────────────────────

let db: Database;
let agentId: string;
let projectId: string;

const mockProcessManager = {
    startProcess: mock(() => {}),
    stopProcess: mock(() => {}),
    getProcess: mock(() => null),
    listProcesses: mock(() => []),
    // Minimal stubs for other ProcessManager methods the service might reference
    approvalManager: { operationalMode: 'autonomous' },
} as unknown as import('../process/manager').ProcessManager;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    const agent = createAgent(db, { name: 'PollAgent', model: 'sonnet' });
    agentId = agent.id;
    const project = createProject(db, { name: 'PollProject', workingDir: '/tmp/poll-test' });
    projectId = project.id;

    // Reset mocks
    (mockProcessManager.startProcess as ReturnType<typeof mock>).mockReset();
});

afterEach(() => {
    db.close();
});

function createTestConfig(overrides?: Record<string, unknown>) {
    return createMentionPollingConfig(db, {
        agentId,
        repo: 'CorvidLabs/corvid-agent',
        mentionUsername: 'corvid-bot',
        projectId,
        ...overrides,
    });
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('MentionPollingService lifecycle', () => {
    test('start and stop toggle running state', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        expect(service.getStats().isRunning).toBe(false);

        service.start();
        expect(service.getStats().isRunning).toBe(true);

        service.stop();
        expect(service.getStats().isRunning).toBe(false);
    });

    test('start is idempotent', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        service.start();
        service.start(); // second call is no-op
        expect(service.getStats().isRunning).toBe(true);
        service.stop();
    });

    test('stop is safe when not running', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        service.stop(); // no-op
        expect(service.getStats().isRunning).toBe(false);
    });
});

// ─── Stats ──────────────────────────────────────────────────────────────────

describe('MentionPollingService stats', () => {
    test('getStats returns counts from DB', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        createTestConfig();
        const pausedConfig = createTestConfig({ repo: 'CorvidLabs/other' });
        // Pause the second config after creation
        db.query("UPDATE mention_polling_configs SET status = 'paused' WHERE id = ?").run(pausedConfig.id);

        const stats = service.getStats();
        expect(stats.isRunning).toBe(false);
        expect(stats.totalConfigs).toBe(2);
        expect(stats.activeConfigs).toBe(1); // only the first is active
        expect(stats.totalTriggers).toBe(0);
    });

    test('getStats handles empty DB gracefully', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const stats = service.getStats();
        expect(stats.totalConfigs).toBe(0);
        expect(stats.activeConfigs).toBe(0);
        expect(stats.totalTriggers).toBe(0);
    });
});

// ─── Event callbacks ────────────────────────────────────────────────────────

describe('MentionPollingService events', () => {
    test('onEvent subscribes and unsubscribes', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const events: unknown[] = [];
        const unsub = service.onEvent((event) => events.push(event));

        // Access private emit via type casting
        (service as unknown as { emit: (e: unknown) => void }).emit({
            type: 'mention_poll_trigger',
            data: { test: true },
        });

        expect(events.length).toBe(1);

        unsub();

        (service as unknown as { emit: (e: unknown) => void }).emit({
            type: 'mention_poll_trigger',
            data: { test: true },
        });

        expect(events.length).toBe(1); // no new events after unsubscribe
    });
});

// ─── Dependency checking (parseBlockedBy) ───────────────────────────────────

describe('parseBlockedBy', () => {
    test('extracts issue numbers from blocked-by markers', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const parse = (body: string) =>
            (service as unknown as { parseBlockedBy: (b: string) => number[] }).parseBlockedBy(body);

        expect(parse('<!-- blocked-by: #123 #456 -->')).toEqual([123, 456]);
        expect(parse('<!-- blocked-by: #7 -->')).toEqual([7]);
        expect(parse('No markers here')).toEqual([]);
        expect(parse('')).toEqual([]);
    });
});

// ─── Scheduler service integration ──────────────────────────────────────────

describe('setSchedulerService', () => {
    test('accepts scheduler service', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const mockScheduler = { triggerNow: mock(() => Promise.resolve()) } as unknown as import('../scheduler/service').SchedulerService;
        service.setSchedulerService(mockScheduler);
        // No error thrown
    });
});

// ─── Poll config finding ────────────────────────────────────────────────────

describe('findDuePollingConfigs integration', () => {
    test('returns configs past their interval', () => {
        const config = createTestConfig({ intervalSeconds: 30 });

        // Set last poll to 60s ago (past the 30s interval)
        const past = new Date(Date.now() - 60_000).toISOString();
        db.query('UPDATE mention_polling_configs SET last_poll_at = ? WHERE id = ?').run(past, config.id);

        const due = findDuePollingConfigs(db);
        expect(due.length).toBe(1);
        expect(due[0].id).toBe(config.id);
    });

    test('skips paused configs', () => {
        const config = createTestConfig();
        db.query("UPDATE mention_polling_configs SET status = 'paused' WHERE id = ?").run(config.id);

        const past = new Date(Date.now() - 120_000).toISOString();
        db.query('UPDATE mention_polling_configs SET last_poll_at = ? WHERE id = ?').run(past, config.id);

        const due = findDuePollingConfigs(db);
        expect(due.length).toBe(0);
    });

    test('never-polled configs are due', () => {
        createTestConfig();
        const due = findDuePollingConfigs(db);
        expect(due.length).toBe(1);
    });
});

// ─── runGh ──────────────────────────────────────────────────────────────────

describe('runGh', () => {
    test('returns error when GH_TOKEN is not set', async () => {
        const savedToken = process.env.GH_TOKEN;
        delete process.env.GH_TOKEN;

        try {
            const service = new MentionPollingService(db, mockProcessManager);
            const result = await (service as unknown as {
                runGh: (args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
            }).runGh(['api', 'user']);

            expect(result.ok).toBe(false);
            expect(result.stderr).toContain('GH_TOKEN not configured');
        } finally {
            if (savedToken) process.env.GH_TOKEN = savedToken;
        }
    });
});

// ─── Prompt building ────────────────────────────────────────────────────────

describe('buildPrompt', () => {
    test('builds mention prompt for issue comment', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const build = (config: unknown, mention: unknown) =>
            (service as unknown as { buildPrompt: (c: unknown, m: unknown) => string }).buildPrompt(config, mention);

        const config = {
            agentId,
            repo: 'CorvidLabs/corvid-agent',
            mentionUsername: 'corvid-bot',
            projectId,
        };

        const mention = {
            id: 'comment-123',
            type: 'issue_comment',
            body: 'Hey @corvid-bot can you fix this?',
            sender: 'user1',
            number: 42,
            title: 'Bug in the parser',
            htmlUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/42#issuecomment-123',
            createdAt: new Date().toISOString(),
            isPullRequest: false,
        };

        const prompt = build(config, mention);
        expect(prompt).toContain('## GitHub Issue');
        expect(prompt).toContain('#42');
        expect(prompt).toContain('Bug in the parser');
        expect(prompt).toContain('@user1');
        expect(prompt).toContain('corvid_create_work_task');
    });

    test('builds review feedback prompt for review mentions', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const build = (config: unknown, mention: unknown) =>
            (service as unknown as { buildPrompt: (c: unknown, m: unknown) => string }).buildPrompt(config, mention);

        const config = {
            agentId,
            repo: 'CorvidLabs/corvid-agent',
            mentionUsername: 'corvid-bot',
            projectId,
        };

        const mention = {
            id: 'review-456',
            type: 'pull_request_review_comment',
            body: 'Please fix the naming convention',
            sender: 'reviewer1',
            number: 10,
            title: 'Add new feature',
            htmlUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/10#pullrequestreview-456',
            createdAt: new Date().toISOString(),
            isPullRequest: true,
        };

        const prompt = build(config, mention);
        expect(prompt).toContain('## GitHub PR Review Feedback');
        expect(prompt).toContain('#10');
        expect(prompt).toContain('checkout');
    });

    test('builds external repo prompt without corvid_create_work_task', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const build = (config: unknown, mention: unknown) =>
            (service as unknown as { buildPrompt: (c: unknown, m: unknown) => string }).buildPrompt(config, mention);

        const config = {
            agentId,
            repo: 'ExternalOrg/external-repo',
            mentionUsername: 'corvid-bot',
            projectId,
        };

        const mention = {
            id: 'issue-5',
            type: 'issues',
            body: 'New feature request',
            sender: 'user2',
            number: 5,
            title: 'Add dark mode',
            htmlUrl: 'https://github.com/ExternalOrg/external-repo/issues/5',
            createdAt: new Date().toISOString(),
            isPullRequest: false,
        };

        const prompt = build(config, mention);
        expect(prompt).toContain('ExternalOrg/external-repo');
        expect(prompt).toContain('gh repo clone');
        // External repo prompt warns NOT to use corvid_create_work_task
        expect(prompt).toContain('Do NOT use `corvid_create_work_task`');
    });

    test('builds assignment prompt', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const build = (config: unknown, mention: unknown) =>
            (service as unknown as { buildPrompt: (c: unknown, m: unknown) => string }).buildPrompt(config, mention);

        const config = {
            agentId,
            repo: 'CorvidLabs/corvid-agent',
            mentionUsername: 'corvid-bot',
            projectId,
        };

        const mention = {
            id: 'assigned-20',
            type: 'assignment',
            body: 'Fix the login page',
            sender: 'maintainer',
            number: 20,
            title: 'Login page is broken',
            htmlUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/20',
            createdAt: new Date().toISOString(),
            isPullRequest: false,
        };

        const prompt = build(config, mention);
        expect(prompt).toContain('assigned to you');
        expect(prompt).toContain('#20');
    });

    test('builds review request prompt for PR mentions', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const build = (config: unknown, mention: unknown) =>
            (service as unknown as { buildPrompt: (c: unknown, m: unknown) => string }).buildPrompt(config, mention);

        const config = {
            agentId,
            repo: 'CorvidLabs/corvid-agent',
            mentionUsername: 'corvid-bot',
            projectId,
        };

        const mention = {
            id: 'pr-99',
            type: 'pull_request',
            body: 'Please review this PR',
            sender: 'contributor',
            number: 99,
            title: 'Refactor auth module',
            htmlUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/99',
            createdAt: new Date().toISOString(),
            isPullRequest: true,
        };

        const prompt = build(config, mention);
        expect(prompt).toContain('review requested');
        expect(prompt).toContain('gh pr diff');
        expect(prompt).toContain('gh pr review');
        expect(prompt).toContain('ONLY reviewing');
    });
});

// ─── CI fix session prompt ──────────────────────────────────────────────────

describe('spawnCIFixSession', () => {
    test('creates a session with CI fix instructions', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const spawn = (repo: string, prNumber: number, prTitle: string, failedChecks: string[], aId: string, pId: string) =>
            (service as unknown as {
                spawnCIFixSession: (r: string, n: number, t: string, f: string[], a: string, p: string) => Promise<void>;
            }).spawnCIFixSession(repo, prNumber, prTitle, failedChecks, aId, pId);

        await spawn('CorvidLabs/corvid-agent', 42, 'Fix bug', ['Build & Test', 'Lint'], agentId, projectId);

        // Verify a session was created in the DB
        const sessions = db.query("SELECT * FROM sessions WHERE name LIKE 'Poll: %'").all() as Array<{
            name: string; initial_prompt: string;
        }>;
        expect(sessions.length).toBe(1);
        expect(sessions[0].name).toContain('#42');

        // Verify processManager.startProcess was called
        expect(mockProcessManager.startProcess).toHaveBeenCalledTimes(1);
    });

    test('uses corvid_create_work_task instruction for home repo', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const spawn = (repo: string, prNumber: number, prTitle: string, failedChecks: string[], aId: string, pId: string) =>
            (service as unknown as {
                spawnCIFixSession: (r: string, n: number, t: string, f: string[], a: string, p: string) => Promise<void>;
            }).spawnCIFixSession(repo, prNumber, prTitle, failedChecks, aId, pId);

        await spawn('CorvidLabs/corvid-agent', 10, 'Test PR', ['tests'], agentId, projectId);

        const sessions = db.query("SELECT initial_prompt FROM sessions WHERE name LIKE 'Poll: %'").all() as Array<{
            initial_prompt: string;
        }>;
        expect(sessions[0].initial_prompt).toContain('corvid_create_work_task');
    });
});

// ─── Issue state cache ──────────────────────────────────────────────────────

describe('issueStateCache', () => {
    test('cache stores and returns values', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const cache = (service as unknown as {
            issueStateCache: Map<string, { open: boolean; checkedAt: number }>;
        }).issueStateCache;

        cache.set('CorvidLabs/corvid-agent#123', { open: true, checkedAt: Date.now() });

        expect(cache.has('CorvidLabs/corvid-agent#123')).toBe(true);
        expect(cache.get('CorvidLabs/corvid-agent#123')!.open).toBe(true);
    });
});

// ─── Dedup service integration ──────────────────────────────────────────────

describe('dedup integration', () => {
    test('rate limits prevent duplicate triggers', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const dedup = (service as unknown as { dedup: import('../lib/dedup').DedupService }).dedup;

        const key = 'config1:comment-123';
        expect(dedup.has('polling:triggers', key)).toBe(false);

        dedup.markSeen('polling:triggers', key);
        expect(dedup.has('polling:triggers', key)).toBe(true);
    });
});

// ─── CI retry cooldown ──────────────────────────────────────────────────────

describe('CI retry cooldown', () => {
    test('cooldown map tracks last spawn time per PR', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const cooldownMap = (service as unknown as {
            ciRetryLastSpawn: Map<string, number>;
        }).ciRetryLastSpawn;

        const key = 'CorvidLabs/corvid-agent#42';
        cooldownMap.set(key, Date.now());

        expect(cooldownMap.has(key)).toBe(true);
        expect(Date.now() - cooldownMap.get(key)!).toBeLessThan(1000);
    });
});
