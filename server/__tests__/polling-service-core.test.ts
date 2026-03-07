/**
 * Tests for MentionPollingService — core polling loop, processMention,
 * dependency checking, and private helpers.
 *
 * These complement the existing polling-service.test.ts which covers
 * lifecycle, stats, events, prompt building, and runGh.
 */
import { test, expect, beforeEach, afterEach, describe, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import {
    createMentionPollingConfig,
} from '../db/mention-polling';
import { MentionPollingService } from '../polling/service';
import type { DetectedMention } from '../polling/github-searcher';

// ─── Test Setup ─────────────────────────────────────────────────────────────

let db: Database;
let agentId: string;
let projectId: string;

const mockStartProcess = mock(() => {});

const mockProcessManager = {
    startProcess: mockStartProcess,
    stopProcess: mock(() => {}),
    getProcess: mock(() => null),
    listProcesses: mock(() => []),
    approvalManager: { operationalMode: 'autonomous' },
} as unknown as import('../process/manager').ProcessManager;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    const agent = createAgent(db, { name: 'TestAgent', model: 'sonnet' });
    agentId = agent.id;
    const project = createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });
    projectId = project.id;

    mockStartProcess.mockReset();
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

function makeMention(overrides: Partial<DetectedMention> = {}): DetectedMention {
    return {
        id: 'comment-100',
        type: 'issue_comment',
        body: 'Hey @corvid-bot fix this please',
        sender: 'testuser',
        number: 42,
        title: 'Test Issue',
        htmlUrl: 'https://github.com/CorvidLabs/corvid-agent/issues/42#issuecomment-100',
        createdAt: new Date().toISOString(),
        isPullRequest: false,
        ...overrides,
    };
}

// ─── Helper: access private methods via type casting ────────────────────────

type PrivateService = {
    pollDueConfigs: () => Promise<void>;
    pollConfig: (config: unknown) => Promise<void>;
    processMention: (config: unknown, mention: DetectedMention) => Promise<boolean>;
    parseBlockedBy: (body: string) => number[];
    isIssueOpen: (repo: string, issueNumber: number) => Promise<boolean>;
    getIssueAssignees: (repo: string, issueNumber: number) => Promise<string[]>;
    getIssueBody: (repo: string, issueNumber: number) => Promise<string>;
    checkDependencies: (repo: string, mention: DetectedMention) => Promise<number[]>;
    runGh: (args: string[]) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
    fetchMentions: (config: unknown) => Promise<DetectedMention[]>;
    searcher: { fetchMentions: (...args: unknown[]) => Promise<DetectedMention[]>; clearGlobalReviewCache: () => void };
    issueStateCache: Map<string, { open: boolean; checkedAt: number }>;
    dedup: import('../lib/dedup').DedupService;
    activePolls: Set<string>;
};

function getPrivate(service: MentionPollingService): PrivateService {
    return service as unknown as PrivateService;
}

// ─── pollDueConfigs ─────────────────────────────────────────────────────────

