import { describe, test, expect, beforeEach, mock } from 'bun:test';

/**
 * Tests for the DiscordBridge.updateSlashCommands() debounce behaviour.
 *
 * We construct a minimal DiscordBridge (no real gateway connection) and
 * verify that rapid successive calls are coalesced into a single Discord
 * API request.
 */

// ── Minimal stubs ────────────────────────────────────────────────────

// Mock the gateway so it never connects
mock.module('../discord/gateway', () => ({
    DiscordGateway: class {
        start() {}
        stop() {}
        updatePresence() {}
    },
}));

// Mock listAgents to return a predictable list
const mockListAgents = mock(() => [
    { name: 'Agent1', model: 'claude-3' },
    { name: 'Agent2', model: 'gpt-4' },
]);

mock.module('../db/agents', () => ({
    listAgents: mockListAgents,
}));

// Track fetch calls to the Discord slash-command registration endpoint
const fetchCalls: Array<{ url: string; method: string }> = [];
const originalFetch = globalThis.fetch;

import { DiscordBridge } from '../discord/bridge';
import type { Database } from 'bun:sqlite';

function makeBridge(): DiscordBridge {
    // Minimal config — appId is required for slash-command registration
    const config = {
        botToken: 'fake-token',
        channelId: '1234567890123456789',
        appId: '9876543210987654321',
        guildId: '',
        allowedUserIds: [],
    };

    const fakeDb = {} as Database;
    const fakeProcessManager = {} as any;

    return new DiscordBridge(fakeDb, fakeProcessManager, config);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('DiscordBridge.updateSlashCommands', () => {
    beforeEach(() => {
        fetchCalls.length = 0;
        mockListAgents.mockClear();
        // Intercept fetch calls to Discord API
        globalThis.fetch = mock(async (input: any, init?: any) => {
            const url = typeof input === 'string' ? input : input.url;
            if (typeof url === 'string' && url.includes('discord.com')) {
                fetchCalls.push({ url, method: init?.method ?? 'GET' });
                return new Response(JSON.stringify([{ name: 'session' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return originalFetch(input, init);
        }) as unknown as typeof fetch;
    });

    test('is callable as a public method', () => {
        const bridge = makeBridge();
        // Should not throw — verifies the method is accessible
        expect(typeof bridge.updateSlashCommands).toBe('function');
        bridge.updateSlashCommands();
        bridge.stop();
    });

    test('debounces rapid calls into a single API request', async () => {
        const bridge = makeBridge();
        // Mark as running so updateSlashCommands will proceed
        (bridge as any).running = true;

        // Fire three rapid calls
        bridge.updateSlashCommands();
        bridge.updateSlashCommands();
        bridge.updateSlashCommands();

        // No fetch should have happened yet (still within debounce window)
        expect(fetchCalls.length).toBe(0);

        // Wait for the debounce timer (2 s) + a small buffer
        await new Promise(resolve => setTimeout(resolve, 2200));

        // Only one API call should have been made
        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0].method).toBe('PUT');
        expect(fetchCalls[0].url).toContain('discord.com/api/v10/applications');

        bridge.stop();
    });

    test('does nothing when bridge is not running', async () => {
        const bridge = makeBridge();
        // running defaults to false — updateSlashCommands should bail out
        bridge.updateSlashCommands();

        await new Promise(resolve => setTimeout(resolve, 2500));
        expect(fetchCalls.length).toBe(0);

        bridge.stop();
    });

    test('does nothing when appId is not configured', async () => {
        const config = {
            botToken: 'fake-token',
            channelId: '1234567890123456789',
            appId: '', // no app ID
            guildId: '',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge({} as Database, {} as any, config);
        (bridge as any).running = true;

        bridge.updateSlashCommands();

        await new Promise(resolve => setTimeout(resolve, 2500));
        expect(fetchCalls.length).toBe(0);

        bridge.stop();
    });
});
