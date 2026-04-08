import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';

// Mock worktree creation — git is not available in CI / test environments.
mock.module('../lib/worktree', () => ({
    createWorktree: async () => ({ success: true, worktreeDir: '/tmp/mock-worktree' }),
    resolveAndCreateWorktree: async () => ({ success: true, workDir: '/tmp/mock-worktree' }),
    generateChatBranchName: (agent: string, id: string) => `chat/${agent}/${id.slice(0, 8)}`,
    getWorktreeBaseDir: (dir: string) => `${dir}/.worktrees`,
    removeWorktree: async () => ({ success: true }),
}));

import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { DiscordBridge } from '../discord/bridge';
import type { DiscordBridgeConfig } from '../discord/types';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { withAuthorContext } from '../discord/message-handler';
import { mockDiscordRest } from './helpers/mock-discord-rest';

function createMockProcessManager() {
    return {
        getActiveSessionIds: () => [] as string[],
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        subscribeAll: mock(() => {}),
        unsubscribeAll: mock(() => {}),
        resumeProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        isRunning: mock(() => true),
    } as unknown as import('../process/manager').ProcessManager;
}

/** Set the bot's user ID on the bridge (simulates READY event). */
function setBotUserId(bridge: DiscordBridge, botUserId: string): void {
    (bridge as unknown as { botUserId: string }).botUserId = botUserId;
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

describe('DiscordBridge mention-reply resume', () => {
    test('reply to bot message resumes existing session', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        // Create a session and add it to mentionSessions map
        const { createSession } = await import('../db/sessions');
        const { listAgents } = await import('../db/agents');
        const { listProjects } = await import('../db/projects');
        const agents = listAgents(db);
        const projects = listProjects(db);
        const session = createSession(db, {
            projectId: projects[0].id,
            agentId: agents[0].id,
            name: 'Mention reply test',
            initialPrompt: 'test',
            source: 'discord',
        });

        const tsm = (bridge as unknown as { tsm: { mentionSessions: Map<string, import('../discord/message-handler').MentionSessionInfo> } }).tsm;
        tsm.mentionSessions.set('600000000000000001', {
            sessionId: session.id,
            agentName: 'TestAgent',
            agentModel: 'test-model',
        });

        const { cleanup } = mockDiscordRest();

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000030',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'follow up question',
                timestamp: new Date().toISOString(),
                message_reference: { message_id: '600000000000000001' },
                referenced_message: {
                    id: '600000000000000001',
                    content: 'bot response',
                    author: { id: '999000000000000001', username: 'CorvidBot', bot: true },
                },
            });

            // Should send message to existing session (resume) rather than start new
            expect(pm.sendMessage).toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test('reply to unknown bot message falls through to new session', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const { cleanup } = mockDiscordRest();

        try {
            // Reply to a bot message that isn't tracked (e.g. after restart)
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000031',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: 'follow up to old message',
                timestamp: new Date().toISOString(),
                message_reference: { message_id: '700000000000000001' },
                referenced_message: {
                    id: '700000000000000001',
                    content: 'old bot response',
                    author: { id: '999000000000000001', username: 'CorvidBot', bot: true },
                },
            });

            // Should create a new session (startProcess) since mentionSessions doesn't have this message
            expect(pm.startProcess).toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test('botRoleId mention triggers reply', async () => {
        const pm = createMockProcessManager();
        createAgent(db, { name: 'TestAgent' });
        createProject(db, { name: 'TestProject', workingDir: '/tmp/test' });

        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            botRoleId: '888000000000000001',
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const { cleanup } = mockDiscordRest();

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000032',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@&888000000000000001> what time is it?',
                timestamp: new Date().toISOString(),
                mentions: [],
                mention_roles: ['888000000000000001'],
            });

            // Should start process — bot role was mentioned
            expect(pm.startProcess).toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test('unrelated role mention does not trigger reply', async () => {
        const pm = createMockProcessManager();
        const config: DiscordBridgeConfig = {
            botToken: 'test-token',
            channelId: '100000000000000001',
            allowedUserIds: [],
            botRoleId: '888000000000000001',
        };
        const bridge = new DiscordBridge(db, pm, config);
        setBotUserId(bridge, '999000000000000001');

        const { cleanup } = mockDiscordRest();

        try {
            await (bridge as unknown as { handleMessage: (msg: unknown) => Promise<void> }).handleMessage({
                id: '200000000000000033',
                channel_id: '100000000000000001',
                author: { id: 'user-1', username: 'TestUser' },
                content: '<@&777000000000000001> hello',
                timestamp: new Date().toISOString(),
                mentions: [],
                mention_roles: ['777000000000000001'], // different role, not the bot
            });

            // Should NOT start process — wrong role
            expect(pm.startProcess).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });
});

describe('withAuthorContext', () => {
    test('returns text unchanged when no author info provided', () => {
        expect(withAuthorContext('hello')).toBe('hello');
    });

    test('includes both username and Discord ID when both provided', () => {
        expect(withAuthorContext('hello', '12345', 'Alice')).toBe('[From Discord user: Alice (Discord ID: 12345)]\nhello');
    });

    test('includes only Discord ID when username is missing', () => {
        expect(withAuthorContext('hello', '12345')).toBe('[From Discord user ID: 12345]\nhello');
    });

    test('includes only username when Discord ID is missing', () => {
        expect(withAuthorContext('hello', undefined, 'Alice')).toBe('[From Discord user: Alice]\nhello');
    });

    test('includes channel ID when provided with full author info', () => {
        expect(withAuthorContext('hello', '12345', 'Alice', '99999')).toBe('[From Discord user: Alice (Discord ID: 12345) in channel 99999]\nhello');
    });

    test('includes channel ID with only Discord ID', () => {
        expect(withAuthorContext('hello', '12345', undefined, '99999')).toBe('[From Discord user ID: 12345 in channel 99999]\nhello');
    });

    test('includes channel ID with only username', () => {
        expect(withAuthorContext('hello', undefined, 'Alice', '99999')).toBe('[From Discord user: Alice in channel 99999]\nhello');
    });
});