describe('pollDueConfigs', () => {
    test('does nothing when not running', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        // service is not started, so running = false
        const priv = getPrivate(service);
        await priv.pollDueConfigs();
        // No errors, no configs processed
        expect(priv.activePolls.size).toBe(0);
    });

    test('does nothing when no configs are due', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        service.start();

        // No configs in DB at all
        const priv = getPrivate(service);
        await priv.pollDueConfigs();

        service.stop();
    });

    test('skips configs that are already being polled', async () => {
        const config = createTestConfig();

        const service = new MentionPollingService(db, mockProcessManager);
        service.start();
        const priv = getPrivate(service);

        // Mark config as already being polled
        priv.activePolls.add(config.id);

        // Mock fetchMentions to track if it is called
        const fetchMentionsCalled = mock(() => Promise.resolve([]));
        priv.fetchMentions = fetchMentionsCalled;

        await priv.pollDueConfigs();

        // fetchMentions should not have been called since config was active
        expect(fetchMentionsCalled).not.toHaveBeenCalled();

        priv.activePolls.delete(config.id);
        service.stop();
    });

    test('limits concurrent polls to MAX_CONCURRENT_POLLS', async () => {
        // Create more than 3 configs (MAX_CONCURRENT_POLLS = 3)
        createTestConfig({ repo: 'org/repo1' });
        createTestConfig({ repo: 'org/repo2' });
        createTestConfig({ repo: 'org/repo3' });
        createTestConfig({ repo: 'org/repo4' });
        createTestConfig({ repo: 'org/repo5' });

        const service = new MentionPollingService(db, mockProcessManager);
        service.start();
        const priv = getPrivate(service);

        // Track how many pollConfig calls happen concurrently
        let maxConcurrent = 0;
        let currentConcurrent = 0;

        // Mock fetchMentions to simulate slow polling
        priv.fetchMentions = mock(async () => {
            currentConcurrent++;
            if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
            await new Promise((resolve) => setTimeout(resolve, 10));
            currentConcurrent--;
            return [];
        });

        await priv.pollDueConfigs();

        // Should have processed at most 3 at once
        expect(maxConcurrent).toBeLessThanOrEqual(3);

        service.stop();
    });
});

// ─── pollConfig component tests ─────────────────────────────────────────────
// Note: pollConfig wraps its async work in runWithEventContext which uses
// AsyncLocalStorage. Since the inner Promise cannot be directly awaited in
// Bun's test runner, we test the individual components that pollConfig
// orchestrates: parseBlockedBy, processMention, dedup, etc.

describe('pollConfig components', () => {
    test('parseBlockedBy extracts issue numbers from blocked-by markers', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const parse = (body: string) => getPrivate(service).parseBlockedBy(body);

        expect(parse('<!-- blocked-by: #123 #456 -->')).toEqual([123, 456]);
        expect(parse('<!-- blocked-by: #7 -->')).toEqual([7]);
        expect(parse('No markers here')).toEqual([]);
        expect(parse('')).toEqual([]);
        expect(parse('<!-- blocked-by: -->')).toEqual([]);
    });

    test('activePolls tracks config IDs being polled', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.activePolls.add('config-1');
        expect(priv.activePolls.has('config-1')).toBe(true);

        priv.activePolls.delete('config-1');
        expect(priv.activePolls.has('config-1')).toBe(false);
    });

    test('filterNewMentions filters already-processed IDs', () => {
        // Test via the exported function from github-searcher
        const { filterNewMentions } = require('../polling/github-searcher');
        const mentions = [
            makeMention({ id: 'a' }),
            makeMention({ id: 'b' }),
            makeMention({ id: 'c' }),
        ];

        const filtered = filterNewMentions(mentions, ['a', 'c']);
        expect(filtered.length).toBe(1);
        expect(filtered[0].id).toBe('b');
    });

    test('updatePollState updates timestamp in DB', () => {
        const config = createTestConfig();
        expect(config.lastPollAt).toBeNull();

        const { updatePollState } = require('../db/mention-polling');
        updatePollState(db, config.id, 'comment-newest');

        const row = db.query('SELECT last_poll_at, last_seen_id FROM mention_polling_configs WHERE id = ?').get(config.id) as { last_poll_at: string; last_seen_id: string };
        expect(row.last_poll_at).not.toBeNull();
        expect(row.last_seen_id).toBe('comment-newest');
    });

    test('updateProcessedIds persists ID set to DB', () => {
        const config = createTestConfig();
        const { updateProcessedIds } = require('../db/mention-polling');

        updateProcessedIds(db, config.id, ['id-1', 'id-2', 'id-3']);

        const row = db.query('SELECT processed_ids FROM mention_polling_configs WHERE id = ?').get(config.id) as { processed_ids: string };
        const ids = JSON.parse(row.processed_ids);
        expect(ids).toEqual(['id-1', 'id-2', 'id-3']);
    });

    test('processMention triggers session for multiple different issue numbers', async () => {
        const config = createTestConfig();
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('.body'))) return { ok: true, stdout: '', stderr: '' };
            if (args.some(a => a.includes('[.assignees'))) return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            return { ok: true, stdout: '', stderr: '' };
        });

        // Trigger for issue #42
        const result1 = await priv.processMention(config, makeMention({ id: 'comment-200', number: 42 }));
        expect(result1).toBe(true);

        // Trigger for issue #99
        const result2 = await priv.processMention(config, makeMention({ id: 'comment-300', number: 99 }));
        expect(result2).toBe(true);

        expect(mockStartProcess).toHaveBeenCalledTimes(2);
    });
});

