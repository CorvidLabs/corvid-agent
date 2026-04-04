/**
 * Test helper: installs a mock DiscordRestClient that captures call bodies.
 *
 * Returns `fetchBodies` (same shape the old fetch-based tests checked)
 * so existing assertions need minimal changes.
 *
 * Usage:
 *   const { fetchBodies, cleanup } = mockDiscordRest();
 *   try { ... } finally { cleanup(); }
 */

import { _setRestClientForTesting } from '../../discord/rest-client';
import type { DiscordRestClient } from '../../discord/rest-client';

export function mockDiscordRest(): { fetchBodies: unknown[]; cleanup: () => void } {
    const fetchBodies: unknown[] = [];

    const mock: Partial<DiscordRestClient> = {
        respondToInteraction: async (_id: string, _token: string, data: unknown) => {
            fetchBodies.push(data);
            return {} as never;
        },
        deferInteraction: async () => {},
        editDeferredResponse: async (_appId: string, _token: string, data: unknown) => {
            fetchBodies.push(data);
            return {} as never;
        },
        sendMessage: async (_channelId: string, data: unknown) => {
            fetchBodies.push(data);
            return { id: 'mock-msg-1' } as never;
        },
        editMessage: async (_channelId: string, _messageId: string, data: unknown) => {
            fetchBodies.push(data);
            return { id: 'mock-msg-1' } as never;
        },
        deleteMessage: async () => {},
        addReaction: async () => {},
        sendTypingIndicator: async () => {},
    };

    _setRestClientForTesting(mock as DiscordRestClient);

    return {
        fetchBodies,
        cleanup: () => _setRestClientForTesting(null),
    };
}
