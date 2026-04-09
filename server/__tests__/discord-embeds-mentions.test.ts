import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { editEmbed, sendEmbed, sendReplyEmbed } from '../discord/embeds';
import { _setRestClientForTesting } from '../discord/rest-client';
import { DeliveryTracker } from '../lib/delivery-tracker';

/**
 * Mock REST client that records calls for assertion.
 * Each method records { method, args } and returns a fake message with an id.
 */
function createMockRestClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    sendMessage(channelId: string, data: Record<string, unknown>) {
      calls.push({ method: 'sendMessage', args: [channelId, data] });
      return Promise.resolve({ id: '12345678901234567' });
    },
    editMessage(channelId: string, messageId: string, data: Record<string, unknown>) {
      calls.push({ method: 'editMessage', args: [channelId, messageId, data] });
      return Promise.resolve({ id: messageId });
    },
    // Stubs for other methods the rest client exposes
    respondToInteraction() {
      return Promise.resolve({});
    },
    deferInteraction() {
      return Promise.resolve();
    },
    editDeferredResponse() {
      return Promise.resolve({});
    },
    deleteMessage() {
      return Promise.resolve();
    },
    addReaction() {
      return Promise.resolve();
    },
    removeReaction() {
      return Promise.resolve();
    },
    sendTypingIndicator() {
      return Promise.resolve();
    },
    putCommands() {
      return Promise.resolve([]);
    },
    getGuildRoles() {
      return Promise.resolve([]);
    },
    getGuildChannels() {
      return Promise.resolve([]);
    },
    getGuild() {
      return Promise.resolve({});
    },
    modifyChannel() {
      return Promise.resolve({});
    },
    sendMessageWithFiles() {
      return Promise.resolve({ id: '12345678901234567' });
    },
  };
}

const CHANNEL_ID = '12345678901234567';
const MESSAGE_ID = '99999999999999999';
const BOT_TOKEN = 'test-bot-token';

let mockClient: ReturnType<typeof createMockRestClient>;

beforeEach(() => {
  mockClient = createMockRestClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _setRestClientForTesting(mockClient as any);
});

afterEach(() => {
  _setRestClientForTesting(null);
});

describe('sendEmbed mention extraction', () => {
  let tracker: DeliveryTracker;

  test('includes content field when embed has mentions', async () => {
    tracker = new DeliveryTracker();
    await sendEmbed(tracker, BOT_TOKEN, CHANNEL_ID, {
      description: 'Hey <@180715808593281025> check this out',
    });
    expect(mockClient.calls.length).toBe(1);
    const [, data] = mockClient.calls[0].args as [string, Record<string, unknown>];
    expect(data.content).toBe('<@180715808593281025>');
    expect(data.embeds).toHaveLength(1);
  });

  test('omits content field when embed has no mentions', async () => {
    tracker = new DeliveryTracker();
    await sendEmbed(tracker, BOT_TOKEN, CHANNEL_ID, {
      description: 'No mentions here',
    });
    expect(mockClient.calls.length).toBe(1);
    const [, data] = mockClient.calls[0].args as [string, Record<string, unknown>];
    expect(data.content).toBeUndefined();
  });

  test('strips URLs from embed and sends follow-up message', async () => {
    tracker = new DeliveryTracker();
    await sendEmbed(tracker, BOT_TOKEN, CHANNEL_ID, {
      description: 'Check this out https://unsplash.com/photos/test',
    });
    // First call: embed (URLs stripped), second call: URL follow-up
    expect(mockClient.calls.length).toBe(2);
    const [, embedData] = mockClient.calls[0].args as [string, Record<string, unknown>];
    expect((embedData.embeds as Array<{ description?: string }>)[0].description).toBe('Check this out');
    const [, followUpData] = mockClient.calls[1].args as [string, Record<string, unknown>];
    expect(followUpData.content).toBe('https://unsplash.com/photos/test');
    expect(followUpData.embeds).toBeUndefined();
  });

  test('does not send follow-up when no URLs in embed', async () => {
    tracker = new DeliveryTracker();
    await sendEmbed(tracker, BOT_TOKEN, CHANNEL_ID, {
      description: 'Just plain text, no URLs',
    });
    expect(mockClient.calls.length).toBe(1);
  });
});

describe('sendReplyEmbed mention extraction', () => {
  let tracker: DeliveryTracker;

  test('includes content field when embed has mentions', async () => {
    tracker = new DeliveryTracker();
    await sendReplyEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
      description: 'Replying to <@180715808593281025>',
    });
    expect(mockClient.calls.length).toBe(1);
    const [, data] = mockClient.calls[0].args as [string, Record<string, unknown>];
    expect(data.content).toBe('<@180715808593281025>');
    expect(data.message_reference).toEqual({ message_id: MESSAGE_ID });
  });

  test('omits content field when embed has no mentions', async () => {
    tracker = new DeliveryTracker();
    await sendReplyEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
      description: 'Just a reply',
    });
    expect(mockClient.calls.length).toBe(1);
    const [, data] = mockClient.calls[0].args as [string, Record<string, unknown>];
    expect(data.content).toBeUndefined();
  });

  test('strips URLs and sends follow-up for reply embeds', async () => {
    tracker = new DeliveryTracker();
    await sendReplyEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
      description: 'See https://example.com/page',
    });
    expect(mockClient.calls.length).toBe(2);
    const [, embedData] = mockClient.calls[0].args as [string, Record<string, unknown>];
    expect((embedData.embeds as Array<{ description?: string }>)[0].description).toBe('See');
    const [, followUpData] = mockClient.calls[1].args as [string, Record<string, unknown>];
    expect(followUpData.content).toBe('https://example.com/page');
  });
});

describe('editEmbed mention extraction', () => {
  let tracker: DeliveryTracker;

  test('includes content field when embed has mentions', async () => {
    tracker = new DeliveryTracker();
    await editEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
      description: 'Updated with <@180715808593281025>',
    });
    expect(mockClient.calls.length).toBe(1);
    expect(mockClient.calls[0].method).toBe('editMessage');
    const [, , data] = mockClient.calls[0].args as [string, string, Record<string, unknown>];
    expect(data.content).toBe('<@180715808593281025>');
  });

  test('omits content field when embed has no mentions', async () => {
    tracker = new DeliveryTracker();
    await editEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
      description: 'Updated without mentions',
    });
    expect(mockClient.calls.length).toBe(1);
    const [, , data] = mockClient.calls[0].args as [string, string, Record<string, unknown>];
    expect(data.content).toBeUndefined();
  });

  test('strips URLs and sends follow-up for edited embeds', async () => {
    tracker = new DeliveryTracker();
    await editEmbed(tracker, BOT_TOKEN, CHANNEL_ID, MESSAGE_ID, {
      description: 'Updated with https://example.com/link',
    });
    // First call: editMessage, second call: sendMessage (URL follow-up)
    expect(mockClient.calls.length).toBe(2);
    expect(mockClient.calls[0].method).toBe('editMessage');
    const [, , editData] = mockClient.calls[0].args as [string, string, Record<string, unknown>];
    expect((editData.embeds as Array<{ description?: string }>)[0].description).toBe('Updated with');
    expect(mockClient.calls[1].method).toBe('sendMessage');
    const [, followUpData] = mockClient.calls[1].args as [string, Record<string, unknown>];
    expect(followUpData.content).toBe('https://example.com/link');
  });
});
