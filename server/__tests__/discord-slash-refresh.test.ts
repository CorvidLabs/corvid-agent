import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';

/**
 * Tests for the DiscordBridge.updateSlashCommands() debounce behaviour.
 *
 * Uses a real in-memory database with agents inserted, and intercepts
 * fetch to track Discord API calls without hitting the real API.
 */

// Track fetch calls to the Discord slash-command registration endpoint
const fetchCalls: Array<{ url: string; method: string }> = [];
const originalFetch = globalThis.fetch;

/** Return only fetch calls to the slash-command registration endpoint. */
function slashCommandCalls() {
    return fetchCalls.filter(c => c.url.includes('/applications/') && c.method === 'PUT');
}

function createMockProcessManager() {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        resumeProcess: mock(() => {}),
    } as unknown as import('../process/manager').ProcessManager;
}

const defaultConfig: DiscordBridgeConfig = {
    botToken: 'fake-token',
    channelId: '1234567890123456789',
    appId: '9876543210987654321',
    guildId: '',
    allowedUserIds: [],
};

function makeBridge(db: Database, config?: Partial<DiscordBridgeConfig>): DiscordBridge {
    return new DiscordBridge(db, createMockProcessManager(), { ...defaultConfig, ...config });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('DiscordBridge.updateSlashCommands', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        runMigrations(db);
        // Seed two agents so registerSlashCommands has data to work with
        createAgent(db, { name: 'Agent1', model: 'claude-3', systemPrompt: 'You are agent 1' });
        createAgent(db, { name: 'Agent2', model: 'gpt-4', systemPrompt: 'You are agent 2' });

        fetchCalls.length = 0;
        // Intercept fetch calls to Discord API
        globalThis.fetch = mock(async (input: any, init?: any) => {
            const url = typeof input === 'string' ? input : input.url;
            if (typeof url === 'string' && new URL(url).hostname === 'discord.com') {
                fetchCalls.push({ url, method: init?.method ?? 'GET' });
                return new Response(JSON.stringify([{ name: 'session' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return originalFetch(input, init);
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        db.close();
    });

    test('is callable as a public method', () => {
        const bridge = makeBridge(db);
        expect(typeof bridge.updateSlashCommands).toBe('function');
        bridge.updateSlashCommands();
        bridge.stop();
    });

    test('debounces rapid calls into a single API request', async () => {
        const bridge = makeBridge(db);
        (bridge as any).running = true;

        // Fire three rapid calls
        bridge.updateSlashCommands();
        bridge.updateSlashCommands();
        bridge.updateSlashCommands();

        // No slash-command fetch should have happened yet (still within debounce window)
        expect(slashCommandCalls().length).toBe(0);

        // Wait for the debounce timer (2 s) + a small buffer
        await new Promise(resolve => setTimeout(resolve, 2200));

        // Only one slash-command API call should have been made
        const calls = slashCommandCalls();
        expect(calls.length).toBe(1);
        expect(calls[0].method).toBe('PUT');
        expect(calls[0].url).toContain('discord.com/api/v10/applications');

        bridge.stop();
    });

    test('does nothing when bridge is not running', async () => {
        const bridge = makeBridge(db);
        // running defaults to false — updateSlashCommands should bail out
        bridge.updateSlashCommands();

        await new Promise(resolve => setTimeout(resolve, 2500));
        expect(slashCommandCalls().length).toBe(0);

        bridge.stop();
    });

    test('does nothing when appId is not configured', async () => {
        const bridge = makeBridge(db, { appId: '' });
        (bridge as any).running = true;

        bridge.updateSlashCommands();

        await new Promise(resolve => setTimeout(resolve, 2500));
        expect(slashCommandCalls().length).toBe(0);

        bridge.stop();
    });
});
