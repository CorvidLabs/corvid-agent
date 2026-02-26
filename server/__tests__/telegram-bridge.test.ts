import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { TelegramBridge } from '../telegram/bridge';
import type { TelegramBridgeConfig } from '../telegram/types';

// Mock process manager
function createMockProcessManager() {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
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

describe('TelegramBridge', () => {
    test('constructor creates bridge', () => {
        const pm = createMockProcessManager();
        const config: TelegramBridgeConfig = {
            botToken: 'test-token',
            chatId: '12345',
            allowedUserIds: ['111'],
        };
        const bridge = new TelegramBridge(db, pm, config);
        expect(bridge).toBeDefined();
    });

    test('start and stop', () => {
        const pm = createMockProcessManager();
        const config: TelegramBridgeConfig = {
            botToken: 'test-token',
            chatId: '12345',
            allowedUserIds: [],
        };
        const bridge = new TelegramBridge(db, pm, config);

        // Mock the poll method to prevent actual API calls
        (bridge as unknown as { poll: () => void }).poll = mock(() => {});

        bridge.start();
        expect((bridge as unknown as { running: boolean }).running).toBe(true);

        bridge.stop();
        expect((bridge as unknown as { running: boolean }).running).toBe(false);
    });

    test('sendText splits long messages', async () => {
        const pm = createMockProcessManager();
        const config: TelegramBridgeConfig = {
            botToken: 'test-token',
            chatId: '12345',
            allowedUserIds: [],
        };
        const bridge = new TelegramBridge(db, pm, config);

        const calls: unknown[] = [];
        (bridge as unknown as { callTelegramApi: (...args: unknown[]) => Promise<unknown> }).callTelegramApi = mock(async (method: string, body: unknown) => {
            calls.push({ method, body });
            return { result: {} };
        });

        // Short message
        await bridge.sendText(12345, 'Hello');
        expect(calls).toHaveLength(1);

        // Long message (>4096 chars)
        calls.length = 0;
        const longText = 'x'.repeat(5000);
        await bridge.sendText(12345, longText);
        expect(calls.length).toBe(2);
    });

    test('authorization rejects unknown users', async () => {
        const pm = createMockProcessManager();
        const config: TelegramBridgeConfig = {
            botToken: 'test-token',
            chatId: '12345',
            allowedUserIds: ['111'], // Only user 111 is allowed
        };
        const bridge = new TelegramBridge(db, pm, config);

        const sentMessages: string[] = [];
        (bridge as unknown as { callTelegramApi: (...args: unknown[]) => Promise<unknown> }).callTelegramApi = mock(async (_method: string, body: { text?: string }) => {
            if (body.text) sentMessages.push(body.text);
            return { result: {} };
        });

        // Simulate message from unauthorized user (ID 999)
        await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
            message_id: 1,
            from: { id: 999, is_bot: false, first_name: 'Hacker' },
            chat: { id: 12345, type: 'private' },
            text: 'hello',
            date: Date.now(),
        });

        expect(sentMessages.some(m => m.includes('Unauthorized'))).toBe(true);
    });
});
