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
import { ExternalServiceError, ValidationError } from '../lib/errors';

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
        throw new ExternalServiceError("A2A", `Failed to fetch Agent Card from ${agentCardUrl}: HTTP ${response.status} ${response.statusText}`);
    }

    const card = await response.json() as A2AAgentCard;

    // Basic validation
    if (!card.name || !card.version) {
        throw new ValidationError(`Invalid Agent Card from ${agentCardUrl}: missing required fields (name, version)`);
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

// ---------------------------------------------------------------------------
// Remote Agent Invocation (A2A tasks/send)
// ---------------------------------------------------------------------------

export interface RemoteInvocationResult {
    success: boolean;
    taskId: string;
    responseText: string | null;
    error: string | null;
}

/**
 * Invoke a remote A2A agent by POSTing to /a2a/tasks/send
 * and polling /a2a/tasks/:id until completed or timed out.
 */
export async function invokeRemoteAgent(
    baseUrl: string,
    message: string,
    options: { skill?: string; timeoutMs?: number } = {},
): Promise<RemoteInvocationResult> {
    const normalizedUrl = baseUrl.replace(/\/+$/, '');
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

    log.info('Invoking remote agent', { url: normalizedUrl, messagePreview: message.slice(0, 80) });

    // Step 1: Submit the task
    const submitResponse = await fetch(`${normalizedUrl}/a2a/tasks/send`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CorvidAgent/A2A-Client',
        },
        body: JSON.stringify({
            params: {
                message,
                skill: options.skill,
                timeoutMs,
            },
        }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!submitResponse.ok) {
        const errorText = await submitResponse.text().catch(() => 'unknown');
        return {
            success: false,
            taskId: '',
            responseText: null,
            error: `Submit failed: HTTP ${submitResponse.status} — ${errorText}`,
        };
    }

    const task = await submitResponse.json() as { id: string; state: string };
    const taskId = task.id;

    // Step 2: Poll until completed/failed/timeout
    const deadline = Date.now() + timeoutMs;
    const pollIntervalMs = 3000;

    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        try {
            const pollResponse = await fetch(`${normalizedUrl}/a2a/tasks/${taskId}`, {
                headers: { 'User-Agent': 'CorvidAgent/A2A-Client' },
                signal: AbortSignal.timeout(10_000),
            });

            if (!pollResponse.ok) continue;

            const pollResult = await pollResponse.json() as {
                id: string;
                state: string;
                messages?: Array<{ role: string; parts: Array<{ text: string }> }>;
            };

            if (pollResult.state === 'completed' || pollResult.state === 'failed') {
                // Extract the last agent message
                const agentMessages = (pollResult.messages ?? []).filter((m) => m.role === 'agent');
                const lastMessage = agentMessages[agentMessages.length - 1];
                const responseText = lastMessage?.parts?.[0]?.text ?? null;

                return {
                    success: pollResult.state === 'completed',
                    taskId,
                    responseText,
                    error: pollResult.state === 'failed' ? (responseText ?? 'Task failed') : null,
                };
            }
        } catch {
            // Poll failed — retry
        }
    }

    return {
        success: false,
        taskId,
        responseText: null,
        error: `Timed out after ${timeoutMs}ms`,
    };
}
