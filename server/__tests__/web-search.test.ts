import { describe, test, expect, afterEach } from 'bun:test';
import { braveWebSearch, braveMultiSearch } from '../lib/web-search';
import { handleWebSearch, handleDeepResearch, type McpToolContext } from '../mcp/tool-handlers';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a minimal McpToolContext for testing (only fields used by web search handlers). */
function makeCtx(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId: 'test-agent',
        db: {} as McpToolContext['db'],
        agentMessenger: {} as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        emitStatus: () => {},
        ...overrides,
    };
}

/** Create a mock Brave API success response. */
function braveResponse(results: Array<{ title: string; url: string; description: string; age?: string }>) {
    return new Response(JSON.stringify({ web: { results } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function mockFetch(fn: (input: string | URL | Request) => Promise<Response>) {
    globalThis.fetch = fn as typeof fetch;
}

/** Extract text from a CallToolResult content array. */
function getText(result: { content: Array<{ type: string; text?: string }> }): string {
    const first = result.content[0];
    return (first as { type: 'text'; text: string }).text;
}

// ── braveWebSearch ───────────────────────────────────────────────────────

describe('braveWebSearch', () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.BRAVE_SEARCH_API_KEY;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalEnv !== undefined) {
            process.env.BRAVE_SEARCH_API_KEY = originalEnv;
        } else {
            delete process.env.BRAVE_SEARCH_API_KEY;
        }
    });

    test('returns empty array when API key is missing', async () => {
        delete process.env.BRAVE_SEARCH_API_KEY;
        const results = await braveWebSearch('test query');
        expect(results).toEqual([]);
    });

    test('returns parsed results on success', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            expect(url).toContain('api.search.brave.com');
            expect(url).toContain('q=bun+runtime');
            return braveResponse([
                { title: 'Bun', url: 'https://bun.sh', description: 'Fast JS runtime' },
                { title: 'Bun Docs', url: 'https://bun.sh/docs', description: 'Documentation', age: '2 days ago' },
            ]);
        });

        const results = await braveWebSearch('bun runtime');
        expect(results).toHaveLength(2);
        expect(results[0].title).toBe('Bun');
        expect(results[0].url).toBe('https://bun.sh');
        expect(results[1].age).toBe('2 days ago');
    });

    test('passes count and freshness params', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            expect(url).toContain('count=10');
            expect(url).toContain('freshness=pw');
            return braveResponse([]);
        });

        await braveWebSearch('test', { count: 10, freshness: 'pw' });
    });

    test('clamps count to max 20', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            expect(url).toContain('count=20');
            return braveResponse([]);
        });

        await braveWebSearch('test', { count: 50 });
    });

    test('throws on API error', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async () => new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

        await expect(braveWebSearch('test')).rejects.toThrow('API error: 401 Unauthorized');
    });
});

// ── braveMultiSearch ─────────────────────────────────────────────────────

describe('braveMultiSearch', () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.BRAVE_SEARCH_API_KEY;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalEnv !== undefined) {
            process.env.BRAVE_SEARCH_API_KEY = originalEnv;
        } else {
            delete process.env.BRAVE_SEARCH_API_KEY;
        }
    });

    test('deduplicates results by URL across queries', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (url.includes('q=query+one')) {
                return braveResponse([
                    { title: 'Shared', url: 'https://shared.com', description: 'Shared result' },
                    { title: 'Unique A', url: 'https://a.com', description: 'Only in query one' },
                ]);
            }
            return braveResponse([
                { title: 'Shared Dup', url: 'https://shared.com', description: 'Duplicate' },
                { title: 'Unique B', url: 'https://b.com', description: 'Only in query two' },
            ]);
        });

        const grouped = await braveMultiSearch(['query one', 'query two']);
        expect(grouped).toHaveLength(2);

        // First query keeps both
        expect(grouped[0].results).toHaveLength(2);
        // Second query: shared.com is deduped, only b.com remains
        expect(grouped[1].results).toHaveLength(1);
        expect(grouped[1].results[0].url).toBe('https://b.com');
    });

    test('handles partial failures gracefully', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        let callCount = 0;
        mockFetch(async () => {
            callCount++;
            if (callCount === 1) {
                return braveResponse([{ title: 'OK', url: 'https://ok.com', description: 'Success' }]);
            }
            return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
        });

        const grouped = await braveMultiSearch(['good', 'bad']);
        // Only the successful query should appear
        expect(grouped).toHaveLength(1);
        expect(grouped[0].query).toBe('good');
    });
});

// ── handleWebSearch ──────────────────────────────────────────────────────

