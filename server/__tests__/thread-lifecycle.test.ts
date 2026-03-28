/**
 * Tests for thread-lifecycle.ts
 *
 * Covers: archiveThread, createStandaloneThread, archiveStaleThreads
 * All Discord REST calls are mocked via globalThis.fetch.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// Mock embeds module — we only need sendEmbedWithButtons and buildActionRow to not throw.
mock.module('../discord/embeds', () => ({
    sendEmbedWithButtons: mock(async () => {}),
    buildActionRow: mock((..._args: unknown[]) => ({ type: 1, components: [] })),
    assertSnowflake: (value: string, label: string) => {
        if (!/^\d{17,20}$/.test(value)) {
            throw new Error(`Invalid Discord ${label}: expected snowflake ID (17-20 digit numeric string)`);
        }
    },
}));

import {
    archiveThread,
    createStandaloneThread,
    archiveStaleThreads,
} from '../discord/thread-lifecycle';
import type { ThreadSessionInfo, ThreadCallbackInfo } from '../discord/thread-session-map';

const BOT_TOKEN = 'Bot.test.token';
const VALID_THREAD_ID = '123456789012345678';
const VALID_CHANNEL_ID = '987654321098765432';

// ─── fetch helpers ────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function mockFetchOk(body: unknown = {}) {
    globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    ) as unknown as typeof globalThis.fetch;
}

function mockFetchFail(status = 403, body = 'Forbidden') {
    globalThis.fetch = mock(() =>
        Promise.resolve(new Response(body, { status })),
    ) as unknown as typeof globalThis.fetch;
}

// ─── archiveThread ────────────────────────────────────────────────────────────

describe('archiveThread', () => {
    test('sends PATCH to correct Discord endpoint with archived: true', async () => {
        let capturedUrl = '';
        let capturedBody: unknown;
        globalThis.fetch = mock(async (url: string, opts?: RequestInit) => {
            capturedUrl = url;
            capturedBody = JSON.parse(opts?.body as string);
            return new Response('{}', { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        await archiveThread(BOT_TOKEN, VALID_THREAD_ID);

        expect(capturedUrl).toContain(`/channels/${VALID_THREAD_ID}`);
        expect((capturedBody as { archived: boolean }).archived).toBe(true);
    });

    test('includes Authorization header with bot token', async () => {
        let capturedHeaders: HeadersInit | undefined;
        globalThis.fetch = mock(async (_url: string, opts?: RequestInit) => {
            capturedHeaders = opts?.headers;
            return new Response('{}', { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        await archiveThread(BOT_TOKEN, VALID_THREAD_ID);

        const headers = capturedHeaders as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bot ${BOT_TOKEN}`);
    });

    test('logs warning on non-ok response but does not throw', async () => {
        mockFetchFail(403, 'Missing Permissions');
        await expect(archiveThread(BOT_TOKEN, VALID_THREAD_ID)).resolves.toBeUndefined();
    });

    test('throws on invalid thread ID (non-snowflake)', async () => {
        await expect(archiveThread(BOT_TOKEN, 'not-a-snowflake')).rejects.toThrow('snowflake');
    });

    test('throws on empty thread ID', async () => {
        await expect(archiveThread(BOT_TOKEN, '')).rejects.toThrow('snowflake');
    });
});

// ─── createStandaloneThread ───────────────────────────────────────────────────

describe('createStandaloneThread', () => {
    test('returns thread ID on success', async () => {
        mockFetchOk({ id: '111222333444555666' });
        const result = await createStandaloneThread(BOT_TOKEN, VALID_CHANNEL_ID, 'My Topic');
        expect(result).toBe('111222333444555666');
    });

    test('sends POST to /channels/{id}/threads', async () => {
        let capturedUrl = '';
        globalThis.fetch = mock(async (url: string) => {
            capturedUrl = url;
            return new Response(JSON.stringify({ id: '111222333444555666' }), { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        await createStandaloneThread(BOT_TOKEN, VALID_CHANNEL_ID, 'Topic');
        expect(capturedUrl).toContain(`/channels/${VALID_CHANNEL_ID}/threads`);
    });

    test('truncates thread name to 100 characters', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock(async (_url: string, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return new Response(JSON.stringify({ id: '111222333444555666' }), { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        const longName = 'x'.repeat(150);
        await createStandaloneThread(BOT_TOKEN, VALID_CHANNEL_ID, longName);
        expect((capturedBody.name as string).length).toBe(100);
    });

    test('returns null on API failure', async () => {
        mockFetchFail(500, 'Internal Server Error');
        const result = await createStandaloneThread(BOT_TOKEN, VALID_CHANNEL_ID, 'Topic');
        expect(result).toBeNull();
    });

    test('throws on invalid channel ID', async () => {
        await expect(createStandaloneThread(BOT_TOKEN, 'bad-id', 'Topic')).rejects.toThrow('snowflake');
    });

    test('sets type to GUILD_PUBLIC_THREAD (11) and auto_archive_duration to 1440', async () => {
        let capturedBody: Record<string, unknown> = {};
        globalThis.fetch = mock(async (_url: string, opts?: RequestInit) => {
            capturedBody = JSON.parse(opts?.body as string);
            return new Response(JSON.stringify({ id: '111222333444555666' }), { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        await createStandaloneThread(BOT_TOKEN, VALID_CHANNEL_ID, 'Topic');
        expect(capturedBody.type).toBe(11);
        expect(capturedBody.auto_archive_duration).toBe(1440);
    });
});

// ─── archiveStaleThreads ──────────────────────────────────────────────────────

describe('archiveStaleThreads', () => {
    function makeProcessManager(unsubscribeMock = mock(() => {})) {
        return {
            unsubscribe: unsubscribeMock,
        } as unknown as import('../process/manager').ProcessManager;
    }

    function makeDelivery() {
        return {} as unknown as import('../lib/delivery-tracker').DeliveryTracker;
    }

    const SESSION_INFO: ThreadSessionInfo = {
        sessionId: 'sess-1',
        agentName: 'Bot',
        agentModel: 'claude-sonnet-4-6',
        ownerUserId: 'user-1',
    };

    beforeEach(() => {
        // Default: fetch succeeds for archive PATCH
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response('{}', { status: 200 })),
        ) as unknown as typeof globalThis.fetch;
    });

    test('archives thread that exceeded stale threshold', async () => {
        const pm = makeProcessManager();
        const delivery = makeDelivery();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 10_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        await archiveStaleThreads(pm, delivery, BOT_TOKEN, threadLastActivity, threadSessions, threadCallbacks, 5_000);

        // Maps cleaned up after archival
        expect(threadLastActivity.has(VALID_THREAD_ID)).toBe(false);
        expect(threadSessions.has(VALID_THREAD_ID)).toBe(false);
    });

    test('does not archive thread within stale threshold', async () => {
        const pm = makeProcessManager();
        const delivery = makeDelivery();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 1_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        await archiveStaleThreads(pm, delivery, BOT_TOKEN, threadLastActivity, threadSessions, threadCallbacks, 5_000);

        // Thread should remain
        expect(threadLastActivity.has(VALID_THREAD_ID)).toBe(true);
        expect(threadSessions.has(VALID_THREAD_ID)).toBe(true);
    });

    test('unsubscribes callback when callback exists for stale thread', async () => {
        const unsubscribeMock = mock(() => {});
        const pm = makeProcessManager(unsubscribeMock);
        const delivery = makeDelivery();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 10_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const cb: ThreadCallbackInfo = { sessionId: 'sess-1', callback: () => {} };
        const threadCallbacks = new Map([[VALID_THREAD_ID, cb]]);

        await archiveStaleThreads(pm, delivery, BOT_TOKEN, threadLastActivity, threadSessions, threadCallbacks, 5_000);

        expect(unsubscribeMock).toHaveBeenCalledWith('sess-1', cb.callback);
        expect(threadCallbacks.has(VALID_THREAD_ID)).toBe(false);
    });

    test('does not throw when archival fails for a stale thread', async () => {
        globalThis.fetch = mock(() =>
            Promise.reject(new Error('Network error')),
        ) as unknown as typeof globalThis.fetch;

        const pm = makeProcessManager();
        const delivery = makeDelivery();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 10_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        await expect(
            archiveStaleThreads(pm, delivery, BOT_TOKEN, threadLastActivity, threadSessions, threadCallbacks, 5_000),
        ).resolves.toBeUndefined();
    });

    test('handles empty maps without error', async () => {
        const pm = makeProcessManager();
        const delivery = makeDelivery();
        await expect(
            archiveStaleThreads(
                pm, delivery, BOT_TOKEN,
                new Map(), new Map(), new Map(),
                5_000,
            ),
        ).resolves.toBeUndefined();
    });
});
