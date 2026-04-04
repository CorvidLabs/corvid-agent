import { test, expect, describe, beforeEach } from 'bun:test';
import {
    DiscordRestClient,
    initializeRestClient,
    getRestClient,
    _setRestClientForTesting,
} from '../discord/rest-client';

describe('DiscordRestClient singleton', () => {
    beforeEach(() => {
        _setRestClientForTesting(null);
    });

    test('getRestClient throws when not initialized', () => {
        expect(() => getRestClient()).toThrow(
            'REST client not initialized. Call initializeRestClient() first.',
        );
    });

    test('initializeRestClient creates a client that getRestClient returns', () => {
        // Use a dummy token — no actual API calls are made
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