describe('handleWebSearch', () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.BRAVE_SEARCH_API_KEY;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalEnv !== undefined) {
            process.env.BRAVE_SEARCH_API_KEY = originalEnv;
        } else {
            delete process.env.BRAVE_SEARCH_API_KEY;
        }
    });

    test('returns error for empty query', async () => {
        const ctx = makeCtx();
        const result = await handleWebSearch(ctx, { query: '' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('query is required');
    });

    test('formats results as numbered markdown', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async () =>
            braveResponse([
                { title: 'Result One', url: 'https://one.com', description: 'First result' },
                { title: 'Result Two', url: 'https://two.com', description: 'Second result', age: '1 day ago' },
            ]),
        );

        const ctx = makeCtx();
        const result = await handleWebSearch(ctx, { query: 'test' });
        expect(result.isError).toBeUndefined();

        const text = getText(result);
        expect(text).toContain('1. **Result One**');
        expect(text).toContain('https://one.com');
        expect(text).toContain('2. **Result Two**');
        expect(text).toContain('(1 day ago)');
    });

    test('emits status messages', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async () => braveResponse([{ title: 'R', url: 'https://r.com', description: 'D' }]));

        const statuses: string[] = [];
        const ctx = makeCtx({ emitStatus: (msg) => statuses.push(msg) });
        await handleWebSearch(ctx, { query: 'test' });

        expect(statuses.length).toBeGreaterThanOrEqual(1);
        expect(statuses[0]).toContain('Searching');
    });

    test('returns no-results message when API key is missing', async () => {
        delete process.env.BRAVE_SEARCH_API_KEY;
        const ctx = makeCtx();
        const result = await handleWebSearch(ctx, { query: 'test' });
        expect(result.isError).toBeUndefined();
        expect(getText(result)).toContain('No results found');
    });
});

// ── handleDeepResearch ───────────────────────────────────────────────────

describe('handleDeepResearch', () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.BRAVE_SEARCH_API_KEY;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalEnv !== undefined) {
            process.env.BRAVE_SEARCH_API_KEY = originalEnv;
        } else {
            delete process.env.BRAVE_SEARCH_API_KEY;
        }
    });

    test('returns error for empty topic', async () => {
        const ctx = makeCtx();
        const result = await handleDeepResearch(ctx, { topic: '' });
        expect(result.isError).toBe(true);
        expect(getText(result)).toContain('topic is required');
    });

    test('generates sub-queries automatically', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        const queries: string[] = [];
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            const parsed = new URL(url);
            queries.push(parsed.searchParams.get('q') ?? '');
            return braveResponse([{ title: 'R', url: `https://r${queries.length}.com`, description: 'Desc' }]);
        });

        const ctx = makeCtx();
        await handleDeepResearch(ctx, { topic: 'TypeScript' });

        // Should have main topic + 4 auto-generated angles = 5 total
        expect(queries).toHaveLength(5);
        expect(queries[0]).toBe('TypeScript');
        expect(queries).toContainEqual('TypeScript benefits');
        expect(queries).toContainEqual('TypeScript challenges');
    });

    test('uses custom sub_questions when provided', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        const queries: string[] = [];
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            const parsed = new URL(url);
            queries.push(parsed.searchParams.get('q') ?? '');
            return braveResponse([{ title: 'R', url: `https://r${queries.length}.com`, description: 'Desc' }]);
        });

        const ctx = makeCtx();
        await handleDeepResearch(ctx, {
            topic: 'Bun runtime',
            sub_questions: ['Bun vs Node', 'Bun performance'],
        });

        expect(queries).toHaveLength(3);
        expect(queries[0]).toBe('Bun runtime');
        expect(queries[1]).toBe('Bun vs Node');
        expect(queries[2]).toBe('Bun performance');
    });

    test('limits to 5 queries total', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        const queries: string[] = [];
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            const parsed = new URL(url);
            queries.push(parsed.searchParams.get('q') ?? '');
            return braveResponse([{ title: 'R', url: `https://r${queries.length}.com`, description: 'Desc' }]);
        });

        const ctx = makeCtx();
        await handleDeepResearch(ctx, {
            topic: 'topic',
            sub_questions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
        });

        // topic + 4 sub_questions = 5 (capped)
        expect(queries).toHaveLength(5);
    });

    test('returns organized sections with headers', async () => {
        process.env.BRAVE_SEARCH_API_KEY = 'test-key';
        mockFetch(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            return braveResponse([
                { title: 'Result', url: `https://r-${encodeURIComponent(new URL(url).searchParams.get('q') ?? '')}.com`, description: 'Desc' },
            ]);
        });

        const ctx = makeCtx();
        const result = await handleDeepResearch(ctx, { topic: 'AI agents' });

        const text = getText(result);
        expect(text).toContain('# Deep Research: AI agents');
        expect(text).toContain('### AI agents');
        expect(text).toContain('deduplicated');
    });
});