// ─── processMention ─────────────────────────────────────────────────────────

describe('processMention', () => {
    test('skips mention when agent not found', async () => {
        const config = createTestConfig();
        // Delete the agent to simulate "not found"
        db.query('DELETE FROM agents WHERE id = ?').run(config.agentId);

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        const result = await priv.processMention(config, makeMention());
        expect(result).toBe(false);
    });

    test('skips mention when rate limited (dedup)', async () => {
        const config = createTestConfig();
        const mention = makeMention();

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        // Mark as already seen
        priv.dedup.markSeen('polling:triggers', `${config.id}:${mention.id}`);

        const result = await priv.processMention(config, mention);
        expect(result).toBe(false);
    });

    test('skips mention when running session already exists for same issue', async () => {
        const config = createTestConfig();

        // Create a running session for issue #42
        const { createSession } = await import('../db/sessions');
        const session = createSession(db, {
            projectId,
            agentId,
            name: 'Poll: CorvidLabs/corvid-agent #42: Test Issue',
            initialPrompt: 'test',
            source: 'agent',
        });
        db.query("UPDATE sessions SET status = 'running' WHERE id = ?").run(session.id);

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);
        priv.runGh = mock(async () => ({ ok: true, stdout: JSON.stringify([]), stderr: '' }));

        const result = await priv.processMention(config, makeMention({ number: 42 }));
        expect(result).toBe(false);
    });

    test('allows mention when previous session for same issue is idle (not running)', async () => {
        const config = createTestConfig();

        // Create an idle (completed) session for issue #42
        const { createSession } = await import('../db/sessions');
        const session = createSession(db, {
            projectId,
            agentId,
            name: 'Poll: CorvidLabs/corvid-agent #42: Old Issue',
            initialPrompt: 'test',
            source: 'agent',
        });
        db.query("UPDATE sessions SET status = 'idle' WHERE id = ?").run(session.id);

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);
        // Mock runGh for assignee checks, dependency checks
        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('/issues/') && a.includes('.state'))) {
                return { ok: true, stdout: 'closed', stderr: '' };
            }
            if (args.some(a => a.includes('/issues/') && a.includes('.assignees'))) {
                return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const result = await priv.processMention(config, makeMention({ number: 42 }));
        expect(result).toBe(true);
        expect(mockStartProcess).toHaveBeenCalledTimes(1);
    });

    test('skips mention when blocked by open dependencies', async () => {
        const config = createTestConfig();

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        // Mention body has blocked-by marker (this is the issue body for type 'issues')
        const mention = makeMention({
            type: 'issues',
            body: 'Fix this thing\n<!-- blocked-by: #10 #20 -->',
        });

        // Mock: issue #10 is open, #20 is closed
        priv.runGh = mock(async (args: string[]) => {
            const pathArg = args.find(a => a.includes('repos/'));
            if (pathArg?.includes('/issues/10') && args.includes('.state')) {
                return { ok: true, stdout: 'open', stderr: '' };
            }
            if (pathArg?.includes('/issues/20') && args.includes('.state')) {
                return { ok: true, stdout: 'closed', stderr: '' };
            }
            // assignees check
            if (args.some(a => a.includes('.assignees'))) {
                return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const result = await priv.processMention(config, mention);
        expect(result).toBe(false);
    });

    test('skips mention when issue is assigned to human (not the bot)', async () => {
        const config = createTestConfig();
        const mention = makeMention({ type: 'issue_comment' }); // not an assignment

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        // Mock: issue has assignees that are not the bot
        priv.runGh = mock(async (args: string[]) => {
            // Issue body for dependency check
            if (args.some(a => a.includes('.body'))) {
                return { ok: true, stdout: 'Some issue body', stderr: '' };
            }
            // Assignees
            if (args.some(a => a.includes('.assignees') || a.includes('[.assignees'))) {
                return { ok: true, stdout: JSON.stringify(['human-dev']), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const result = await priv.processMention(config, mention);
        expect(result).toBe(false);
    });

    test('does not skip assignment mentions based on assignee guard', async () => {
        const config = createTestConfig();
        const mention = makeMention({
            type: 'assignment',
            id: 'assigned-42',
        });

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('.body'))) {
                return { ok: true, stdout: 'Issue body', stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const result = await priv.processMention(config, mention);
        // Should proceed past the assignee guard since it's an assignment type
        expect(result).toBe(true);
        expect(mockStartProcess).toHaveBeenCalledTimes(1);
    });

    test('creates session and calls startProcess on successful trigger', async () => {
        const config = createTestConfig();
        const mention = makeMention();

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('.body'))) {
                return { ok: true, stdout: 'No blockers here', stderr: '' };
            }
            if (args.some(a => a.includes('[.assignees'))) {
                return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const result = await priv.processMention(config, mention);
        expect(result).toBe(true);

        // Verify session was created
        const sessions = db.query("SELECT * FROM sessions WHERE name LIKE 'Poll: %'").all() as Array<{ name: string }>;
        expect(sessions.length).toBe(1);
        expect(sessions[0].name).toContain('#42');

        // Verify startProcess was called
        expect(mockStartProcess).toHaveBeenCalledTimes(1);
    });

    test('increments trigger count on successful trigger', async () => {
        const config = createTestConfig();

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('.body'))) {
                return { ok: true, stdout: '', stderr: '' };
            }
            if (args.some(a => a.includes('[.assignees'))) {
                return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        await priv.processMention(config, makeMention());

        const row = db.query('SELECT trigger_count FROM mention_polling_configs WHERE id = ?').get(config.id) as { trigger_count: number };
        expect(row.trigger_count).toBe(1);
    });

    test('emits event on successful trigger', async () => {
        const config = createTestConfig();
        const events: unknown[] = [];

        const service = new MentionPollingService(db, mockProcessManager);
        service.onEvent((event) => events.push(event));
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('.body'))) {
                return { ok: true, stdout: '', stderr: '' };
            }
            if (args.some(a => a.includes('[.assignees'))) {
                return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        await priv.processMention(config, makeMention());

        expect(events.length).toBe(1);
        expect((events[0] as Record<string, unknown>).type).toBe('mention_poll_trigger');
    });

    test('returns false when session creation fails', async () => {
        // Use a closed database to force an error
        const badDb = new Database(':memory:');
        badDb.exec('PRAGMA foreign_keys = ON');
        runMigrations(badDb);

        const badAgent = createAgent(badDb, { name: 'BadAgent', model: 'sonnet' });
        const badProject = createProject(badDb, { name: 'BadProject', workingDir: '/tmp/bad' });
        const config = createMentionPollingConfig(badDb, {
            agentId: badAgent.id,
            repo: 'CorvidLabs/corvid-agent',
            mentionUsername: 'corvid-bot',
            projectId: badProject.id,
        });

        const service = new MentionPollingService(badDb, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            if (args.some(a => a.includes('.body'))) {
                return { ok: true, stdout: '', stderr: '' };
            }
            if (args.some(a => a.includes('[.assignees'))) {
                return { ok: true, stdout: JSON.stringify([]), stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        // Force startProcess to throw
        mockStartProcess.mockImplementation(() => { throw new Error('Process failed'); });

        const result = await priv.processMention(config, makeMention());
        expect(result).toBe(false);

        badDb.close();
        mockStartProcess.mockReset();
    });
});

// ─── Dependency Checking ────────────────────────────────────────────────────

describe('isIssueOpen', () => {
    test('returns true when API says open', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: true, stdout: 'open', stderr: '' }));

        const result = await priv.isIssueOpen('CorvidLabs/repo', 123);
        expect(result).toBe(true);
    });

    test('returns false when API says closed', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: true, stdout: 'closed', stderr: '' }));

        const result = await priv.isIssueOpen('CorvidLabs/repo', 123);
        expect(result).toBe(false);
    });

    test('returns false when API fails', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: false, stdout: '', stderr: 'error' }));

        const result = await priv.isIssueOpen('CorvidLabs/repo', 123);
        expect(result).toBe(false);
    });

    test('caches issue state', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        const ghMock = mock(async () => ({ ok: true, stdout: 'open', stderr: '' }));
        priv.runGh = ghMock;

        await priv.isIssueOpen('CorvidLabs/repo', 123);
        await priv.isIssueOpen('CorvidLabs/repo', 123);

        // Should only call gh once (second call uses cache)
        expect(ghMock).toHaveBeenCalledTimes(1);
    });

    test('cache expires after TTL', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        const ghMock = mock(async () => ({ ok: true, stdout: 'open', stderr: '' }));
        priv.runGh = ghMock;

        // Set an expired cache entry
        priv.issueStateCache.set('CorvidLabs/repo#123', {
            open: true,
            checkedAt: Date.now() - 6 * 60 * 1000, // 6 min ago (TTL is 5 min)
        });

        await priv.isIssueOpen('CorvidLabs/repo', 123);

        // Should make a new API call since cache expired
        expect(ghMock).toHaveBeenCalledTimes(1);
    });
});

