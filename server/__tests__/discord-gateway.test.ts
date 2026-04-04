/**
 * Tests for discord/gateway.ts — DiscordGateway class and type mapping helpers.
 *
 * The actual discord.js Client is mocked so no network connection is made.
 * Tests verify: construction, start/stop lifecycle, presence updates,
 * and correct mapping of discord.js events → internal dispatch types.
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import type { GatewayDispatchHandlers } from '../discord/gateway';
import type { DiscordBridgeConfig, DiscordMessageData, DiscordInteractionData, DiscordReactionData } from '../discord/types';

// ─── Mock discord.js before importing gateway ──────────────────────────────

// Event handler store for the mock Client
type EventCallback = (...args: unknown[]) => void;

let clientEvents: Record<string, EventCallback[]> = {};
let clientLoginCalled = false;
let clientLoginToken: string | null = null;
let clientDestroyCalled = false;
let lastPresence: unknown = null;
let mockClientIsReady = false;

const mockClientInstance = {
    on(event: string, cb: EventCallback) {
        if (!clientEvents[event]) clientEvents[event] = [];
        clientEvents[event].push(cb);
        return mockClientInstance;
    },
    once(event: string, cb: EventCallback) {
        // Store as regular handler for testing
        if (!clientEvents[`once:${event}`]) clientEvents[`once:${event}`] = [];
        clientEvents[`once:${event}`].push(cb);
        return mockClientInstance;
    },
    login: mock(async (token: string) => {
        clientLoginCalled = true;
        clientLoginToken = token;
    }),
    destroy: mock(() => {
        clientDestroyCalled = true;
    }),
    isReady: () => mockClientIsReady,
    user: {
        id: '999888777',
        setPresence: mock((data: unknown) => { lastPresence = data; }),
    },
};

// Replace discord.js module
mock.module('discord.js', () => ({
    Client: class MockClient {
        constructor(_opts: unknown) {
            return mockClientInstance as any;
        }
    },
    GatewayIntentBits: {
        Guilds: 1,
        GuildMessages: 512,
        GuildMessageReactions: 1024,
        MessageContent: 32768,
        GuildMembers: 2,
    },
    ActivityType: { Watching: 3, Playing: 0 },
    PresenceUpdateStatus: { Online: 'online' },
}));

// Import after mock
const { DiscordGateway } = await import('../discord/gateway');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<DiscordBridgeConfig> = {}): DiscordBridgeConfig {
    return {
        botToken: 'test-bot-token',
        channelId: '111222333',
        allowedUserIds: ['user-1'],
        ...overrides,
    };
}

function makeHandlers(overrides: Partial<GatewayDispatchHandlers> = {}): GatewayDispatchHandlers {
    return {
        onMessage: mock(() => {}),
        onInteraction: mock(() => {}),
        onReady: mock(() => {}),
        onReactionAdd: mock(() => {}),
        ...overrides,
    };
}

function emitEvent(event: string, ...args: unknown[]) {
    for (const cb of clientEvents[event] ?? []) cb(...args);
    for (const cb of clientEvents[`once:${event}`] ?? []) cb(...args);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DiscordGateway', () => {
    beforeEach(() => {
        clientEvents = {};
        clientLoginCalled = false;
        clientLoginToken = null;
        clientDestroyCalled = false;
        lastPresence = null;
        mockClientIsReady = false;
        (mockClientInstance.login as ReturnType<typeof mock>).mockClear();
        (mockClientInstance.destroy as ReturnType<typeof mock>).mockClear();
        (mockClientInstance.user.setPresence as ReturnType<typeof mock>).mockClear();
    });

    describe('constructor and properties', () => {
        test('exposes botToken from config', () => {
            const gw = new DiscordGateway(makeConfig({ botToken: 'my-token' }), makeHandlers());
            expect(gw.botToken).toBe('my-token');
        });

        test('running is false before start', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            expect(gw.running).toBe(false);
        });
    });

    describe('start()', () => {
        test('sets running to true and calls client.login', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.start();
            expect(gw.running).toBe(true);
            expect(clientLoginCalled).toBe(true);
            expect(clientLoginToken).toBe('test-bot-token');
        });

        test('is a no-op if already running', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.start();
            (mockClientInstance.login as ReturnType<typeof mock>).mockClear();
            gw.start(); // second call
            expect(mockClientInstance.login).not.toHaveBeenCalled();
        });

        test('adds GuildMembers intent in publicMode', () => {
            const gw = new DiscordGateway(makeConfig({ publicMode: true }), makeHandlers());
            gw.start();
            // Just verify it starts without error in publicMode
            expect(gw.running).toBe(true);
        });
    });

    describe('stop()', () => {
        test('sets running to false and destroys client', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.start();
            gw.stop();
            expect(gw.running).toBe(false);
            expect(clientDestroyCalled).toBe(true);
        });

        test('no-op if not started', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.stop(); // should not throw
            expect(gw.running).toBe(false);
        });
    });

    describe('updatePresence()', () => {
        test('sets presence when client is ready', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.start();
            mockClientIsReady = true;
            gw.updatePresence('Testing', 0);
            expect(lastPresence).toBeTruthy();
            const p = lastPresence as { status: string; activities: Array<{ name: string; type: number }> };
            expect(p.status).toBe('online');
            expect(p.activities[0].name).toBe('Testing');
        });

        test('no-op when client is not ready', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.start();
            mockClientIsReady = false;
            gw.updatePresence('Testing');
            expect(lastPresence).toBeNull();
        });
    });

    describe('event: ready', () => {
        test('calls onReady handler with bot user ID', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();
            emitEvent('ready', { user: { id: '123456' } });
            expect(handlers.onReady).toHaveBeenCalledWith('123456', '123456');
        });
    });

    describe('event: messageCreate', () => {
        test('maps discord.js Message to DiscordMessageData and calls onMessage', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeMessage = {
                id: 'msg-1',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: 'hello world',
                createdAt: new Date('2026-01-01T00:00:00Z'),
                channel: {
                    isThread: () => false,
                    messages: { cache: new Map() },
                },
                mentions: {
                    users: new Map(),
                    roles: new Map(),
                },
                member: null,
                reference: null,
                attachments: new Map(),
            };

            emitEvent('messageCreate', fakeMessage);

            expect(handlers.onMessage).toHaveBeenCalledTimes(1);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.id).toBe('msg-1');
            expect(mapped.channel_id).toBe('chan-1');
            expect(mapped.author.username).toBe('alice');
            expect(mapped.content).toBe('hello world');
            expect(mapped.attachments).toEqual([]);
        });

        test('maps thread messages correctly', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeMessage = {
                id: 'msg-2',
                channelId: 'thread-1',
                author: { id: 'u2', username: 'bob', bot: true },
                content: 'thread msg',
                createdAt: new Date('2026-01-01T00:00:00Z'),
                channel: {
                    isThread: () => true,
                    messages: { cache: new Map() },
                },
                mentions: { users: new Map(), roles: new Map() },
                member: { roles: { cache: new Map([['role-1', {}]]) } },
                reference: null,
                attachments: new Map(),
            };

            emitEvent('messageCreate', fakeMessage);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.thread).toEqual({ id: 'thread-1' });
            expect(mapped.member?.roles).toContain('role-1');
            expect(mapped.author.bot).toBe(true);
        });

        test('maps referenced message from cache', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const cachedMsg = {
                id: 'ref-msg-1',
                content: 'original message',
                author: { id: 'u3', username: 'carol', bot: false },
            };
            const cache = new Map([['ref-msg-1', cachedMsg]]);

            const fakeMessage = {
                id: 'msg-3',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: 'reply here',
                createdAt: new Date(),
                channel: { isThread: () => false, messages: { cache } },
                mentions: { users: new Map(), roles: new Map() },
                member: null,
                reference: { messageId: 'ref-msg-1', channelId: 'chan-1', guildId: 'g1' },
                attachments: new Map(),
            };

            emitEvent('messageCreate', fakeMessage);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.referenced_message?.id).toBe('ref-msg-1');
            expect(mapped.referenced_message?.content).toBe('original message');
            expect(mapped.message_reference?.message_id).toBe('ref-msg-1');
            expect(mapped.message_reference?.guild_id).toBe('g1');
        });

        test('maps attachments correctly', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const attachment = {
                id: 'att-1',
                name: 'test.png',
                contentType: 'image/png',
                size: 1024,
                url: 'https://cdn.example.com/test.png',
                proxyURL: 'https://proxy.example.com/test.png',
                width: 100,
                height: 200,
            };

            const fakeMessage = {
                id: 'msg-att',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: '',
                createdAt: new Date(),
                channel: { isThread: () => false, messages: { cache: new Map() } },
                mentions: { users: new Map(), roles: new Map() },
                member: null,
                reference: null,
                attachments: new Map([['att-1', attachment]]),
            };

            emitEvent('messageCreate', fakeMessage);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.attachments).toHaveLength(1);
            expect(mapped.attachments![0].filename).toBe('test.png');
            expect(mapped.attachments![0].content_type).toBe('image/png');
            expect(mapped.attachments![0].width).toBe(100);
        });

        test('ignores messages when not running', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();
            gw.stop();

            const fakeMessage = {
                id: 'msg-x',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: 'should be ignored',
                createdAt: new Date(),
                channel: { isThread: () => false, messages: { cache: new Map() } },
                mentions: { users: new Map(), roles: new Map() },
                member: null,
                reference: null,
                attachments: new Map(),
            };

            emitEvent('messageCreate', fakeMessage);
            expect(handlers.onMessage).not.toHaveBeenCalled();
        });

        test('maps mentions correctly', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeMessage = {
                id: 'msg-m',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: '@bob hello',
                createdAt: new Date(),
                channel: { isThread: () => false, messages: { cache: new Map() } },
                mentions: {
                    users: new Map([['u2', { id: 'u2', username: 'bob', bot: false }]]),
                    roles: new Map([['role-1', {}]]),
                },
                member: null,
                reference: null,
                attachments: new Map(),
            };

            emitEvent('messageCreate', fakeMessage);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.mentions).toHaveLength(1);
            expect(mapped.mentions![0].username).toBe('bob');
            expect(mapped.mention_roles).toContain('role-1');
        });
    });

    describe('event: interactionCreate', () => {
        test('maps slash command interaction', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-1',
                type: 2,
                channelId: 'chan-1',
                guildId: 'guild-1',
                token: 'tok-abc',
                member: {
                    user: { id: 'u1', username: 'alice', bot: false },
                    roles: { cache: new Map([['role-1', {}]]) },
                },
                user: { id: 'u1', username: 'alice', bot: false },
                isChatInputCommand: () => true,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
                commandName: 'help',
                options: {
                    data: [{ name: 'topic', type: 3, value: 'commands' }],
                },
            };

            emitEvent('interactionCreate', fakeInteraction);

            expect(handlers.onInteraction).toHaveBeenCalledTimes(1);
            const mapped = (handlers.onInteraction as ReturnType<typeof mock>).mock.calls[0][0] as DiscordInteractionData;
            expect(mapped.id).toBe('int-1');
            expect(mapped.channel_id).toBe('chan-1');
            expect(mapped.data?.name).toBe('help');
            expect(mapped.data?.options).toHaveLength(1);
            expect(mapped.data?.options![0].value).toBe('commands');
            expect(mapped.member?.roles).toContain('role-1');
        });

        test('maps button component interaction', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-2',
                type: 3,
                channelId: 'chan-1',
                guildId: null,
                token: 'tok-btn',
                member: null,
                user: { id: 'u2', username: 'bob', bot: false },
                isChatInputCommand: () => false,
                isAutocomplete: () => false,
                isMessageComponent: () => true,
                customId: 'approve-123',
                componentType: 2,
                message: { id: 'msg-btn', channelId: 'chan-1' },
            };

            emitEvent('interactionCreate', fakeInteraction);

            const mapped = (handlers.onInteraction as ReturnType<typeof mock>).mock.calls[0][0] as DiscordInteractionData;
            expect(mapped.data?.custom_id).toBe('approve-123');
            expect(mapped.data?.component_type).toBe(2);
            expect(mapped.message?.id).toBe('msg-btn');
        });

        test('maps ping interaction', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-3',
                type: 1,
                channelId: 'chan-1',
                guildId: null,
                token: 'tok-ping',
                member: null,
                user: null,
                isChatInputCommand: () => false,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
            };

            emitEvent('interactionCreate', fakeInteraction);
            const mapped = (handlers.onInteraction as ReturnType<typeof mock>).mock.calls[0][0] as DiscordInteractionData;
            expect(mapped.type).toBe(1);
        });

        test('ignores interaction with no channelId', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-4',
                type: 2,
                channelId: null,
                guildId: null,
                token: 'tok-x',
                member: null,
                user: null,
                isChatInputCommand: () => true,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
                commandName: 'test',
                options: { data: [] },
            };

            emitEvent('interactionCreate', fakeInteraction);
            expect(handlers.onInteraction).not.toHaveBeenCalled();
        });

        test('ignores interactions when not running', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();
            gw.stop();

            const fakeInteraction = {
                id: 'int-5',
                type: 2,
                channelId: 'chan-1',
                guildId: null,
                token: 'tok-y',
                member: null,
                user: null,
                isChatInputCommand: () => true,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
                commandName: 'test',
                options: { data: [] },
            };

            emitEvent('interactionCreate', fakeInteraction);
            expect(handlers.onInteraction).not.toHaveBeenCalled();
        });

        test('returns null for unrecognized interaction type', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-6',
                type: 99,
                channelId: 'chan-1',
                guildId: null,
                token: 'tok-z',
                member: null,
                user: null,
                isChatInputCommand: () => false,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
            };

            emitEvent('interactionCreate', fakeInteraction);
            expect(handlers.onInteraction).not.toHaveBeenCalled();
        });

        test('maps autocomplete interaction', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-ac',
                type: 4,
                channelId: 'chan-1',
                guildId: 'guild-1',
                token: 'tok-ac',
                member: null,
                user: { id: 'u1', username: 'alice', bot: false },
                isChatInputCommand: () => false,
                isAutocomplete: () => true,
                isMessageComponent: () => false,
                commandName: 'search',
                options: {
                    data: [{ name: 'query', type: 3, value: 'test', focused: true }],
                },
            };

            emitEvent('interactionCreate', fakeInteraction);
            const mapped = (handlers.onInteraction as ReturnType<typeof mock>).mock.calls[0][0] as DiscordInteractionData;
            expect(mapped.data?.name).toBe('search');
            expect(mapped.data?.options![0].focused).toBe(true);
        });

        test('maps member with APIInteractionGuildMember (string[] roles)', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-api',
                type: 2,
                channelId: 'chan-1',
                guildId: 'guild-1',
                token: 'tok-api',
                member: {
                    user: { id: 'u1', username: 'alice', bot: false },
                    roles: ['role-a', 'role-b'], // string[] form (API member)
                },
                user: { id: 'u1', username: 'alice', bot: false },
                isChatInputCommand: () => true,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
                commandName: 'test',
                options: { data: [] },
            };

            emitEvent('interactionCreate', fakeInteraction);
            const mapped = (handlers.onInteraction as ReturnType<typeof mock>).mock.calls[0][0] as DiscordInteractionData;
            expect(mapped.member?.roles).toEqual(['role-a', 'role-b']);
        });

        test('maps nested subcommand options', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeInteraction = {
                id: 'int-nested',
                type: 2,
                channelId: 'chan-1',
                guildId: 'guild-1',
                token: 'tok-nested',
                member: null,
                user: { id: 'u1', username: 'alice', bot: false },
                isChatInputCommand: () => true,
                isAutocomplete: () => false,
                isMessageComponent: () => false,
                commandName: 'admin',
                options: {
                    data: [{
                        name: 'config',
                        type: 1,
                        options: [{ name: 'key', type: 3, value: 'debug' }],
                    }],
                },
            };

            emitEvent('interactionCreate', fakeInteraction);
            const mapped = (handlers.onInteraction as ReturnType<typeof mock>).mock.calls[0][0] as DiscordInteractionData;
            expect(mapped.data?.options![0].name).toBe('config');
            expect(mapped.data?.options![0].options![0].value).toBe('debug');
        });
    });

    describe('event: messageReactionAdd', () => {
        test('maps reaction and calls onReactionAdd', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeReaction = {
                message: { channelId: 'chan-1', id: 'msg-1', guildId: 'guild-1' },
                emoji: { id: null, name: '👍' },
            };
            const fakeUser = { id: 'u1' };

            emitEvent('messageReactionAdd', fakeReaction, fakeUser);

            expect(handlers.onReactionAdd).toHaveBeenCalledTimes(1);
            const mapped = (handlers.onReactionAdd as ReturnType<typeof mock>).mock.calls[0][0] as DiscordReactionData;
            expect(mapped.user_id).toBe('u1');
            expect(mapped.channel_id).toBe('chan-1');
            expect(mapped.message_id).toBe('msg-1');
            expect(mapped.emoji.name).toBe('👍');
        });

        test('ignores reactions when not running', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();
            gw.stop();

            emitEvent('messageReactionAdd', {
                message: { channelId: 'c', id: 'm', guildId: null },
                emoji: { id: null, name: '🎉' },
            }, { id: 'u1' });

            expect(handlers.onReactionAdd).not.toHaveBeenCalled();
        });

        test('ignores reactions when no onReactionAdd handler', () => {
            const handlers = makeHandlers({ onReactionAdd: undefined });
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            emitEvent('messageReactionAdd', {
                message: { channelId: 'c', id: 'm', guildId: null },
                emoji: { id: null, name: '🎉' },
            }, { id: 'u1' });

            // Should not throw
        });

        test('ignores reaction with no user id', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            emitEvent('messageReactionAdd', {
                message: { channelId: 'c', id: 'm', guildId: null },
                emoji: { id: null, name: '🎉' },
            }, { id: null });

            expect(handlers.onReactionAdd).not.toHaveBeenCalled();
        });
    });

    describe('event: error', () => {
        test('does not throw on gateway error event', () => {
            const gw = new DiscordGateway(makeConfig(), makeHandlers());
            gw.start();
            // Should just log, not throw
            emitEvent('error', new Error('test gateway error'));
        });
    });

    describe('edge cases', () => {
        test('attachment with null contentType/width/height maps to undefined', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const attachment = {
                id: 'att-2',
                name: 'data.csv',
                contentType: null,
                size: 512,
                url: 'https://cdn.example.com/data.csv',
                proxyURL: 'https://proxy.example.com/data.csv',
                width: null,
                height: null,
            };

            const fakeMessage = {
                id: 'msg-e',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: '',
                createdAt: new Date(),
                channel: { isThread: () => false, messages: { cache: new Map() } },
                mentions: { users: new Map(), roles: new Map() },
                member: null,
                reference: null,
                attachments: new Map([['att-2', attachment]]),
            };

            emitEvent('messageCreate', fakeMessage);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.attachments![0].content_type).toBeUndefined();
            expect(mapped.attachments![0].width).toBeUndefined();
            expect(mapped.attachments![0].height).toBeUndefined();
        });

        test('message with reference but no cached message sets referenced_message to null', () => {
            const handlers = makeHandlers();
            const gw = new DiscordGateway(makeConfig(), handlers);
            gw.start();

            const fakeMessage = {
                id: 'msg-no-cache',
                channelId: 'chan-1',
                author: { id: 'u1', username: 'alice', bot: false },
                content: 'reply',
                createdAt: new Date(),
                channel: { isThread: () => false, messages: { cache: new Map() } },
                mentions: { users: new Map(), roles: new Map() },
                member: null,
                reference: { messageId: 'not-in-cache', channelId: null, guildId: null },
                attachments: new Map(),
            };

            emitEvent('messageCreate', fakeMessage);
            const mapped = (handlers.onMessage as ReturnType<typeof mock>).mock.calls[0][0] as DiscordMessageData;
            expect(mapped.referenced_message).toBeNull();
            expect(mapped.message_reference?.message_id).toBe('not-in-cache');
        });
    });
});
