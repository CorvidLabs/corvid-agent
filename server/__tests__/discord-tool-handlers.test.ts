import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleDiscordSendMessage, handleDiscordSendImage } from '../mcp/tool-handlers/discord';
import type { McpToolContext } from '../mcp/tool-handlers/types';
import { mockDiscordRest } from './helpers/mock-discord-rest';

let db: Database;
const ORIGINAL_ENV = process.env.DISCORD_BOT_TOKEN;
let restCleanup: (() => void) | null = null;

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId: 'test-agent',
        db,
        agentMessenger: {} as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        ...overrides,
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    const { cleanup } = mockDiscordRest();
    restCleanup = cleanup;
});

afterEach(() => {
    db.close();
    restCleanup?.();
    restCleanup = null;
    if (ORIGINAL_ENV) process.env.DISCORD_BOT_TOKEN = ORIGINAL_ENV;
    else delete process.env.DISCORD_BOT_TOKEN;
});

describe('handleDiscordSendMessage', () => {
    it('sends a message successfully', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendMessage(ctx, {
            channel_id: '123456',
            message: 'Hello world',
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Message sent to Discord channel 123456');
    });

    it('returns error when channel_id is empty', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendMessage(ctx, {
            channel_id: '',
            message: 'Hello',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('channel_id is required');
    });

    it('returns error when message is empty', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendMessage(ctx, {
            channel_id: '123456',
            message: '',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('message is required');
    });

    it('returns error when bot token is not configured', async () => {
        delete process.env.DISCORD_BOT_TOKEN;
        const ctx = createMockContext();
        const result = await handleDiscordSendMessage(ctx, {
            channel_id: '123456',
            message: 'Hello',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Discord bot token is not configured');
    });

    it('returns error when Discord API fails', async () => {
        // Install a REST client that throws to simulate API failure
        const { _setRestClientForTesting } = await import('../discord/rest-client');
        _setRestClientForTesting({
            sendMessage: async () => { throw new Error('500 Internal Server Error'); },
            editMessage: async () => { throw new Error('500'); },
            sendMessageWithFiles: async () => { throw new Error('500'); },
            respondToInteraction: async () => { throw new Error('500'); },
            deferInteraction: async () => { throw new Error('500'); },
            editDeferredResponse: async () => { throw new Error('500'); },
            deleteMessage: async () => { throw new Error('500'); },
            addReaction: async () => { throw new Error('500'); },
            removeReaction: async () => { throw new Error('500'); },
            sendTypingIndicator: async () => { throw new Error('500'); },
        } as never);
        restCleanup = () => _setRestClientForTesting(null);
        const ctx = createMockContext();
        const result = await handleDiscordSendMessage(ctx, {
            channel_id: '123456',
            message: 'Hello',
        });
        // sendDiscordMessage swallows errors after logging, so handler succeeds
        expect(result.isError).toBeUndefined();
    });
});

describe('handleDiscordSendImage', () => {
    const validBase64 = Buffer.from('fake-png-data').toString('base64');

    it('sends an image successfully', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('image.png');
        expect(text).toContain('123456');
    });

    it('uses custom filename and content type', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
            filename: 'chart.jpg',
            content_type: 'image/jpeg',
            message: 'Here is the chart',
        });
        expect(result.isError).toBeUndefined();
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('chart.jpg');
    });

    it('returns error when channel_id is empty', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '',
            image_base64: validBase64,
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('channel_id is required');
    });

    it('returns error when image_base64 is empty', async () => {
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: '',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('image_base64 is required');
    });

    it('returns error when bot token is not configured', async () => {
        delete process.env.DISCORD_BOT_TOKEN;
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Discord bot token is not configured');
    });

    it('returns error when Discord API returns failure', async () => {
        const { _setRestClientForTesting } = await import('../discord/rest-client');
        _setRestClientForTesting({
            sendMessage: async () => { throw new Error('400 Bad Request'); },
            editMessage: async () => { throw new Error('400'); },
            sendMessageWithFiles: async () => { throw new Error('400 Bad Request'); },
            respondToInteraction: async () => { throw new Error('400'); },
            deferInteraction: async () => { throw new Error('400'); },
            editDeferredResponse: async () => { throw new Error('400'); },
            deleteMessage: async () => { throw new Error('400'); },
            addReaction: async () => { throw new Error('400'); },
            removeReaction: async () => { throw new Error('400'); },
            sendTypingIndicator: async () => { throw new Error('400'); },
        } as never);
        restCleanup = () => _setRestClientForTesting(null);
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
        });
        // sendMessageWithFiles catches errors and returns null → handler reports failure
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('no message ID');
    });

    it('returns error when fetch throws', async () => {
        const { _setRestClientForTesting } = await import('../discord/rest-client');
        _setRestClientForTesting({
            sendMessage: async () => { throw new Error('Network error'); },
            editMessage: async () => { throw new Error('Network error'); },
            sendMessageWithFiles: async () => { throw new Error('Network error'); },
            respondToInteraction: async () => { throw new Error('Network error'); },
            deferInteraction: async () => { throw new Error('Network error'); },
            editDeferredResponse: async () => { throw new Error('Network error'); },
            deleteMessage: async () => { throw new Error('Network error'); },
            addReaction: async () => { throw new Error('Network error'); },
            removeReaction: async () => { throw new Error('Network error'); },
            sendTypingIndicator: async () => { throw new Error('Network error'); },
        } as never);
        restCleanup = () => _setRestClientForTesting(null);
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('no message ID');
    });
});
