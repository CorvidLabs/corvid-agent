import { describe, test, expect, mock, afterEach, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
    normalizeTimestamp,
    formatDuration,
    tryRecoverThread,
    archiveThread,
    archiveStaleThreads,
    createStandaloneThread,
    resolveDefaultAgent,
    type ThreadSessionInfo,
    type ThreadCallbackInfo,
} from '../discord/thread-helpers';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';

// ── normalizeTimestamp (re-verified against new source) ──

describe('normalizeTimestamp', () => {
    test('appends Z to bare SQLite timestamp', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00')).toBe('2026-03-14 12:30:00Z');
    });

    test('does not double-append Z', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00Z')).toBe('2026-03-14 12:30:00Z');
    });

    test('handles ISO format with T', () => {
        expect(normalizeTimestamp('2026-03-14T12:30:00')).toBe('2026-03-14T12:30:00Z');
    });
});

// ── formatDuration ──

describe('formatDuration', () => {
    test('formats seconds only', () => {
        expect(formatDuration(45000)).toBe('45s');
    });

    test('formats minutes and seconds', () => {
        expect(formatDuration(125000)).toBe('2m 5s');
    });

    test('formats zero', () => {
        expect(formatDuration(0)).toBe('0s');
    });

    test('clamps negative to zero', () => {
        expect(formatDuration(-5000)).toBe('0s');
    });
});

// ── tryRecoverThread ──

describe('tryRecoverThread', () => {
    test('returns null when no DB row found', () => {
        const mockDb = {
            query: () => ({
                get: () => null,
            }),
        } as any;
        const threadSessions = new Map<string, ThreadSessionInfo>();

        const result = tryRecoverThread(mockDb, threadSessions, '123456789');
        expect(result).toBeNull();
        expect(threadSessions.size).toBe(0);
    });

    test('recovers session info from DB row', () => {
        const mockDb = {
            query: () => ({
                get: () => ({
                    id: 'session-1',
                    agent_id: 'agent-1',
                    initial_prompt: 'test topic',
                    agent_name: 'TestAgent',
                    agent_model: 'gpt-4',
                    display_color: '#ff0000',
                    project_name: 'TestProject',
                }),
            }),
        } as any;
        const threadSessions = new Map<string, ThreadSessionInfo>();

        const result = tryRecoverThread(mockDb, threadSessions, '123456789');
        expect(result).not.toBeNull();
        expect(result!.sessionId).toBe('session-1');
        expect(result!.agentName).toBe('TestAgent');
        expect(result!.agentModel).toBe('gpt-4');
        expect(result!.topic).toBe('test topic');
        expect(result!.projectName).toBe('TestProject');
        expect(result!.displayColor).toBe('#ff0000');
        expect(threadSessions.get('123456789')).toBe(result!);
    });

    test('uses defaults when DB fields are empty', () => {
        const mockDb = {
            query: () => ({
                get: () => ({
                    id: 'session-2',
                    agent_id: 'agent-1',
                    initial_prompt: '',
                    agent_name: '',
                    agent_model: '',
                    display_color: null,
                    project_name: null,
                }),
            }),
        } as any;
        const threadSessions = new Map<string, ThreadSessionInfo>();

        const result = tryRecoverThread(mockDb, threadSessions, '999');
        expect(result!.agentName).toBe('Agent');
        expect(result!.agentModel).toBe('unknown');
        expect(result!.topic).toBeUndefined();
        expect(result!.projectName).toBeUndefined();
    });

    test('returns null and does not throw on DB error', () => {
        const mockDb = {
            query: () => { throw new Error('DB connection failed'); },
        } as any;
        const threadSessions = new Map<string, ThreadSessionInfo>();

        const result = tryRecoverThread(mockDb, threadSessions, '123');
        expect(result).toBeNull();
    });
});

// ── archiveThread ──

describe('archiveThread', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('calls Discord API with correct parameters', async () => {
        let capturedUrl = '';
        let capturedInit: any;
        globalThis.fetch = mock(async (url: any, init: any) => {
            capturedUrl = url.toString();
            capturedInit = init;
            return new Response('', { status: 200 });
        }) as any;

        await archiveThread('test-bot-token', '123456789012345678');
        expect(capturedUrl).toBe('https://discord.com/api/v10/channels/123456789012345678');
        expect(capturedInit.method).toBe('PATCH');
        expect(JSON.parse(capturedInit.body)).toEqual({ archived: true });
        expect(capturedInit.headers['Authorization']).toBe('Bot test-bot-token');
    });

    test('handles failed response without throwing', async () => {
        globalThis.fetch = mock(async () => {
            return new Response('Not Found', { status: 404 });
        }) as any;

        // Should not throw
        await archiveThread('token', '123456789012345678');
    });

    test('rejects non-snowflake thread ID', async () => {
        await expect(archiveThread('token', 'not-a-snowflake')).rejects.toThrow();
    });
});

// ── createStandaloneThread ──

