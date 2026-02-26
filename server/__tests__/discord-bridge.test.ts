import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import { GatewayOp } from '../discord/types';
import type { DiscordBridgeConfig, DiscordMessageData } from '../discord/types';
import type { ProcessManager } from '../process/manager';

/**
 * Exposes DiscordBridge private members used by tests.
 * TypeScript `private` is compile-time-only, so the cast is safe at runtime.
 */
interface DiscordBridgeInternals {
    running: boolean;
    connect(): void;
    handleMessage(data: DiscordMessageData): Promise<void>;
    routeToAgent(channelId: string, userId: string, text: string): Promise<void>;
}

/** Cast a DiscordBridge to its test-visible internals. */
function internals(bridge: DiscordBridge): DiscordBridgeInternals {
    return bridge as unknown as DiscordBridgeInternals;
}

/** Minimal ProcessManager stub for DiscordBridge constructor. */
function createMockProcessManager(): ProcessManager {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
    } as unknown as ProcessManager;
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

describe('DiscordBridge', () => {
    test('constructor creates bridge', () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        expect(bridge).toBeDefined();
    });

    test('gateway opcodes are correct', () => {
        expect(GatewayOp.DISPATCH).toBe(0);
        expect(GatewayOp.HEARTBEAT).toBe(1);
        expect(GatewayOp.IDENTIFY).toBe(2);
        expect(GatewayOp.HELLO).toBe(10);
        expect(GatewayOp.HEARTBEAT_ACK).toBe(11);
    });

    test('ignores bot messages', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Simulate bot message — should not call routeToAgent
        const bridge_ = internals(bridge);
        const routeSpy = mock(() => Promise.resolve());
        bridge_.routeToAgent = routeSpy;

        await bridge_.handleMessage({
            id: '1',
            channel_id: 'test-channel',
            author: { id: 'bot-1', username: 'TestBot', bot: true },
            content: 'hello from bot',
            timestamp: new Date().toISOString(),
        });

        expect(routeSpy).not.toHaveBeenCalled();
    });

    test('ignores messages from other channels', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'my-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const bridge_ = internals(bridge);
        const routeSpy = mock(() => Promise.resolve());
        bridge_.routeToAgent = routeSpy;

        await bridge_.handleMessage({
            id: '1',
            channel_id: 'other-channel',
            author: { id: 'user-1', username: 'TestUser' },
            content: 'hello',
            timestamp: new Date().toISOString(),
        });

        expect(routeSpy).not.toHaveBeenCalled();
    });

    test('sendMessage splits long messages', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        const fetchCalls: number[] = [];
        const originalFetch = globalThis.fetch;
        // Bun's `typeof fetch` includes a `preconnect` static method that mocks don't provide.
        globalThis.fetch = mock(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
            fetchCalls.push(1);
            return new Response(JSON.stringify({}), { status: 200 });
        }) as unknown as typeof fetch;

        try {
            // Short message — single API call
            await bridge.sendMessage('test-channel', 'Hello');
            expect(fetchCalls.length).toBe(1);

            // Long message (>2000 chars) — split into multiple calls
            fetchCalls.length = 0;
            const longText = 'x'.repeat(3000);
            await bridge.sendMessage('test-channel', longText);
            expect(fetchCalls.length).toBe(2);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('stop clears running state', () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: 'test-channel',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);

        // Mock connect to prevent actual WebSocket
        const bridge_ = internals(bridge);
        bridge_.connect = mock(() => {});

        bridge.start();
        expect(bridge_.running).toBe(true);

        bridge.stop();
        expect(bridge_.running).toBe(false);
    });
});
