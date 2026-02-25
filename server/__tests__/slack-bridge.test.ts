import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { SlackBridge } from '../slack/bridge';
import type { SlackBridgeConfig } from '../slack/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';

// ─── Mock ProcessManager ────────────────────────────────────────────────────

function createMockProcessManager() {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        isRunning: mock(() => false),
    } as unknown as import('../process/manager').ProcessManager;
}

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── Helper: build a signed Slack request ───────────────────────────────────

async function buildSignedRequest(
    signingSecret: string,
    body: unknown,
    timestampOverride?: number,
): Promise<Request> {
    const rawBody = JSON.stringify(body);
    const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000);
    const sigBasestring = `v0:${timestamp}:${rawBody}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(signingSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
    const hexSig = 'v0=' + Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return new Request('http://localhost/api/slack/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-slack-request-timestamp': String(timestamp),
            'x-slack-signature': hexSig,
        },
        body: rawBody,
    });
}

// ─── Constructor / Config ───────────────────────────────────────────────────

describe('SlackBridge', () => {
    test('constructor creates bridge', () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test-token',
            signingSecret: 'test-secret',
            channelId: 'C12345',
            allowedUserIds: ['U111'],
        };
        const bridge = new SlackBridge(db, pm, config);
        expect(bridge).toBeDefined();
    });

    test('start and stop', () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test-token',
            signingSecret: 'test-secret',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        bridge.start();
        expect((bridge as any).running).toBe(true);

        bridge.stop();
        expect((bridge as any).running).toBe(false);
    });

    test('start is idempotent', () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test-token',
            signingSecret: 'test-secret',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        bridge.start();
        bridge.start(); // second call is no-op
        expect((bridge as any).running).toBe(true);

        bridge.stop();
        expect((bridge as any).running).toBe(false);
    });

    test('stop sets running to false', () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test-token',
            signingSecret: 'test-secret',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        bridge.start();
        expect((bridge as any).running).toBe(true);

        bridge.stop();
        expect((bridge as any).running).toBe(false);
    });
});

// ─── Signature Verification ─────────────────────────────────────────────────

describe('Slack signature verification', () => {
    const signingSecret = 'my-signing-secret';
    const config: SlackBridgeConfig = {
        botToken: 'xoxb-test',
        signingSecret,
        channelId: 'C12345',
        allowedUserIds: [],
    };

    test('accepts valid signature', async () => {
        const pm = createMockProcessManager();
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const body = { type: 'url_verification', challenge: 'test-challenge' };
        const req = await buildSignedRequest(signingSecret, body);

        const response = await bridge.handleEventRequest(req);
        expect(response.status).toBe(200);

        const json = await response.json() as { challenge: string };
        expect(json.challenge).toBe('test-challenge');

        bridge.stop();
    });

    test('rejects missing signature headers', async () => {
        const pm = createMockProcessManager();
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const req = new Request('http://localhost/api/slack/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
        });

        const response = await bridge.handleEventRequest(req);
        expect(response.status).toBe(401);

        bridge.stop();
    });

    test('rejects invalid signature', async () => {
        const pm = createMockProcessManager();
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const timestamp = Math.floor(Date.now() / 1000);
        const req = new Request('http://localhost/api/slack/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-slack-request-timestamp': String(timestamp),
                'x-slack-signature': 'v0=invalid_signature_here_00000000000000000000000000000000',
            },
            body: JSON.stringify({ type: 'url_verification', challenge: 'test' }),
        });

        const response = await bridge.handleEventRequest(req);
        expect(response.status).toBe(401);

        bridge.stop();
    });

    test('rejects replay attacks (timestamp > 5 minutes old)', async () => {
        const pm = createMockProcessManager();
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
        const body = { type: 'url_verification', challenge: 'replay' };
        const req = await buildSignedRequest(signingSecret, body, oldTimestamp);

        const response = await bridge.handleEventRequest(req);
        expect(response.status).toBe(401);

        bridge.stop();
    });
});

// ─── URL Verification Challenge ─────────────────────────────────────────────

describe('Slack URL verification', () => {
    test('responds to url_verification with challenge', async () => {
        const signingSecret = 'challenge-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const body = {
            type: 'url_verification',
            challenge: 'my-challenge-token-xyz',
        };
        const req = await buildSignedRequest(signingSecret, body);
        const response = await bridge.handleEventRequest(req);

        expect(response.status).toBe(200);
        const json = await response.json() as { challenge: string };
        expect(json.challenge).toBe('my-challenge-token-xyz');

        bridge.stop();
    });
});

// ─── Event Deduplication ────────────────────────────────────────────────────

describe('Slack event deduplication', () => {
    test('deduplicates events with same channel:ts', async () => {
        const signingSecret = 'dedup-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        // Seed an agent and project so routeToAgent doesn't fail
        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        const event = {
            type: 'message',
            user: 'U123',
            text: 'hello',
            channel: 'C12345',
            ts: '1234567890.000100',
        };

        // First event
        const body1 = { type: 'event_callback', event };
        const req1 = await buildSignedRequest(signingSecret, body1);
        await bridge.handleEventRequest(req1);

        // Small delay to let async handleEvent run
        await new Promise(r => setTimeout(r, 50));

        // Retry — same event should be deduplicated
        const req2 = await buildSignedRequest(signingSecret, body1);
        await bridge.handleEventRequest(req2);

        await new Promise(r => setTimeout(r, 50));

        // Should only have started one process
        expect(pm.startProcess).toHaveBeenCalledTimes(1);

        bridge.stop();
    });
});

// ─── Bot Message Filtering ──────────────────────────────────────────────────

describe('Slack bot message filtering', () => {
    test('ignores messages with bot_id', async () => {
        const signingSecret = 'bot-filter-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U123',
                text: 'bot message',
                channel: 'C12345',
                ts: '1234567890.000200',
                bot_id: 'B_BOT_123',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).not.toHaveBeenCalled();

        bridge.stop();
    });

    test('ignores messages with subtype', async () => {
        const signingSecret = 'subtype-filter-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U123',
                text: 'channel join',
                channel: 'C12345',
                ts: '1234567890.000300',
                subtype: 'channel_join',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).not.toHaveBeenCalled();

        bridge.stop();
    });
});

// ─── Channel Filtering ──────────────────────────────────────────────────────

describe('Slack channel filtering', () => {
    test('ignores messages from other channels', async () => {
        const signingSecret = 'channel-filter-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C_MY_CHANNEL',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U123',
                text: 'wrong channel',
                channel: 'C_OTHER_CHANNEL',
                ts: '1234567890.000400',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).not.toHaveBeenCalled();

        bridge.stop();
    });
});

// ─── User Authorization ─────────────────────────────────────────────────────

describe('Slack user authorization', () => {
    test('rejects unauthorized users', async () => {
        const signingSecret = 'auth-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: ['U_ALLOWED_1'],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        // Mock sendMessage to capture what was sent
        const sentMessages: string[] = [];
        (bridge as any).sendMessage = mock(async (_ch: string, text: string) => {
            sentMessages.push(text);
        });

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_UNAUTHORIZED',
                text: 'hello',
                channel: 'C12345',
                ts: '1234567890.000500',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(sentMessages).toContain('Unauthorized.');
        expect(pm.startProcess).not.toHaveBeenCalled();

        bridge.stop();
    });

    test('allows authorized users', async () => {
        const signingSecret = 'auth-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: ['U_ALLOWED_1'],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_ALLOWED_1',
                text: 'hello from allowed user',
                channel: 'C12345',
                ts: '1234567890.000600',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).toHaveBeenCalledTimes(1);

        bridge.stop();
    });

    test('allows all users when allowedUserIds is empty', async () => {
        const signingSecret = 'auth-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [], // empty = allow all
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_ANY_USER',
                text: 'hello',
                channel: 'C12345',
                ts: '1234567890.000700',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).toHaveBeenCalledTimes(1);

        bridge.stop();
    });
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

describe('Slack rate limiting', () => {
    test('rate limits after 10 messages per 60s', async () => {
        const signingSecret = 'rate-limit-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        const sentMessages: string[] = [];
        (bridge as any).sendMessage = mock(async (_ch: string, text: string) => {
            sentMessages.push(text);
        });

        // Send 10 messages (should all be allowed)
        for (let i = 0; i < 10; i++) {
            const body = {
                type: 'event_callback',
                event: {
                    type: 'message',
                    user: 'U_RATE_TEST',
                    text: `message ${i}`,
                    channel: 'C12345',
                    ts: `1234567890.${String(800 + i).padStart(6, '0')}`,
                },
            };
            const req = await buildSignedRequest(signingSecret, body);
            await bridge.handleEventRequest(req);
            await new Promise(r => setTimeout(r, 10));
        }

        // 11th message should be rate limited
        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_RATE_TEST',
                text: 'message 10',
                channel: 'C12345',
                ts: '1234567890.000810',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(sentMessages.some(m => m.includes('Rate limit'))).toBe(true);

        bridge.stop();
    });

    test('rate limit is per-user', () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret: 'test',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        // Fill user1's rate limit
        for (let i = 0; i < 10; i++) {
            expect((bridge as any).checkRateLimit('user1')).toBe(true);
        }
        expect((bridge as any).checkRateLimit('user1')).toBe(false);

        // user2 should still have capacity
        expect((bridge as any).checkRateLimit('user2')).toBe(true);
    });
});

// ─── Message Chunking ───────────────────────────────────────────────────────

describe('Slack message chunking', () => {
    test('sends short messages as single chunk', async () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret: 'test',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        const fetchCalls: { body: string }[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
            fetchCalls.push({ body: opts.body as string });
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await bridge.sendMessage('C12345', 'Hello');
            expect(fetchCalls).toHaveLength(1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('splits messages longer than 4000 chars', async () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret: 'test',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        const fetchCalls: { body: string }[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
            fetchCalls.push({ body: opts.body as string });
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            const longText = 'x'.repeat(5000);
            await bridge.sendMessage('C12345', longText);
            expect(fetchCalls).toHaveLength(2);

            // First chunk should be 4000 chars
            const firstBody = JSON.parse(fetchCalls[0].body);
            expect(firstBody.text).toHaveLength(4000);

            // Second chunk should be the remainder
            const secondBody = JSON.parse(fetchCalls[1].body);
            expect(secondBody.text).toHaveLength(1000);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('sendMessage at exactly 4000 chars sends single chunk', async () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret: 'test',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        const fetchCalls: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async () => {
            fetchCalls.push(1);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await bridge.sendMessage('C12345', 'x'.repeat(4000));
            expect(fetchCalls).toHaveLength(1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// ─── Thread Support ─────────────────────────────────────────────────────────

describe('Slack thread support', () => {
    test('sendMessage includes thread_ts when provided', async () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret: 'test',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        const fetchBodies: Record<string, unknown>[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
            fetchBodies.push(JSON.parse(opts.body as string));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await bridge.sendMessage('C12345', 'threaded reply', '1234567890.000100');
            expect(fetchBodies).toHaveLength(1);
            expect(fetchBodies[0].thread_ts).toBe('1234567890.000100');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('sendMessage omits thread_ts when not provided', async () => {
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret: 'test',
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);

        const fetchBodies: Record<string, unknown>[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (_url: string, opts: RequestInit) => {
            fetchBodies.push(JSON.parse(opts.body as string));
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            await bridge.sendMessage('C12345', 'no thread');
            expect(fetchBodies).toHaveLength(1);
            expect(fetchBodies[0].thread_ts).toBeUndefined();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// ─── app_mention Event ──────────────────────────────────────────────────────

describe('Slack app_mention events', () => {
    test('handles app_mention events', async () => {
        const signingSecret = 'mention-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        const body = {
            type: 'event_callback',
            event: {
                type: 'app_mention',
                user: 'U123',
                text: '<@BBOT> what is the weather?',
                channel: 'C12345',
                ts: '1234567890.000900',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).toHaveBeenCalledTimes(1);

        bridge.stop();
    });
});

// ─── Slash Commands ─────────────────────────────────────────────────────────

describe('Slack slash commands', () => {
    test('/status reports current session', async () => {
        const signingSecret = 'cmd-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const sentMessages: string[] = [];
        (bridge as any).sendMessage = mock(async (_ch: string, text: string) => {
            sentMessages.push(text);
        });

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_CMD',
                text: '/status',
                channel: 'C12345',
                ts: '1234567890.001000',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(sentMessages.some(m => m.includes('session'))).toBe(true);
        expect(pm.startProcess).not.toHaveBeenCalled();

        bridge.stop();
    });

    test('/new clears session mapping', async () => {
        const signingSecret = 'cmd-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        // Set a session for the user
        (bridge as any).userSessions.set('U_CMD', 'old-session-id');

        const sentMessages: string[] = [];
        (bridge as any).sendMessage = mock(async (_ch: string, text: string) => {
            sentMessages.push(text);
        });

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_CMD',
                text: '/new',
                channel: 'C12345',
                ts: '1234567890.001100',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect((bridge as any).userSessions.has('U_CMD')).toBe(false);
        expect(sentMessages.some(m => m.includes('cleared'))).toBe(true);

        bridge.stop();
    });
});

// ─── Session Routing ────────────────────────────────────────────────────────

describe('Slack session routing', () => {
    test('creates session with source slack', async () => {
        const signingSecret = 'routing-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        // Mock sendMessage to avoid actual API calls
        (bridge as any).sendMessage = mock(async () => {});

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_ROUTE',
                text: 'hello there',
                channel: 'C12345',
                ts: '1234567890.001200',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).toHaveBeenCalledTimes(1);
        // Verify user session was created
        expect((bridge as any).userSessions.has('U_ROUTE')).toBe(true);

        bridge.stop();
    });

    test('reuses existing session for same user', async () => {
        const signingSecret = 'routing-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        createAgent(db, { name: 'Test Agent', model: 'sonnet' });
        createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        (bridge as any).sendMessage = mock(async () => {});

        // First message — creates session
        const body1 = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_REUSE',
                text: 'first message',
                channel: 'C12345',
                ts: '1234567890.001300',
            },
        };
        const req1 = await buildSignedRequest(signingSecret, body1);
        await bridge.handleEventRequest(req1);
        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).toHaveBeenCalledTimes(1);

        // Second message — should reuse session via sendMessage
        const body2 = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_REUSE',
                text: 'second message',
                channel: 'C12345',
                ts: '1234567890.001400',
            },
        };
        const req2 = await buildSignedRequest(signingSecret, body2);
        await bridge.handleEventRequest(req2);
        await new Promise(r => setTimeout(r, 50));

        // sendMessage on processManager should have been called for the reuse path
        expect(pm.sendMessage).toHaveBeenCalled();

        bridge.stop();
    });

    test('sends error when no agents configured', async () => {
        const signingSecret = 'noagent-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        const sentMessages: string[] = [];
        (bridge as any).sendMessage = mock(async (_ch: string, text: string) => {
            sentMessages.push(text);
        });

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U_NOAGENT',
                text: 'hello',
                channel: 'C12345',
                ts: '1234567890.001500',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        await bridge.handleEventRequest(req);

        await new Promise(r => setTimeout(r, 50));

        expect(sentMessages.some(m => m.includes('No agents configured'))).toBe(true);

        bridge.stop();
    });
});

// ─── Not Running ────────────────────────────────────────────────────────────

describe('Slack bridge not running', () => {
    test('ignores events when not started', async () => {
        const signingSecret = 'stopped-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        // Note: NOT started

        const body = {
            type: 'event_callback',
            event: {
                type: 'message',
                user: 'U123',
                text: 'hello',
                channel: 'C12345',
                ts: '1234567890.001600',
            },
        };
        const req = await buildSignedRequest(signingSecret, body);
        // handleEventRequest still processes the HTTP request (returns 200)
        // but handleEvent silently returns early because running=false
        const response = await bridge.handleEventRequest(req);
        expect(response.status).toBe(200);

        await new Promise(r => setTimeout(r, 50));

        expect(pm.startProcess).not.toHaveBeenCalled();
    });
});

// ─── Invalid JSON ───────────────────────────────────────────────────────────

describe('Slack invalid request body', () => {
    test('returns 400 for invalid JSON', async () => {
        const signingSecret = 'json-secret';
        const pm = createMockProcessManager();
        const config: SlackBridgeConfig = {
            botToken: 'xoxb-test',
            signingSecret,
            channelId: 'C12345',
            allowedUserIds: [],
        };
        const bridge = new SlackBridge(db, pm, config);
        bridge.start();

        // Build a signed request with the raw invalid body
        const rawBody = 'not-json';
        const timestamp = Math.floor(Date.now() / 1000);
        const sigBasestring = `v0:${timestamp}:${rawBody}`;

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(signingSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
        const hexSig = 'v0=' + Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const req = new Request('http://localhost/api/slack/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-slack-request-timestamp': String(timestamp),
                'x-slack-signature': hexSig,
            },
            body: rawBody,
        });

        // Note: the verifySignature reads the body via req.clone(), then handleEventRequest
        // reads it again via req.json(). Since we pass valid signature but invalid JSON,
        // the signature check passes but JSON parse fails.
        // However, verifySignature uses req.clone() and then req.json() reads the original.
        // The signature verification will consume the clone. Let me trace through:
        // 1. verifySignature(req.clone()) — reads clone's body as text → valid sig → true
        // 2. body = await req.json() — tries to parse "not-json" → throws → 400
        const response = await bridge.handleEventRequest(req);
        expect(response.status).toBe(400);

        bridge.stop();
    });
});