describe('getIssueAssignees', () => {
    test('returns parsed assignee logins', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({
            ok: true,
            stdout: JSON.stringify(['alice', 'bob']),
            stderr: '',
        }));

        const result = await priv.getIssueAssignees('CorvidLabs/repo', 42);
        expect(result).toEqual(['alice', 'bob']);
    });

    test('returns empty array on failure', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: false, stdout: '', stderr: 'error' }));

        const result = await priv.getIssueAssignees('CorvidLabs/repo', 42);
        expect(result).toEqual([]);
    });

    test('returns empty array on invalid JSON', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: true, stdout: 'not json', stderr: '' }));

        const result = await priv.getIssueAssignees('CorvidLabs/repo', 42);
        expect(result).toEqual([]);
    });

    test('returns empty array when parsed value is not an array', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({
            ok: true,
            stdout: JSON.stringify({ login: 'alice' }),
            stderr: '',
        }));

        const result = await priv.getIssueAssignees('CorvidLabs/repo', 42);
        expect(result).toEqual([]);
    });
});

describe('getIssueBody', () => {
    test('returns issue body on success', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({
            ok: true,
            stdout: 'This is the issue body with <!-- blocked-by: #5 -->',
            stderr: '',
        }));

        const result = await priv.getIssueBody('CorvidLabs/repo', 42);
        expect(result).toContain('blocked-by');
    });

    test('returns empty string on failure', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: false, stdout: '', stderr: 'not found' }));

        const result = await priv.getIssueBody('CorvidLabs/repo', 999);
        expect(result).toBe('');
    });
});

