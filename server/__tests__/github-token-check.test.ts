import { describe, it, expect, afterEach, mock, beforeEach } from 'bun:test';
import { validateGitHubTokenScopes } from '../lib/github-token-check';

describe('validateGitHubTokenScopes', () => {
    const originalEnv = { ...process.env };
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        // Reset fetch mock before each test
        globalThis.fetch = originalFetch;
    });

    afterEach(() => {
        // Restore env
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        Object.assign(process.env, originalEnv);
        globalThis.fetch = originalFetch;
    });

    it('returns early when GH_TOKEN is not set', async () => {
        delete process.env.GH_TOKEN;
        const fetchSpy = mock(() => Promise.resolve(new Response()));
        globalThis.fetch = fetchSpy as unknown as typeof fetch;

        await validateGitHubTokenScopes();

        // Should not have called fetch
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('handles non-OK API response gracefully', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response('Unauthorized', { status: 401 })),
        ) as unknown as typeof fetch;

        // Should not throw
        await validateGitHubTokenScopes();
    });

    it('reports all scopes present when token has repo and read:org', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    headers: { 'X-OAuth-Scopes': 'repo, read:org, gist' },
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw
        await validateGitHubTokenScopes();
    });

    it('warns when repo scope is missing', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    headers: { 'X-OAuth-Scopes': 'read:org, gist' },
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw — just logs warnings
        await validateGitHubTokenScopes();
    });

    it('warns when read:org scope is missing', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    headers: { 'X-OAuth-Scopes': 'repo, gist' },
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw — just logs warnings
        await validateGitHubTokenScopes();
    });

    it('accepts admin:org as implying read:org', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    headers: { 'X-OAuth-Scopes': 'repo, admin:org' },
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw — admin:org covers read:org
        await validateGitHubTokenScopes();
    });

    it('accepts write:org as implying read:org', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    headers: { 'X-OAuth-Scopes': 'repo, write:org' },
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw — write:org covers read:org
        await validateGitHubTokenScopes();
    });

    it('handles fine-grained tokens with no X-OAuth-Scopes header', async () => {
        process.env.GH_TOKEN = 'github_pat_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    // No X-OAuth-Scopes header for fine-grained tokens
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw
        await validateGitHubTokenScopes();
    });

    it('handles network errors gracefully', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.reject(new Error('Network error')),
        ) as unknown as typeof fetch;

        // Should not throw
        await validateGitHubTokenScopes();
    });

    it('handles empty scope header', async () => {
        process.env.GH_TOKEN = 'ghp_test';
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response('{}', {
                    status: 200,
                    headers: { 'X-OAuth-Scopes': '' },
                }),
            ),
        ) as unknown as typeof fetch;

        // Should not throw — warns about missing scopes
        await validateGitHubTokenScopes();
    });
});
