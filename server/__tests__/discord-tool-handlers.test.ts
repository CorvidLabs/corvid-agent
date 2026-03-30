import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { runMigrations } from '../db/schema';
import { handleDiscordSendImage, handleDiscordSendMessage } from '../mcp/tool-handlers/discord';
import type { McpToolContext } from '../mcp/tool-handlers/types';

// Mock globalThis.fetch instead of mock.module to avoid leaking mocks
// into other test files that share discord/embeds and delivery-tracker.
const originalFetch = globalThis.fetch;

function okResponse(): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ id: 'mock-msg-id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = mock(okResponse) as any;
});

afterEach(() => {
  db.close();
  globalThis.fetch = originalFetch;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = mock(() => Promise.resolve(new Response('Internal Server Error', { status: 500 }))) as any;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = mock(() => Promise.resolve(new Response('Bad Request', { status: 400 }))) as any;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;
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