describe('checkDependencies', () => {
    test('returns empty when no blocked-by markers', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async () => ({ ok: true, stdout: 'No markers here', stderr: '' }));

        const mention = makeMention({ type: 'issues', body: 'No blockers' });
        const result = await priv.checkDependencies('CorvidLabs/repo', mention);
        expect(result).toEqual([]);
    });

    test('returns open blocker issue numbers', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        priv.runGh = mock(async (args: string[]) => {
            const pathArg = args.find(a => a.includes('repos/'));
            if (pathArg?.includes('/issues/10')) {
                // For isIssueOpen: returns "open"
                if (args.includes('.state')) return { ok: true, stdout: 'open', stderr: '' };
            }
            if (pathArg?.includes('/issues/20')) {
                if (args.includes('.state')) return { ok: true, stdout: 'closed', stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const mention = makeMention({
            type: 'issues',
            body: 'Fix thing\n<!-- blocked-by: #10 #20 -->',
        });

        const result = await priv.checkDependencies('CorvidLabs/repo', mention);
        expect(result).toEqual([10]);
    });

    test('fetches issue body for issue_comment mentions', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        let fetchedIssueBody = false;
        priv.runGh = mock(async (args: string[]) => {
            // getIssueBody call
            if (args.some(a => a.includes('.body'))) {
                fetchedIssueBody = true;
                return { ok: true, stdout: 'Body without markers', stderr: '' };
            }
            return { ok: true, stdout: '', stderr: '' };
        });

        const mention = makeMention({
            type: 'issue_comment',
            body: 'Just a comment, not the issue body',
        });

        await priv.checkDependencies('CorvidLabs/repo', mention);
        expect(fetchedIssueBody).toBe(true);
    });

    test('uses mention body directly for issue type mentions', async () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        const ghCalls: string[][] = [];
        priv.runGh = mock(async (args: string[]) => {
            ghCalls.push(args);
            return { ok: true, stdout: '', stderr: '' };
        });

        const mention = makeMention({
            type: 'issues',
            body: 'Issue body without blockers',
        });

        await priv.checkDependencies('CorvidLabs/repo', mention);

        // Should not have called getIssueBody (no .body jq call)
        const bodyFetches = ghCalls.filter(args => args.some(a => a.includes('.body')));
        expect(bodyFetches.length).toBe(0);
    });
});

