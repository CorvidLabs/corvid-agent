import { beforeEach, describe, expect, test } from 'bun:test';
import {
  _setRestClientForTesting,
  DiscordRestClient,
  getRestClient,
  initializeRestClient,
} from '../discord/rest-client';

/**
 * Create a DiscordRestClient with a mocked internal REST instance.
 * Returns the client and a record of captured calls for assertions.
 */
function createMockClient(): {
  client: DiscordRestClient;
  calls: Array<{ method: string; route: string; options?: unknown }>;
} {
  const calls: Array<{ method: string; route: string; options?: unknown }> = [];

  const client = new DiscordRestClient({ token: 'test-token' });

  // Replace the private `rest` instance with a mock
  const mockRest = {
    get: async (route: string, options?: unknown) => {
      calls.push({ method: 'get', route, options });
      return { id: 'mock-result' };
    },
    post: async (route: string, options?: unknown) => {
      calls.push({ method: 'post', route, options });
      return { id: 'mock-result' };
    },
    patch: async (route: string, options?: unknown) => {
      calls.push({ method: 'patch', route, options });
      return { id: 'mock-result' };
    },
    put: async (route: string, options?: unknown) => {
      calls.push({ method: 'put', route, options });
      return [{ name: 'test-cmd' }];
    },
    delete: async (route: string, options?: unknown) => {
      calls.push({ method: 'delete', route, options });
      return undefined;
    },
  };

  // Access private field via index signature
  (client as any).rest = mockRest;

  return { client, calls };
}

/**
 * Create a mock client where the REST methods throw errors.
 */
function createErrorClient(errorMessage = 'Discord API error'): {
  client: DiscordRestClient;
} {
  const client = new DiscordRestClient({ token: 'test-token' });
  const mockRest = {
    get: async () => {
      throw new Error(errorMessage);
    },
    post: async () => {
      throw new Error(errorMessage);
    },
    patch: async () => {
      throw new Error(errorMessage);
    },
    put: async () => {
      throw new Error(errorMessage);
    },
    delete: async () => {
      throw new Error(errorMessage);
    },
  };
  (client as any).rest = mockRest;
  return { client };
}

describe('DiscordRestClient singleton', () => {
  beforeEach(() => {
    _setRestClientForTesting(null);
  });

  test('getRestClient throws when not initialized', () => {
    expect(() => getRestClient()).toThrow('REST client not initialized. Call initializeRestClient() first.');
  });

  test('initializeRestClient creates a client that getRestClient returns', () => {
    initializeRestClient('test-token-1234');
    const client = getRestClient();
    expect(client).toBeInstanceOf(DiscordRestClient);
  });

  test('_setRestClientForTesting injects a mock', () => {
    const mock = { sendMessage: async () => ({}) } as unknown as DiscordRestClient;
    _setRestClientForTesting(mock);
    expect(getRestClient()).toBe(mock);
  });

  test('_setRestClientForTesting(null) resets to uninitialized', () => {
    initializeRestClient('test-token');
    _setRestClientForTesting(null);
    expect(() => getRestClient()).toThrow();
  });
});

