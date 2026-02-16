import { test, expect, describe, mock } from 'bun:test';
import { CorvidClient } from '../../cli/client';
import type { CliConfig } from '../../cli/config';

function makeConfig(overrides: Partial<CliConfig> = {}): CliConfig {
    return {
        serverUrl: 'http://127.0.0.1:3578',
        authToken: null,
        defaultAgent: null,
        defaultProject: null,
        defaultModel: null,
        ...overrides,
    };
}

function mockFetch(handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>): typeof fetch {
    const fn = mock(handler) as unknown as typeof fetch;
    return fn;
}

describe('CorvidClient', () => {
    test('constructs with base URL trimming trailing slash', () => {
        const client = new CorvidClient(makeConfig({ serverUrl: 'http://localhost:3578/' }));
        expect(client).toBeDefined();
    });

    test('constructs with auth token', () => {
        const client = new CorvidClient(makeConfig({ authToken: 'test-key' }));
        expect(client).toBeDefined();
    });

    test('get method calls fetch with correct URL', async () => {
        const mockResponse = new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetch(() => Promise.resolve(mockResponse));

        try {
            const client = new CorvidClient(makeConfig());
            const result = await client.get<{ status: string }>('/api/health');
            expect(result.status).toBe('ok');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('post method sends JSON body', async () => {
        const mockResponse = new Response(JSON.stringify({ id: 'new-id' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

        let capturedInit: RequestInit | undefined;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetch((_url, init) => {
            capturedInit = init;
            return Promise.resolve(mockResponse);
        });

        try {
            const client = new CorvidClient(makeConfig());
            const result = await client.post<{ id: string }>('/api/agents', { name: 'test' });

            expect(result.id).toBe('new-id');
            expect(capturedInit?.method).toBe('POST');
            expect(capturedInit?.body).toBe(JSON.stringify({ name: 'test' }));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('throws ApiError on non-ok response', async () => {
        const mockResponse = new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetch(() => Promise.resolve(mockResponse));

        try {
            const client = new CorvidClient(makeConfig());
            await expect(client.get('/api/agents/nonexistent')).rejects.toMatchObject({
                status: 404,
                message: 'Not found',
            });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('includes Authorization header when auth token is set', async () => {
        const mockResponse = new Response(JSON.stringify({}), { status: 200 });

        let capturedHeaders: Record<string, string> | undefined;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetch((_url, init) => {
            capturedHeaders = init?.headers as Record<string, string>;
            return Promise.resolve(mockResponse);
        });

        try {
            const client = new CorvidClient(makeConfig({ authToken: 'my-secret-key' }));
            await client.get('/api/health');

            expect(capturedHeaders?.['Authorization']).toBe('Bearer my-secret-key');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('delete method uses DELETE method', async () => {
        const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });

        let capturedMethod: string | undefined;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetch((_url, init) => {
            capturedMethod = init?.method;
            return Promise.resolve(mockResponse);
        });

        try {
            const client = new CorvidClient(makeConfig());
            await client.delete('/api/sessions/123');
            expect(capturedMethod).toBe('DELETE');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('put method sends body with PUT method', async () => {
        const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });

        let capturedInit: RequestInit | undefined;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mockFetch((_url, init) => {
            capturedInit = init;
            return Promise.resolve(mockResponse);
        });

        try {
            const client = new CorvidClient(makeConfig());
            await client.put('/api/agents/123', { name: 'updated' });
            expect(capturedInit?.method).toBe('PUT');
            expect(capturedInit?.body).toBe(JSON.stringify({ name: 'updated' }));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