// ─── Scheduler integration ──────────────────────────────────────────────────

describe('scheduler integration', () => {
    test('setSchedulerService stores reference', () => {
        const service = new MentionPollingService(db, mockProcessManager);
        const mockScheduler = { triggerNow: mock(() => Promise.resolve()) } as unknown as import('../scheduler/service').SchedulerService;
        service.setSchedulerService(mockScheduler);
        // No error, scheduler is stored
    });

    test('findSchedulesForEvent returns matching schedules for github_poll', async () => {
        const { createSchedule, findSchedulesForEvent } = await import('../db/schedules');
        createSchedule(db, {
            agentId,
            name: 'Poll Trigger Schedule',
            actions: [{ type: 'send_message', message: 'test', toAgentId: 'agent-1' }],
            intervalMs: 3600000,
            triggerEvents: [{ source: 'github_poll', event: 'mention', repo: 'CorvidLabs/corvid-agent' }],
        });

        const matching = findSchedulesForEvent(db, 'github_poll', 'mention', 'CorvidLabs/corvid-agent');
        expect(matching.length).toBeGreaterThanOrEqual(1);
    });

    test('findSchedulesForEvent returns empty for non-matching repo', async () => {
        const { createSchedule, findSchedulesForEvent } = await import('../db/schedules');
        createSchedule(db, {
            agentId,
            name: 'Other Schedule',
            actions: [{ type: 'send_message', message: 'test', toAgentId: 'agent-1' }],
            intervalMs: 3600000,
            triggerEvents: [{ source: 'github_poll', event: 'mention', repo: 'OtherOrg/other-repo' }],
        });

        const matching = findSchedulesForEvent(db, 'github_poll', 'mention', 'CorvidLabs/corvid-agent');
        // Should not match the other repo's schedule
        const otherMatching = matching.filter(s => s.name === 'Other Schedule');
        expect(otherMatching.length).toBe(0);
    });
});

// ─── Repo blocklist integration ─────────────────────────────────────────────

describe('repo blocklist in processMention', () => {
    test('skips mention from a blocklisted repo', async () => {
        const config = createTestConfig();

        // Blocklist the repo
        const { addToRepoBlocklist } = await import('../db/repo-blocklist');
        addToRepoBlocklist(db, 'CorvidLabs/corvid-agent', {
            source: 'manual',
            reason: 'testing',
        });

        const service = new MentionPollingService(db, mockProcessManager);
        const priv = getPrivate(service);

        const result = await priv.processMention(config, makeMention());
        expect(result).toBe(false);
        expect(mockStartProcess).not.toHaveBeenCalled();
    });
});
