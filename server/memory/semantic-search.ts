/**
 * Dual-mode semantic search for agent memories.
 *
 * - **fast** (default): FTS5 full-text search + TF-IDF cosine similarity re-ranking.
 *   Pure local, zero API cost, sub-millisecond for typical corpus sizes.
 *
 * - **deep**: Delegates to an LLM reasoning step that evaluates candidate memories
 *   against the query for nuanced relevance. Higher cost but better for ambiguous queries.
 */

import type { Database } from 'bun:sqlite';
import type { AgentMemory } from '../../shared/types';
import { searchMemories } from '../db/agent-memories';
import {
    tokenize,
    IDFCorpus,
    cosineSimilaritySparse,
} from './embeddings';
import { createLogger } from '../lib/logger';

const log = createLogger('SemanticSearch');

export type SearchMode = 'fast' | 'deep';

export interface SearchOptions {
    /** Maximum number of results. Default: 20 */
    limit?: number;
    /** Search mode. Default: 'fast' */
    mode?: SearchMode;
    /** Filter by category (optional). */
    category?: string;
    /** Minimum similarity threshold for vector results (0–1). Default: 0.0 */
    minSimilarity?: number;
}

export interface ScoredMemory {
    memory: AgentMemory;
    score: number;
    /** Which scoring method produced this result. */
    source: 'fts5' | 'tfidf' | 'combined' | 'llm';
}

// ─── Fast Search ─────────────────────────────────────────────────────────────

/**
 * Fast search: FTS5 candidates + hybrid scoring.
 *
 * Scoring strategy:
 * 1. FTS5 retrieval provides initial candidates ordered by rank.
 * 2. Each candidate gets a positional score from FTS5 order (1.0 → 0.1).
 * 3. If the corpus has enough diversity, TF-IDF cosine similarity is blended in.
 * 4. Final score = weighted combination, ensuring all FTS5 matches get a non-zero score.
 */
export function fastSearch(
    db: Database,
    agentId: string,
    query: string,
    opts: SearchOptions = {},
): ScoredMemory[] {
    const limit = opts.limit ?? 20;
    const minSim = opts.minSimilarity ?? 0.0;

    // Step 1: Get FTS5 candidates (broad net)
    const candidates = searchMemories(db, agentId, query);

    if (candidates.length === 0) {
        return [];
    }

    // Step 2: Filter by category if specified
    let filtered = candidates;
    if (opts.category) {
        const catRows = getCategoryMap(db, candidates.map((m) => m.id));
        filtered = candidates.filter((m) => catRows.get(m.id) === opts.category);
        if (filtered.length === 0) {
            // If category filter eliminates everything, fall back to unfiltered
            filtered = candidates;
        }
    }

    // Step 3: Compute hybrid scores
    const queryTokens = tokenize(query);

    // Build TF-IDF corpus from candidates only (not the query)
    const corpus = new IDFCorpus();
    const docTokensMap = new Map<string, string[]>();
    for (const mem of filtered) {
        const tokens = tokenize(`${mem.key} ${mem.content}`);
        docTokensMap.set(mem.id, tokens);
        corpus.addDocument(tokens);
    }

    const queryVector = corpus.tfidfVector(queryTokens);

    // Check if TF-IDF produced non-zero query vector
    let hasNonZeroTfidf = false;
    for (const [, val] of queryVector) {
        if (val > 0) { hasNonZeroTfidf = true; break; }
    }

    const scored: ScoredMemory[] = [];
    const totalCandidates = filtered.length;

    for (let i = 0; i < filtered.length; i++) {
        const mem = filtered[i];

        // Positional score from FTS5 ordering (ranked results come first)
        // Linear decay from 1.0 to 0.1 based on position
        const fts5Score = 1.0 - (i / Math.max(totalCandidates, 2)) * 0.9;

        let tfidfScore = 0;
        if (hasNonZeroTfidf) {
            const docTokens = docTokensMap.get(mem.id) ?? [];
            const docVector = corpus.tfidfVector(docTokens);
            tfidfScore = cosineSimilaritySparse(queryVector, docVector);
        }

        // Blend: when TF-IDF works, weight it 60/40 with FTS5 rank.
        // When TF-IDF zeroes out (all docs share query terms), use FTS5 rank alone.
        const score = hasNonZeroTfidf
            ? 0.4 * fts5Score + 0.6 * tfidfScore
            : fts5Score;

        if (score >= minSim) {
            scored.push({
                memory: mem,
                score,
                source: hasNonZeroTfidf ? 'combined' : 'fts5',
            });
        }
    }

    // Sort by score descending, take top limit
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}

// ─── Deep Search ─────────────────────────────────────────────────────────────

/**
 * Deep search callback type.
 *
 * The MemoryManager injects an LLM reasoning function here.
 * It receives the query and candidate memories, and returns
 * re-ranked results with LLM-assigned relevance scores.
 */
export type DeepSearchFn = (
    query: string,
    candidates: AgentMemory[],
    limit: number,
) => Promise<ScoredMemory[]>;

/**
 * Deep search: uses fast search to get candidates, then (optionally)
 * delegates to an LLM for nuanced re-ranking.
 *
 * If no deepSearchFn is provided, falls back to fast search.
 */
export async function deepSearch(
    db: Database,
    agentId: string,
    query: string,
    opts: SearchOptions = {},
    deepSearchFn?: DeepSearchFn,
): Promise<ScoredMemory[]> {
    const limit = opts.limit ?? 20;

    // Get broad candidates via fast search (3x limit for LLM to filter)
    const candidates = fastSearch(db, agentId, query, {
        ...opts,
        limit: Math.min(limit * 3, 60),
        minSimilarity: 0,
    });

    if (candidates.length === 0) {
        return [];
    }

    if (!deepSearchFn) {
        log.debug('No deep search function provided, falling back to fast search results');
        return candidates.slice(0, limit);
    }

    try {
        const reranked = await deepSearchFn(
            query,
            candidates.map((c) => c.memory),
            limit,
        );
        return reranked;
    } catch (err) {
        log.warn('Deep search LLM re-ranking failed, falling back to fast results', {
            error: err instanceof Error ? err.message : String(err),
        });
        return candidates.slice(0, limit);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get category assignments for a set of memory IDs.
 */
function getCategoryMap(db: Database, memoryIds: string[]): Map<string, string> {
    const map = new Map<string, string>();
    if (memoryIds.length === 0) return map;

    try {
        const placeholders = memoryIds.map(() => '?').join(',');
        const rows = db.query(
            `SELECT memory_id, category FROM memory_categories WHERE memory_id IN (${placeholders})`
        ).all(...memoryIds) as Array<{ memory_id: string; category: string }>;

        for (const row of rows) {
            map.set(row.memory_id, row.category);
        }
    } catch {
        // memory_categories table may not exist yet
    }

    return map;
}

/**
 * Perform a unified search dispatching to fast or deep mode.
 */
export async function search(
    db: Database,
    agentId: string,
    query: string,
    opts: SearchOptions = {},
    deepSearchFn?: DeepSearchFn,
): Promise<ScoredMemory[]> {
    const mode = opts.mode ?? 'fast';

    if (mode === 'deep') {
        return deepSearch(db, agentId, query, opts, deepSearchFn);
    }

    return fastSearch(db, agentId, query, opts);
}
