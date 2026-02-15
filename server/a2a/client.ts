/**
 * A2A Protocol client — fetches Agent Cards from remote agents.
 *
 * Supports:
 * - fetchAgentCard(baseUrl) — fetch a remote agent's A2A Agent Card
 * - discoverAgent(baseUrl) — safe wrapper that returns null on failure
 * - In-memory caching with 5-minute TTL
 */

import type { A2AAgentCard } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('A2AClient');

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
    card: A2AAgentCard;
    fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/** Clear expired cache entries. */
function pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of cache) {
        if (now - entry.fetchedAt > CACHE_TTL_MS) {
            cache.delete(key);
        }
    }
}

/** Get a cached entry if still valid. */
function getCached(url: string): A2AAgentCard | null {
    const entry = cache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
        cache.delete(url);
        return null;
    }
    return entry.card;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch an A2A Agent Card from a remote agent.
 *
 * @param baseUrl - The base URL of the remote agent (e.g. "https://agent.example.com")
 * @returns The agent card
 * @throws If the fetch fails or the response is not valid JSON
 */
export async function fetchAgentCard(baseUrl: string): Promise<A2AAgentCard> {
    // Normalize URL
    const normalizedUrl = baseUrl.replace(/\/+$/, '');
    const agentCardUrl = `${normalizedUrl}/.well-known/agent-card.json`;

    // Check cache first
    const cached = getCached(agentCardUrl);
    if (cached) {
        log.debug('A2A Agent Card cache hit', { url: agentCardUrl });
        return cached;
    }

    log.info('Fetching A2A Agent Card', { url: agentCardUrl });

    const response = await fetch(agentCardUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'CorvidAgent/A2A-Client',
        },
        signal: AbortSignal.timeout(10_000), // 10 second timeout
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Agent Card from ${agentCardUrl}: HTTP ${response.status} ${response.statusText}`);
    }

    const card = await response.json() as A2AAgentCard;

    // Basic validation
    if (!card.name || !card.version) {
        throw new Error(`Invalid Agent Card from ${agentCardUrl}: missing required fields (name, version)`);
    }

    // Cache the result
    pruneCache();
    cache.set(agentCardUrl, { card, fetchedAt: Date.now() });

    log.info('Fetched A2A Agent Card', {
        url: agentCardUrl,
        agentName: card.name,
        version: card.version,
        skills: card.skills?.length ?? 0,
    });

    return card;
}

/**
 * Safe wrapper around fetchAgentCard that returns null on failure.
 *
 * Use this when discovery failure should not be an error
 * (e.g. when probing whether a URL supports A2A).
 */
export async function discoverAgent(baseUrl: string): Promise<A2AAgentCard | null> {
    try {
        return await fetchAgentCard(baseUrl);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.debug('A2A agent discovery failed', { url: baseUrl, error: message });
        return null;
    }
}

/**
 * Clear the agent card cache (useful for testing).
 */
export function clearAgentCardCache(): void {
    cache.clear();
}
