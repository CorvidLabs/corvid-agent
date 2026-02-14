import { createLogger } from './logger';

const log = createLogger('WebSearch');

export interface WebSearchResult {
    title: string;
    url: string;
    description: string;
    age?: string;
}

export interface WebSearchOptions {
    /** Number of results to return (default 5, max 20). */
    count?: number;
    /** Freshness filter: pd (past day), pw (past week), pm (past month), py (past year). */
    freshness?: 'pd' | 'pw' | 'pm' | 'py';
}

interface BraveSearchResponse {
    web?: {
        results?: Array<{
            title: string;
            url: string;
            description: string;
            age?: string;
        }>;
    };
    query?: { original: string };
}

/**
 * Search the web using Brave Search API.
 * Returns an empty array with a logged warning if BRAVE_SEARCH_API_KEY is not set.
 */
export async function braveWebSearch(
    query: string,
    options?: WebSearchOptions,
): Promise<WebSearchResult[]> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
        log.warn('BRAVE_SEARCH_API_KEY not set — web search unavailable');
        return [];
    }

    const count = Math.min(Math.max(options?.count ?? 5, 1), 20);
    const params = new URLSearchParams({
        q: query,
        count: String(count),
    });
    if (options?.freshness) {
        params.set('freshness', options.freshness);
    }

    const url = `https://api.search.brave.com/res/v1/web/search?${params}`;

    log.info('Brave search request', { query, count, freshness: options?.freshness });

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
        },
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        log.error('Brave search API error', { status: response.status, body: body.slice(0, 200) });
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as BraveSearchResponse;
    const results: WebSearchResult[] = (data.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
        age: r.age,
    }));

    log.info('Brave search completed', { query, resultCount: results.length });
    return results;
}

/**
 * Run multiple searches concurrently and deduplicate results by URL.
 */
export async function braveMultiSearch(
    queries: string[],
    options?: WebSearchOptions,
): Promise<{ query: string; results: WebSearchResult[] }[]> {
    const settled = await Promise.allSettled(
        queries.map((q) => braveWebSearch(q, options).then((results) => ({ query: q, results }))),
    );

    const seenUrls = new Set<string>();
    const output: { query: string; results: WebSearchResult[] }[] = [];

    for (const entry of settled) {
        if (entry.status === 'fulfilled') {
            const deduped = entry.value.results.filter((r) => {
                if (seenUrls.has(r.url)) return false;
                seenUrls.add(r.url);
                return true;
            });
            output.push({ query: entry.value.query, results: deduped });
        } else {
            log.warn('Multi-search query failed', { reason: String(entry.reason) });
        }
    }

    return output;
}
