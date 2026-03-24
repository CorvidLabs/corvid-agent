import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleDiscordSendMessage, handleDiscordSendImage } from '../mcp/tool-handlers/discord';
import type { McpToolContext } from '../mcp/tool-handlers/types';

// Mock the discord embeds module
const mockSendDiscordMessage = mock(() => Promise.resolve('mock-msg-id'));
const mockSendMessageWithFiles = mock(() => Promise.resolve('mock-msg-id'));
mock.module('../discord/embeds', () => ({
    sendDiscordMessage: mockSendDiscordMessage,
    sendMessageWithFiles: mockSendMessageWithFiles,
}));

// Mock delivery tracker
mock.module('../lib/delivery-tracker', () => ({
    getDeliveryTracker: () => ({}),
}));

let db: Database;
const ORIGINAL_ENV = process.env.DISCORD_BOT_TOKEN;

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
    mockSendDiscordMessage.mockClear();
    mockSendMessageWithFiles.mockClear();
});

afterEach(() => {
    db.close();
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

    it('returns error when sendDiscordMessage throws', async () => {
        mockSendDiscordMessage.mockRejectedValueOnce(new Error('API error'));
        const ctx = createMockContext();
        const result = await handleDiscordSendMessage(ctx, {
            channel_id: '123456',
            message: 'Hello',
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Failed to send Discord message');
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

    it('returns error when sendMessageWithFiles returns no message ID', async () => {
        mockSendMessageWithFiles.mockResolvedValueOnce(null);
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('no message ID');
    });

    it('returns error when sendMessageWithFiles throws', async () => {
        mockSendMessageWithFiles.mockRejectedValueOnce(new Error('Upload failed'));
        const ctx = createMockContext();
        const result = await handleDiscordSendImage(ctx, {
            channel_id: '123456',
            image_base64: validBase64,
        });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Failed to send Discord image');
    });
});