describe('DiscordRestClient methods', () => {
  describe('respondToInteraction', () => {
    test('posts to interaction callback route', async () => {
      const { client, calls } = createMockClient();
      const data = { type: 4, data: { content: 'hello' } };

      await client.respondToInteraction('123', 'tok-abc', data);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('post');
      expect(calls[0].route).toContain('/interactions/123/tok-abc/callback');
      expect(calls[0].options).toEqual({ body: data });
    });

    test('throws and logs on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.respondToInteraction('123', 'tok', { type: 4, data: {} })).rejects.toThrow(
        'Discord API error',
      );
    });
  });

  describe('deferInteraction', () => {
    test('posts deferred response without ephemeral flag', async () => {
      const { client, calls } = createMockClient();

      await client.deferInteraction('456', 'tok-def');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('post');
      expect(calls[0].route).toContain('/interactions/456/tok-def/callback');
      expect(calls[0].options).toEqual({
        body: { type: 5, data: {} },
      });
    });

    test('posts deferred response with ephemeral flag', async () => {
      const { client, calls } = createMockClient();

      await client.deferInteraction('456', 'tok-def', true);

      expect(calls[0].options).toEqual({
        body: { type: 5, data: { flags: 64 } },
      });
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.deferInteraction('456', 'tok')).rejects.toThrow('Discord API error');
    });
  });

  describe('editDeferredResponse', () => {
    test('patches webhook message with @original', async () => {
      const { client, calls } = createMockClient();
      const data = { content: 'updated' };

      await client.editDeferredResponse('app-1', 'tok-edit', data);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('patch');
      expect(calls[0].route).toContain('/webhooks/app-1/tok-edit/messages');
      expect(calls[0].options).toEqual({ body: data });
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.editDeferredResponse('app-1', 'tok', {})).rejects.toThrow('Discord API error');
    });
  });

  describe('sendMessage', () => {
    test('posts to channel messages route', async () => {
      const { client, calls } = createMockClient();
      const data = { content: 'hello world' };

      const result = await client.sendMessage('chan-1', data);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('post');
      expect(calls[0].route).toContain('/channels/chan-1/messages');
      expect(calls[0].options).toEqual({ body: data });
      expect((result as any).id).toBe('mock-result');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.sendMessage('chan-1', {})).rejects.toThrow('Discord API error');
    });
  });

  describe('editMessage', () => {
    test('patches channel message route', async () => {
      const { client, calls } = createMockClient();
      const data = { content: 'edited' };

      await client.editMessage('chan-1', 'msg-1', data);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('patch');
      expect(calls[0].route).toContain('/channels/chan-1/messages/msg-1');
      expect(calls[0].options).toEqual({ body: data });
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.editMessage('chan-1', 'msg-1', {})).rejects.toThrow('Discord API error');
    });
  });

  describe('deleteMessage', () => {
    test('deletes channel message', async () => {
      const { client, calls } = createMockClient();

      await client.deleteMessage('chan-1', 'msg-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('delete');
      expect(calls[0].route).toContain('/channels/chan-1/messages/msg-1');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.deleteMessage('chan-1', 'msg-1')).rejects.toThrow('Discord API error');
    });
  });

  describe('addReaction', () => {
    test('puts reaction on message', async () => {
      const { client, calls } = createMockClient();

      await client.addReaction('chan-1', 'msg-1', '👍');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('put');
      expect(calls[0].route).toContain('/channels/chan-1/messages/msg-1');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.addReaction('chan-1', 'msg-1', '👍')).rejects.toThrow('Discord API error');
    });
  });

  describe('sendTypingIndicator', () => {
    test('posts typing to channel', async () => {
      const { client, calls } = createMockClient();

      await client.sendTypingIndicator('chan-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('post');
      expect(calls[0].route).toContain('/channels/chan-1/typing');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.sendTypingIndicator('chan-1')).rejects.toThrow('Discord API error');
    });
  });

  describe('putCommands', () => {
    test('registers guild-scoped commands and clears global', async () => {
      const { client, calls } = createMockClient();
      const commands = [{ name: 'ping', description: 'Ping' }];

      const result = await client.putCommands('app-1', 'guild-1', commands);

      // First call: register guild commands
      expect(calls[0].method).toBe('put');
      expect(calls[0].route).toContain('/applications/app-1/guilds/guild-1/commands');
      expect(calls[0].options).toEqual({ body: commands });
      // Second call: clear stale global commands
      expect(calls[1].method).toBe('put');
      expect(calls[1].route).toContain('/applications/app-1/commands');
      expect(calls[1].options).toEqual({ body: [] });
      expect(result).toEqual([{ name: 'test-cmd' }]);
    });

    test('registers global commands when no guildId', async () => {
      const { client, calls } = createMockClient();
      const commands = [{ name: 'ping', description: 'Ping' }];

      await client.putCommands('app-1', undefined, commands);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('put');
      expect(calls[0].route).toContain('/applications/app-1/commands');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.putCommands('app-1', 'guild-1', [])).rejects.toThrow('Discord API error');
    });
  });

  describe('getGuildRoles', () => {
    test('fetches roles for guild', async () => {
      const { client, calls } = createMockClient();

      await client.getGuildRoles('guild-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('get');
      expect(calls[0].route).toContain('/guilds/guild-1/roles');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.getGuildRoles('guild-1')).rejects.toThrow('Discord API error');
    });
  });

  describe('getGuildChannels', () => {
    test('fetches channels for guild', async () => {
      const { client, calls } = createMockClient();

      await client.getGuildChannels('guild-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('get');
      expect(calls[0].route).toContain('/guilds/guild-1/channels');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.getGuildChannels('guild-1')).rejects.toThrow('Discord API error');
    });
  });

  describe('getGuild', () => {
    test('fetches guild without counts', async () => {
      const { client, calls } = createMockClient();

      await client.getGuild('guild-1');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('get');
      expect(calls[0].route).toContain('/guilds/guild-1');
    });

    test('fetches guild with counts', async () => {
      const { client, calls } = createMockClient();

      await client.getGuild('guild-1', true);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('get');
      expect(calls[0].route).toContain('guild-1');
      expect(calls[0].route).toContain('with_counts=true');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.getGuild('guild-1')).rejects.toThrow('Discord API error');
    });
  });

  describe('createThread', () => {
    test('posts to threads route with body', async () => {
      const { client, calls } = createMockClient();
      const data = { name: 'Test Thread', type: 11, auto_archive_duration: 1440 };

      const result = await client.createThread('chan-1', data);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('post');
      expect(calls[0].route).toContain('/channels/chan-1/threads');
      expect(calls[0].options).toEqual({ body: data });
      expect((result as { id: string }).id).toBe('mock-result');
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.createThread('chan-1', { name: 'Test', type: 11 })).rejects.toThrow('Discord API error');
    });
  });

  describe('modifyChannel', () => {
    test('patches channel data', async () => {
      const { client, calls } = createMockClient();
      const data = { archived: true };

      await client.modifyChannel('chan-1', data);

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('patch');
      expect(calls[0].route).toContain('/channels/chan-1');
      expect(calls[0].options).toEqual({ body: data });
    });

    test('throws on API error', async () => {
      const { client } = createErrorClient();
      await expect(client.modifyChannel('chan-1', {})).rejects.toThrow('Discord API error');
    });
  });
});

// Note: createRestClient is covered via guild-api tests which mock and exercise it.
