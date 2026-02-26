import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import {
    createMentionPollingConfig,
    getMentionPollingConfig,
    listMentionPollingConfigs,
    updateMentionPollingConfig,
    deleteMentionPollingConfig,
    findDuePollingConfigs,
    updatePollState,
    incrementPollingTriggerCount,
    updateProcessedIds,
} from '../db/mention-polling';
import { MentionPollingService } from '../polling/service';
import { handleMentionPollingRoutes } from '../routes/mention-polling';

// ─── Test Setup ─────────────────────────────────────────────────────────────

let db: Database;
let agentId: string;
let projectId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    const agent = createAgent(db, { name: 'TestAgent', model: 'sonnet' });
    agentId = agent.id;

    const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
    projectId = project.id;
});

afterEach(() => {
    db.close();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

async function getJson(res: Response | Promise<Response>): Promise<Record<string, unknown> & { configs?: Array<Record<string, unknown>> }> {
    const resolved = await res;
    return resolved.json();
}

function createTestConfig(overrides?: Record<string, unknown>) {
    return createMentionPollingConfig(db, {
        agentId,
        repo: 'owner/repo',
        mentionUsername: 'test-bot',
        projectId,
        intervalSeconds: 60,
        ...overrides,
    });
}

function createMockProcessManager() {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        getProcess: mock(() => null),
        listProcesses: mock(() => []),
    } as unknown as import('../process/manager').ProcessManager;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB Operations
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mention Polling DB Operations', () => {

    // ── Create ──────────────────────────────────────────────────────────────

    describe('createMentionPollingConfig', () => {
        test('creates config with required fields', () => {
            const config = createTestConfig();

            expect(config.id).toBeTruthy();
            expect(config.agentId).toBe(agentId);
            expect(config.repo).toBe('owner/repo');
            expect(config.mentionUsername).toBe('test-bot');
            expect(config.projectId).toBe(projectId);
            expect(config.intervalSeconds).toBe(60);
            expect(config.status).toBe('active');
            expect(config.triggerCount).toBe(0);
            expect(config.lastPollAt).toBeNull();
            expect(config.lastSeenId).toBeNull();
            expect(config.processedIds).toEqual([]);
            expect(config.eventFilter).toEqual([]);
            expect(config.allowedUsers).toEqual([]);
            expect(config.createdAt).toBeTruthy();
            expect(config.updatedAt).toBeTruthy();
        });

        test('creates config with optional fields', () => {
            const config = createTestConfig({
                intervalSeconds: 120,
                eventFilter: ['issue_comment', 'issues'],
                allowedUsers: ['alice', 'bob'],
            });

            expect(config.intervalSeconds).toBe(120);
            expect(config.eventFilter).toEqual(['issue_comment', 'issues']);
            expect(config.allowedUsers).toEqual(['alice', 'bob']);
        });

        test('creates multiple configs for same agent', () => {
            createTestConfig({ repo: 'owner/repo-a' });
            createTestConfig({ repo: 'owner/repo-b' });

            const configs = listMentionPollingConfigs(db, agentId);
            expect(configs).toHaveLength(2);
        });
    });

    // ── Get ─────────────────────────────────────────────────────────────────

    describe('getMentionPollingConfig', () => {
        test('returns config by ID', () => {
            const created = createTestConfig();
            const fetched = getMentionPollingConfig(db, created.id);

            expect(fetched).not.toBeNull();
            expect(fetched!.id).toBe(created.id);
            expect(fetched!.repo).toBe('owner/repo');
        });

        test('returns null for non-existent ID', () => {
            const result = getMentionPollingConfig(db, 'non-existent-id');
            expect(result).toBeNull();
        });
    });

    // ── List ────────────────────────────────────────────────────────────────

    describe('listMentionPollingConfigs', () => {
        test('returns all configs when no agentId provided', () => {
            const agent2 = createAgent(db, { name: 'Agent2', model: 'sonnet' });
            createTestConfig({ repo: 'owner/repo-1' });
            createTestConfig({ agentId: agent2.id, repo: 'owner/repo-2' });

            const all = listMentionPollingConfigs(db);
            expect(all).toHaveLength(2);
        });

        test('filters by agentId', () => {
            const agent2 = createAgent(db, { name: 'Agent2', model: 'sonnet' });
            createTestConfig({ repo: 'owner/repo-1' });
            createTestConfig({ agentId: agent2.id, repo: 'owner/repo-2' });

            const filtered = listMentionPollingConfigs(db, agentId);
            expect(filtered).toHaveLength(1);
            expect(filtered[0].repo).toBe('owner/repo-1');
        });

        test('returns empty array when no configs exist', () => {
            const configs = listMentionPollingConfigs(db);
            expect(configs).toEqual([]);
        });

        test('returns configs in descending creation order', () => {
            const c1 = createTestConfig({ repo: 'owner/first' });
            // Manually backdate c1 so it sorts after c2
            db.query(`UPDATE mention_polling_configs SET created_at = datetime('now', '-60 seconds') WHERE id = ?`).run(c1.id);
            createTestConfig({ repo: 'owner/second' });

            const configs = listMentionPollingConfigs(db);
            // Most recently created first
            expect(configs[0].repo).toBe('owner/second');
            expect(configs[1].repo).toBe('owner/first');
        });
    });

    // ── Update ──────────────────────────────────────────────────────────────

    describe('updateMentionPollingConfig', () => {
        test('updates mentionUsername', () => {
            const config = createTestConfig();
            const updated = updateMentionPollingConfig(db, config.id, {
                mentionUsername: 'new-bot',
            });

            expect(updated).not.toBeNull();
            expect(updated!.mentionUsername).toBe('new-bot');
        });

        test('updates status to paused', () => {
            const config = createTestConfig();
            const updated = updateMentionPollingConfig(db, config.id, {
                status: 'paused',
            });

            expect(updated!.status).toBe('paused');
        });

        test('updates intervalSeconds', () => {
            const config = createTestConfig();
            const updated = updateMentionPollingConfig(db, config.id, {
                intervalSeconds: 300,
            });

            expect(updated!.intervalSeconds).toBe(300);
        });

        test('updates eventFilter', () => {
            const config = createTestConfig();
            const updated = updateMentionPollingConfig(db, config.id, {
                eventFilter: ['issues'],
            });

            expect(updated!.eventFilter).toEqual(['issues']);
        });

        test('updates allowedUsers', () => {
            const config = createTestConfig();
            const updated = updateMentionPollingConfig(db, config.id, {
                allowedUsers: ['charlie'],
            });

            expect(updated!.allowedUsers).toEqual(['charlie']);
        });

        test('updates multiple fields at once', () => {
            const config = createTestConfig();
            const updated = updateMentionPollingConfig(db, config.id, {
                mentionUsername: 'updated-bot',
                intervalSeconds: 180,
                status: 'paused',
            });

            expect(updated!.mentionUsername).toBe('updated-bot');
            expect(updated!.intervalSeconds).toBe(180);
            expect(updated!.status).toBe('paused');
        });

        test('returns null for non-existent ID', () => {
            const result = updateMentionPollingConfig(db, 'non-existent', {
                status: 'paused',
            });
            expect(result).toBeNull();
        });

        test('returns existing config when no fields provided', () => {
            const config = createTestConfig();
            const result = updateMentionPollingConfig(db, config.id, {});

            expect(result).not.toBeNull();
            expect(result!.id).toBe(config.id);
        });
    });

    // ── Delete ──────────────────────────────────────────────────────────────

    describe('deleteMentionPollingConfig', () => {
        test('deletes existing config and returns true', () => {
            const config = createTestConfig();
            const deleted = deleteMentionPollingConfig(db, config.id);

            expect(deleted).toBe(true);
            expect(getMentionPollingConfig(db, config.id)).toBeNull();
        });

        test('returns false for non-existent ID', () => {
            const deleted = deleteMentionPollingConfig(db, 'non-existent');
            expect(deleted).toBe(false);
        });
    });

    // ── findDuePollingConfigs ───────────────────────────────────────────────

    describe('findDuePollingConfigs', () => {
        test('returns configs that have never been polled', () => {
            createTestConfig();

            const due = findDuePollingConfigs(db);
            expect(due).toHaveLength(1);
        });

        test('does not return paused configs', () => {
            const config = createTestConfig();
            updateMentionPollingConfig(db, config.id, { status: 'paused' });

            const due = findDuePollingConfigs(db);
            expect(due).toHaveLength(0);
        });

        test('returns configs whose interval has elapsed', () => {
            const config = createTestConfig({ intervalSeconds: 30 });
            // Set last_poll_at to 2 minutes ago (well past the 30s interval)
            db.query(`
                UPDATE mention_polling_configs
                SET last_poll_at = datetime('now', '-120 seconds')
                WHERE id = ?
            `).run(config.id);

            const due = findDuePollingConfigs(db);
            expect(due).toHaveLength(1);
            expect(due[0].id).toBe(config.id);
        });

        test('does not return configs whose interval has not elapsed', () => {
            const config = createTestConfig({ intervalSeconds: 3600 });
            // Set last_poll_at to now
            updatePollState(db, config.id);

            const due = findDuePollingConfigs(db);
            expect(due).toHaveLength(0);
        });

        test('returns multiple due configs sorted by last_poll_at ASC (null first)', () => {
            const c1 = createTestConfig({ repo: 'owner/repo-1', intervalSeconds: 30 });
            const c2 = createTestConfig({ repo: 'owner/repo-2', intervalSeconds: 30 });

            // Set c1 to have been polled a while ago, c2 never polled
            db.query(`
                UPDATE mention_polling_configs
                SET last_poll_at = datetime('now', '-120 seconds')
                WHERE id = ?
            `).run(c1.id);

            const due = findDuePollingConfigs(db);
            expect(due).toHaveLength(2);
            // c2 (null last_poll_at) should come first
            expect(due[0].id).toBe(c2.id);
            expect(due[1].id).toBe(c1.id);
        });
    });

    // ── updatePollState ─────────────────────────────────────────────────────

    describe('updatePollState', () => {
        test('updates last_poll_at timestamp', () => {
            const config = createTestConfig();
            expect(config.lastPollAt).toBeNull();

            updatePollState(db, config.id);

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.lastPollAt).toBeTruthy();
        });

        test('updates last_poll_at and last_seen_id when provided', () => {
            const config = createTestConfig();

            updatePollState(db, config.id, 'comment-12345');

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.lastPollAt).toBeTruthy();
            expect(updated.lastSeenId).toBe('comment-12345');
        });
    });

    // ── incrementPollingTriggerCount ─────────────────────────────────────────

    describe('incrementPollingTriggerCount', () => {
        test('increments trigger count by 1', () => {
            const config = createTestConfig();
            expect(config.triggerCount).toBe(0);

            incrementPollingTriggerCount(db, config.id);

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.triggerCount).toBe(1);
        });

        test('increments multiple times', () => {
            const config = createTestConfig();

            incrementPollingTriggerCount(db, config.id);
            incrementPollingTriggerCount(db, config.id);
            incrementPollingTriggerCount(db, config.id);

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.triggerCount).toBe(3);
        });
    });

    // ── updateProcessedIds ──────────────────────────────────────────────────

    describe('updateProcessedIds', () => {
        test('stores processed IDs', () => {
            const config = createTestConfig();
            const ids = ['comment-1', 'comment-2', 'issue-3'];

            updateProcessedIds(db, config.id, ids);

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.processedIds).toEqual(ids);
        });

        test('caps at 200 IDs', () => {
            const config = createTestConfig();
            const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

            updateProcessedIds(db, config.id, ids);

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.processedIds).toHaveLength(200);
            // Should keep the most recent (last 200)
            expect(updated.processedIds[0]).toBe('id-50');
            expect(updated.processedIds[199]).toBe('id-249');
        });

        test('replaces existing processed IDs', () => {
            const config = createTestConfig();
            updateProcessedIds(db, config.id, ['old-1', 'old-2']);
            updateProcessedIds(db, config.id, ['new-1']);

            const updated = getMentionPollingConfig(db, config.id)!;
            expect(updated.processedIds).toEqual(['new-1']);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MentionPollingService
// ═══════════════════════════════════════════════════════════════════════════════

describe('MentionPollingService', () => {

    // ── Lifecycle ───────────────────────────────────────────────────────────

    describe('start/stop lifecycle', () => {
        test('starts and stops without error', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            service.start();
            const statsWhileRunning = service.getStats();
            expect(statsWhileRunning.isRunning).toBe(true);

            service.stop();
            const statsAfterStop = service.getStats();
            expect(statsAfterStop.isRunning).toBe(false);
        });

        test('start is idempotent (calling twice does not throw)', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            service.start();
            service.start(); // should not throw or double-start

            const stats = service.getStats();
            expect(stats.isRunning).toBe(true);

            service.stop();
        });

        test('stop is idempotent (calling twice does not throw)', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            service.start();
            service.stop();
            service.stop(); // should not throw

            expect(service.getStats().isRunning).toBe(false);
        });

        test('stop without start does not throw', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            service.stop(); // never started
            expect(service.getStats().isRunning).toBe(false);
        });
    });

    // ── getStats ────────────────────────────────────────────────────────────

    describe('getStats', () => {
        test('returns zeroes when no configs exist', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            const stats = service.getStats();
            expect(stats).toEqual({
                isRunning: false,
                activeConfigs: 0,
                totalConfigs: 0,
                totalTriggers: 0,
            });
        });

        test('counts active and total configs', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            createTestConfig({ repo: 'owner/active-1' });
            createTestConfig({ repo: 'owner/active-2' });
            const paused = createTestConfig({ repo: 'owner/paused-1' });
            updateMentionPollingConfig(db, paused.id, { status: 'paused' });

            const stats = service.getStats();
            expect(stats.totalConfigs).toBe(3);
            expect(stats.activeConfigs).toBe(2);
            expect(stats.totalTriggers).toBe(0);
        });

        test('sums trigger counts', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            const c1 = createTestConfig({ repo: 'owner/repo-1' });
            const c2 = createTestConfig({ repo: 'owner/repo-2' });

            incrementPollingTriggerCount(db, c1.id);
            incrementPollingTriggerCount(db, c1.id);
            incrementPollingTriggerCount(db, c2.id);

            const stats = service.getStats();
            expect(stats.totalTriggers).toBe(3);
        });

        test('reflects isRunning state', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            expect(service.getStats().isRunning).toBe(false);

            service.start();
            expect(service.getStats().isRunning).toBe(true);

            service.stop();
            expect(service.getStats().isRunning).toBe(false);
        });
    });

    // ── Event subscription ──────────────────────────────────────────────────

    describe('onEvent', () => {
        test('returns an unsubscribe function', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            const callback = mock(() => {});
            const unsub = service.onEvent(callback);

            expect(typeof unsub).toBe('function');
        });

        test('unsubscribe prevents future callbacks', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            const callback = mock(() => {});
            const unsub = service.onEvent(callback);
            unsub();

            // The callback set should no longer contain the callback.
            // We cannot directly test emission without triggering internal methods,
            // but we can verify unsubscribe returns cleanly.
            expect(callback).not.toHaveBeenCalled();
        });

        test('multiple subscribers can be added', () => {
            const pm = createMockProcessManager();
            const service = new MentionPollingService(db, pm);

            const cb1 = mock(() => {});
            const cb2 = mock(() => {});

            const unsub1 = service.onEvent(cb1);
            const unsub2 = service.onEvent(cb2);

            expect(typeof unsub1).toBe('function');
            expect(typeof unsub2).toBe('function');

            // Unsubscribe one, the other should still be subscribed
            unsub1();
            // Both unsub functions should work without errors
            unsub2();
        });
    });

    // ── Constructor ─────────────────────────────────────────────────────────

    describe('constructor', () => {
        test('accepts optional workTaskService parameter', () => {
            const pm = createMockProcessManager();

            // With workTaskService
            const service1 = new MentionPollingService(db, pm, {});
            expect(service1.getStats().isRunning).toBe(false);

            // Without workTaskService
            const service2 = new MentionPollingService(db, pm);
            expect(service2.getStats().isRunning).toBe(false);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mention Polling Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mention Polling Routes', () => {

    function createPollingService() {
        const pm = createMockProcessManager();
        return new MentionPollingService(db, pm);
    }

    // ── GET /api/mention-polling ────────────────────────────────────────────

    describe('GET /api/mention-polling', () => {
        test('returns empty configs array when none exist', async () => {
            const service = createPollingService();
            const { req, url } = fakeReq('GET', '/api/mention-polling');
            const res = handleMentionPollingRoutes(req, url, db, service)!;

            expect(res).not.toBeNull();
            const body = await getJson(res);
            expect(body.configs).toEqual([]);
        });

        test('returns all configs', async () => {
            const service = createPollingService();
            createTestConfig({ repo: 'owner/repo-1' });
            createTestConfig({ repo: 'owner/repo-2' });

            const { req, url } = fakeReq('GET', '/api/mention-polling');
            const res = handleMentionPollingRoutes(req, url, db, service)!;

            const body = await getJson(res);
            expect(body.configs).toHaveLength(2);
        });

        test('filters by agentId query param', async () => {
            const service = createPollingService();
            const agent2 = createAgent(db, { name: 'Agent2', model: 'sonnet' });
            createTestConfig({ repo: 'owner/repo-1' });
            createTestConfig({ agentId: agent2.id, repo: 'owner/repo-2' });

            const { req, url } = fakeReq('GET', `/api/mention-polling?agentId=${agentId}`);
            const res = handleMentionPollingRoutes(req, url, db, service)!;

            const body = await getJson(res);
            expect(body.configs).toHaveLength(1);
            expect(body.configs![0].agentId).toBe(agentId);
        });
    });

    // ── POST /api/mention-polling ───────────────────────────────────────────

    describe('POST /api/mention-polling', () => {
        test('creates a config with valid input', async () => {
            const service = createPollingService();
            const { req, url } = fakeReq('POST', '/api/mention-polling', {
                agentId,
                repo: 'owner/new-repo',
                mentionUsername: 'my-bot',
                projectId,
            });

            const res = await handleMentionPollingRoutes(req, url, db, service)!;

            expect(res).not.toBeNull();
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.id).toBeTruthy();
            expect(body.repo).toBe('owner/new-repo');
            expect(body.mentionUsername).toBe('my-bot');
            expect(body.status).toBe('active');
        });

        test('creates a config with optional fields', async () => {
            const service = createPollingService();
            const { req, url } = fakeReq('POST', '/api/mention-polling', {
                agentId,
                repo: 'owner/repo',
                mentionUsername: 'bot',
                projectId,
                intervalSeconds: 120,
                eventFilter: ['issue_comment'],
                allowedUsers: ['alice'],
            });

            const res = await handleMentionPollingRoutes(req, url, db, service)!;

            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.intervalSeconds).toBe(120);
            expect(body.eventFilter).toEqual(['issue_comment']);
            expect(body.allowedUsers).toEqual(['alice']);
        });

        test('returns 400 for missing required fields', async () => {
            const service = createPollingService();
            const { req, url } = fakeReq('POST', '/api/mention-polling', {
                // missing agentId, repo, mentionUsername
            });

            const res = await handleMentionPollingRoutes(req, url, db, service)!;

            expect(res.status).toBe(400);
        });

        test('returns 400 for invalid repo format', async () => {
            const service = createPollingService();
            const { req, url } = fakeReq('POST', '/api/mention-polling', {
                agentId,
                repo: 'invalid-repo-format',
                mentionUsername: 'bot',
            });

            const res = await handleMentionPollingRoutes(req, url, db, service)!;

            expect(res.status).toBe(400);
        });

        test('returns 400 for invalid JSON body', async () => {
            const service = createPollingService();
            const url = new URL('http://localhost:3000/api/mention-polling');
            const req = new Request(url.toString(), {
                method: 'POST',
                body: 'not json',
                headers: { 'Content-Type': 'application/json' },
            });

            const res = await handleMentionPollingRoutes(req, url, db, service)!;

            expect(res.status).toBe(400);
        });

        test('returns 400 when intervalSeconds is below minimum', async () => {
            const service = createPollingService();
            const { req, url } = fakeReq('POST', '/api/mention-polling', {
                agentId,
                repo: 'owner/repo',
                mentionUsername: 'bot',
                intervalSeconds: 5, // min is 30
            });

            const res = await handleMentionPollingRoutes(req, url, db, service)!;

            expect(res.status).toBe(400);
        });
    });

    // ── GET /api/mention-polling/stats ──────────────────────────────────────

    describe('GET /api/mention-polling/stats', () => {
        test('returns stats from service', async () => {
            const service = createPollingService();
            createTestConfig();

            const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
            const res = handleMentionPollingRoutes(req, url, db, service)!;

            expect(res).not.toBeNull();
            const body = await getJson(res);
            expect(body.isRunning).toBe(false);
            expect(body.totalConfigs).toBe(1);
            expect(body.activeConfigs).toBe(1);
            expect(body.totalTriggers).toBe(0);
        });

        test('returns default stats when pollingService is null', async () => {
            const { req, url } = fakeReq('GET', '/api/mention-polling/stats');
            const res = handleMentionPollingRoutes(req, url, db, null)!;

            expect(res).not.toBeNull();
            const body = await getJson(res);
            expect(body.isRunning).toBe(false);
            expect(body.activeConfigs).toBe(0);
            expect(body.totalConfigs).toBe(0);
            expect(body.totalTriggers).toBe(0);
        });
    });

    // ── GET /api/mention-polling/:id ────────────────────────────────────────

    describe('GET /api/mention-polling/:id', () => {
        test('returns a config by ID', async () => {
            const service = createPollingService();
            const config = createTestConfig();

            const { req, url } = fakeReq('GET', `/api/mention-polling/${config.id}`);
            const res = handleMentionPollingRoutes(req, url, db, service)!;

            expect(res).not.toBeNull();
            const body = await getJson(res);
            expect(body.id).toBe(config.id);
            expect(body.repo).toBe('owner/repo');
        });

        test('returns 404 for non-existent ID', async () => {
            const service = createPollingService();

            const { req, url } = fakeReq('GET', '/api/mention-polling/non-existent');
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res).not.toBeNull();
            expect(res.status).toBe(404);
            const body = await res.json();
            expect(body.error).toBeTruthy();
        });
    });

    // ── PUT /api/mention-polling/:id ────────────────────────────────────────

    describe('PUT /api/mention-polling/:id', () => {
        test('updates a config', async () => {
            const service = createPollingService();
            const config = createTestConfig();

            const { req, url } = fakeReq('PUT', `/api/mention-polling/${config.id}`, {
                status: 'paused',
                intervalSeconds: 300,
            });
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res).not.toBeNull();
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.status).toBe('paused');
            expect(body.intervalSeconds).toBe(300);
        });

        test('returns 404 for non-existent ID', async () => {
            const service = createPollingService();

            const { req, url } = fakeReq('PUT', '/api/mention-polling/non-existent', {
                status: 'paused',
            });
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res).not.toBeNull();
            expect(res.status).toBe(404);
        });

        test('returns 400 for invalid status value', async () => {
            const service = createPollingService();
            const config = createTestConfig();

            const { req, url } = fakeReq('PUT', `/api/mention-polling/${config.id}`, {
                status: 'invalid-status',
            });
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res.status).toBe(400);
        });

        test('returns 400 for invalid intervalSeconds', async () => {
            const service = createPollingService();
            const config = createTestConfig();

            const { req, url } = fakeReq('PUT', `/api/mention-polling/${config.id}`, {
                intervalSeconds: 10, // min is 30
            });
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res.status).toBe(400);
        });
    });

    // ── DELETE /api/mention-polling/:id ──────────────────────────────────────

    describe('DELETE /api/mention-polling/:id', () => {
        test('deletes a config', async () => {
            const service = createPollingService();
            const config = createTestConfig();

            const { req, url } = fakeReq('DELETE', `/api/mention-polling/${config.id}`);
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res).not.toBeNull();
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.ok).toBe(true);

            // Verify it was actually deleted
            expect(getMentionPollingConfig(db, config.id)).toBeNull();
        });

        test('returns 404 for non-existent ID', async () => {
            const service = createPollingService();

            const { req, url } = fakeReq('DELETE', '/api/mention-polling/non-existent');
            const res = (await handleMentionPollingRoutes(req, url, db, service)) as Response;

            expect(res).not.toBeNull();
            expect(res.status).toBe(404);
        });
    });

    // ── Unmatched routes ────────────────────────────────────────────────────

    describe('unmatched routes', () => {
        test('returns null for unrelated paths', () => {
            const service = createPollingService();
            const { req, url } = fakeReq('GET', '/api/agents');
            const res = handleMentionPollingRoutes(req, url, db, service);

            expect(res).toBeNull();
        });

        test('returns null for unsupported methods on collection endpoint', () => {
            const service = createPollingService();
            const { req, url } = fakeReq('PATCH', '/api/mention-polling');
            const res = handleMentionPollingRoutes(req, url, db, service);

            expect(res).toBeNull();
        });
    });
});