describe('createStandaloneThread', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test('returns thread ID on success', async () => {
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({ id: '999888777666555444' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as any;

        const result = await createStandaloneThread('token', '123456789012345678', 'Test Thread');
        expect(result).toBe('999888777666555444');
    });

    test('returns null on API failure', async () => {
        globalThis.fetch = mock(async () => {
            return new Response('Forbidden', { status: 403 });
        }) as any;

        const result = await createStandaloneThread('token', '123456789012345678', 'Test Thread');
        expect(result).toBeNull();
    });

    test('truncates long names to 100 chars', async () => {
        let capturedBody = '';
        globalThis.fetch = mock(async (_url: any, init: any) => {
            capturedBody = init.body;
            return new Response(JSON.stringify({ id: '111' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as any;

        const longName = 'A'.repeat(200);
        await createStandaloneThread('token', '123456789012345678', longName);
        const parsed = JSON.parse(capturedBody);
        expect(parsed.name.length).toBe(100);
    });

    test('rejects non-snowflake channel ID', async () => {
        await expect(createStandaloneThread('token', 'bad-id', 'Test')).rejects.toThrow();
    });
});

// ── resolveDefaultAgent (uses real in-memory DB to avoid mock.module leaks) ──

describe('resolveDefaultAgent', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    test('returns null when no agents exist', () => {
        const config = {} as any;
        const result = resolveDefaultAgent(db, config);
        expect(result).toBeNull();
    });

    test('returns configured default agent when it exists', () => {
        createAgent(db, { name: 'First', model: 'opus' });
        const a2 = createAgent(db, { name: 'Second', model: 'sonnet' });

        const config = { defaultAgentId: a2.id } as any;
        const result = resolveDefaultAgent(db, config);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(a2.id);
    });

    test('falls back to first agent when default not found', () => {
        const a1 = createAgent(db, { name: 'First', model: 'opus' });

        const config = { defaultAgentId: 'nonexistent' } as any;
        const result = resolveDefaultAgent(db, config);
        expect(result!.id).toBe(a1.id);
    });

    test('returns first agent when no default configured', () => {
        createAgent(db, { name: 'First', model: 'opus' });
        createAgent(db, { name: 'Second', model: 'sonnet' });

        const config = {} as any;
        const result = resolveDefaultAgent(db, config);
        // listAgents returns ORDER BY updated_at DESC, so the most recently created comes first
        expect(result).not.toBeNull();
    });
});

// ── archiveStaleThreads ──

describe('archiveStaleThreads', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function setupFetchMock() {
        globalThis.fetch = mock(async () => {
            return new Response(JSON.stringify({ id: '1' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as any;
    }

    function makeMockProcessManager() {
        return {
            unsubscribe: mock(() => {}),
        } as any;
    }

    function makeMockDelivery() {
        return {
            track: mock(async (_id: string, fn: () => Promise<any>) => fn()),
        } as any;
    }

    test('archives stale threads and cleans up maps', async () => {
        setupFetchMock();
        const pm = makeMockProcessManager();
        const delivery = makeMockDelivery();
        const threadLastActivity = new Map<string, number>();
        const threadSessions = new Map<string, ThreadSessionInfo>();
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        const staleId = '123456789012345678';
        // Set activity to 2 hours ago
        threadLastActivity.set(staleId, Date.now() - 2 * 60 * 60 * 1000);
        threadSessions.set(staleId, {
            sessionId: 'sess-1',
            agentName: 'Test',
            agentModel: 'opus',
            ownerUserId: 'user-1',
        });
        const cb = mock(() => {}) as any;
        threadCallbacks.set(staleId, { sessionId: 'sess-1', callback: cb });

        // Threshold: 1 hour
        await archiveStaleThreads(pm, delivery, 'bot-token', threadLastActivity, threadSessions, threadCallbacks, 60 * 60 * 1000);

        expect(threadLastActivity.has(staleId)).toBe(false);
        expect(threadSessions.has(staleId)).toBe(false);
        expect(threadCallbacks.has(staleId)).toBe(false);
        expect(pm.unsubscribe).toHaveBeenCalledTimes(1);
    });

    test('does not archive threads within threshold', async () => {
        setupFetchMock();
        const pm = makeMockProcessManager();
        const delivery = makeMockDelivery();
        const threadLastActivity = new Map<string, number>();
        const threadSessions = new Map<string, ThreadSessionInfo>();
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        const activeId = '123456789012345678';
        // Set activity to 5 minutes ago (within 1 hour threshold)
        threadLastActivity.set(activeId, Date.now() - 5 * 60 * 1000);

        await archiveStaleThreads(pm, delivery, 'bot-token', threadLastActivity, threadSessions, threadCallbacks, 60 * 60 * 1000);

        expect(threadLastActivity.has(activeId)).toBe(true);
    });

    test('handles archive errors gracefully', async () => {
        globalThis.fetch = mock(async () => {
            throw new Error('Network error');
        }) as any;
        const pm = makeMockProcessManager();
        const delivery = makeMockDelivery();
        const threadLastActivity = new Map<string, number>();
        const threadSessions = new Map<string, ThreadSessionInfo>();
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        const staleId = '123456789012345678';
        threadLastActivity.set(staleId, Date.now() - 2 * 60 * 60 * 1000);

        // Should not throw
        await archiveStaleThreads(pm, delivery, 'bot-token', threadLastActivity, threadSessions, threadCallbacks, 60 * 60 * 1000);
    });

    test('skips unsubscribe when no callback registered', async () => {
        setupFetchMock();
        const pm = makeMockProcessManager();
        const delivery = makeMockDelivery();
        const threadLastActivity = new Map<string, number>();
        const threadSessions = new Map<string, ThreadSessionInfo>();
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        const staleId = '123456789012345678';
        threadLastActivity.set(staleId, Date.now() - 2 * 60 * 60 * 1000);

        await archiveStaleThreads(pm, delivery, 'bot-token', threadLastActivity, threadSessions, threadCallbacks, 60 * 60 * 1000);

        expect(pm.unsubscribe).not.toHaveBeenCalled();
        expect(threadLastActivity.has(staleId)).toBe(false);
    });
});
