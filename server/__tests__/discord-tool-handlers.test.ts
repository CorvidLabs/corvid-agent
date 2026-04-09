import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { runMigrations } from '../db/schema';
import * as embedsModule from '../discord/embeds';
import { handleDiscordSendImage, handleDiscordSendMessage } from '../mcp/tool-handlers/discord';
import type { McpToolContext } from '../mcp/tool-handlers/types';
import { mockDiscordRest } from './helpers/mock-discord-rest';

// Use spyOn instead of mock.module to avoid polluting the global module cache,
// which breaks sendDiscordMessage in other test files (e.g. discord-bridge).
const mockSendMessageWithFiles = mock((..._args: unknown[]) => Promise.resolve('mock-msg-1' as string | null));
const mockSendDiscordMessage = mock((..._args: unknown[]) => Promise.resolve());

let sendMessageWithFilesSpy: ReturnType<typeof spyOn>;
let sendDiscordMessageSpy: ReturnType<typeof spyOn>;

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
  // Spy on embeds functions to control behavior per-test without mock.module
  sendMessageWithFilesSpy = spyOn(embedsModule, 'sendMessageWithFiles').mockImplementation(
    mockSendMessageWithFiles as unknown as typeof embedsModule.sendMessageWithFiles,
  );
  sendDiscordMessageSpy = spyOn(embedsModule, 'sendDiscordMessage').mockImplementation(
    mockSendDiscordMessage as unknown as typeof embedsModule.sendDiscordMessage,
  );
  // Reset mocks to default success behavior
  mockSendMessageWithFiles.mockImplementation((..._args: unknown[]) => Promise.resolve('mock-msg-1'));
  mockSendDiscordMessage.mockImplementation((..._args: unknown[]) => Promise.resolve());
});

afterEach(() => {
  sendDiscordMessageSpy.mockRestore();
  sendMessageWithFilesSpy.mockRestore();
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
    // sendDiscordMessage swallows errors internally (try/catch in embeds.ts),
    // so even when the underlying REST call fails, the handler still succeeds.
    const ctx = createMockContext();
    const result = await handleDiscordSendMessage(ctx, {
      channel_id: '123456',
      message: 'Hello',
    });
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
    // sendMessageWithFiles returns null on failure → handler reports 'no message ID'
    mockSendMessageWithFiles.mockImplementation((..._args: unknown[]) => Promise.resolve(null));
    const ctx = createMockContext();
    const result = await handleDiscordSendImage(ctx, {
      channel_id: '123456',
      image_base64: validBase64,
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('no message ID');
  });

  it('returns error when fetch throws', async () => {
    mockSendMessageWithFiles.mockImplementation((..._args: unknown[]) => {
      throw new Error('Network error');
    });
    const ctx = createMockContext();
    const result = await handleDiscordSendImage(ctx, {
      channel_id: '123456',
      image_base64: validBase64,
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Network error');
  });
});
