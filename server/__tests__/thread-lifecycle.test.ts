/**
 * Tests for thread-lifecycle.ts
 *
 * Covers: archiveThread, createStandaloneThread, archiveStaleThreads
 * All Discord REST calls are mocked via _setRestClientForTesting.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// Mock embeds module — we only need buildActionRow and assertSnowflake.
mock.module('../discord/embeds', () => ({
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
import { _setRestClientForTesting, type DiscordRestClient } from '../discord/rest-client';
import type { ThreadSessionInfo, ThreadCallbackInfo } from '../discord/thread-session-map';

const VALID_THREAD_ID = '123456789012345678';
const VALID_CHANNEL_ID = '987654321098765432';

// ─── REST client mock helpers ─────────────────────────────────────────────────

function makeRestClient(overrides: Partial<Record<string, ReturnType<typeof mock>>> = {}): DiscordRestClient {
    return {
        modifyChannel: overrides.modifyChannel ?? mock(async () => ({})),
        createThread: overrides.createThread ?? mock(async () => ({ id: '111222333444555666' })),
        sendMessage: overrides.sendMessage ?? mock(async () => ({})),
    } as unknown as DiscordRestClient;
}

afterEach(() => {
    _setRestClientForTesting(null);
});

// ─── archiveThread ────────────────────────────────────────────────────────────

describe('archiveThread', () => {
    test('calls modifyChannel with archived: true', async () => {
        const modifyChannel = mock(async () => ({}));
        _setRestClientForTesting(makeRestClient({ modifyChannel }));

        await archiveThread(VALID_THREAD_ID);

        expect(modifyChannel).toHaveBeenCalledWith(VALID_THREAD_ID, { archived: true });
    });

    test('does not throw on REST error', async () => {
        const modifyChannel = mock(async () => { throw new Error('Forbidden'); });
        _setRestClientForTesting(makeRestClient({ modifyChannel }));

        await expect(archiveThread(VALID_THREAD_ID)).resolves.toBeUndefined();
    });

    test('throws on invalid thread ID (non-snowflake)', async () => {
        _setRestClientForTesting(makeRestClient());
        await expect(archiveThread('not-a-snowflake')).rejects.toThrow('snowflake');
    });

    test('throws on empty thread ID', async () => {
        _setRestClientForTesting(makeRestClient());
        await expect(archiveThread('')).rejects.toThrow('snowflake');
    });
});

// ─── createStandaloneThread ───────────────────────────────────────────────────

describe('createStandaloneThread', () => {
    test('returns thread ID on success', async () => {
        _setRestClientForTesting(makeRestClient());

        const result = await createStandaloneThread(VALID_CHANNEL_ID, 'My Topic');
        expect(result).toBe('111222333444555666');
    });

    test('calls createThread with correct params', async () => {
        const createThread = mock(async () => ({ id: '111222333444555666' }));
        _setRestClientForTesting(makeRestClient({ createThread }));

        await createStandaloneThread(VALID_CHANNEL_ID, 'Topic');

        expect(createThread).toHaveBeenCalledWith(VALID_CHANNEL_ID, {
            name: 'Topic',
            type: 11,
            auto_archive_duration: 1440,
        });
    });

    test('truncates thread name to 100 characters', async () => {
        const createThread = mock(async (_channelId: string, _data: { name: string }) => ({ id: 'x'.repeat(18) }));
        _setRestClientForTesting(makeRestClient({ createThread }));

        const longName = 'x'.repeat(150);
        await createStandaloneThread(VALID_CHANNEL_ID, longName);

        const callArgs = (createThread as ReturnType<typeof mock>).mock.calls[0] as [string, { name: string }];
        expect(callArgs[1].name.length).toBe(100);
    });

    test('returns null on REST failure', async () => {
        const createThread = mock(async () => { throw new Error('Internal Server Error'); });
        _setRestClientForTesting(makeRestClient({ createThread }));

        const result = await createStandaloneThread(VALID_CHANNEL_ID, 'Topic');
        expect(result).toBeNull();
    });

    test('throws on invalid channel ID', async () => {
        _setRestClientForTesting(makeRestClient());
        await expect(createStandaloneThread('bad-id', 'Topic')).rejects.toThrow('snowflake');
    });

    test('sets type to GUILD_PUBLIC_THREAD (11) and auto_archive_duration to 1440', async () => {
        const createThread = mock(async (_channelId: string, _data: { type: number; auto_archive_duration: number }) => ({ id: '111222333444555666' }));
        _setRestClientForTesting(makeRestClient({ createThread }));

        await createStandaloneThread(VALID_CHANNEL_ID, 'Topic');

        const callArgs = (createThread as ReturnType<typeof mock>).mock.calls[0] as [string, { type: number; auto_archive_duration: number }];
        expect(callArgs[1].type).toBe(11);
        expect(callArgs[1].auto_archive_duration).toBe(1440);
    });
});

// ─── archiveStaleThreads ──────────────────────────────────────────────────────

describe('archiveStaleThreads', () => {
    function makeProcessManager(unsubscribeMock = mock(() => {})) {
        return {
            unsubscribe: unsubscribeMock,
        } as unknown as import('../process/manager').ProcessManager;
    }

    const SESSION_INFO: ThreadSessionInfo = {
        sessionId: 'sess-1',
        agentName: 'Bot',
        agentModel: 'claude-sonnet-4-6',
        ownerUserId: 'user-1',
    };

    beforeEach(() => {
        _setRestClientForTesting(makeRestClient());
    });

    test('archives thread that exceeded stale threshold', async () => {
        const pm = makeProcessManager();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 10_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        await archiveStaleThreads(pm, threadLastActivity, threadSessions, threadCallbacks, 5_000);

        // Maps cleaned up after archival
        expect(threadLastActivity.has(VALID_THREAD_ID)).toBe(false);
        expect(threadSessions.has(VALID_THREAD_ID)).toBe(false);
    });

    test('does not archive thread within stale threshold', async () => {
        const pm = makeProcessManager();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 1_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        await archiveStaleThreads(pm, threadLastActivity, threadSessions, threadCallbacks, 5_000);

        // Thread should remain
        expect(threadLastActivity.has(VALID_THREAD_ID)).toBe(true);
        expect(threadSessions.has(VALID_THREAD_ID)).toBe(true);
    });

    test('unsubscribes callback when callback exists for stale thread', async () => {
        const unsubscribeMock = mock(() => {});
        const pm = makeProcessManager(unsubscribeMock);
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 10_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const cb: ThreadCallbackInfo = { sessionId: 'sess-1', callback: () => {} };
        const threadCallbacks = new Map([[VALID_THREAD_ID, cb]]);

        await archiveStaleThreads(pm, threadLastActivity, threadSessions, threadCallbacks, 5_000);

        expect(unsubscribeMock).toHaveBeenCalledWith('sess-1', cb.callback);
        expect(threadCallbacks.has(VALID_THREAD_ID)).toBe(false);
    });

    test('does not throw when archival fails for a stale thread', async () => {
        const modifyChannel = mock(async () => { throw new Error('Network error'); });
        const sendMessage = mock(async () => { throw new Error('Network error'); });
        _setRestClientForTesting(makeRestClient({ modifyChannel, sendMessage }));

        const pm = makeProcessManager();
        const now = Date.now();
        const threadLastActivity = new Map([[VALID_THREAD_ID, now - 10_000]]);
        const threadSessions = new Map([[VALID_THREAD_ID, SESSION_INFO]]);
        const threadCallbacks = new Map<string, ThreadCallbackInfo>();

        await expect(
            archiveStaleThreads(pm, threadLastActivity, threadSessions, threadCallbacks, 5_000),
        ).resolves.toBeUndefined();
    });

    test('handles empty maps without error', async () => {
        const pm = makeProcessManager();
        await expect(
            archiveStaleThreads(
                pm,
                new Map(), new Map(), new Map(),
                5_000,
            ),
        ).resolves.toBeUndefined();
    });
});
