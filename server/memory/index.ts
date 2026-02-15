/**
 * MemoryManager — unified interface for the structured memory system.
 *
 * Wraps the existing agent-memories CRUD with:
 * - Auto-categorization on save
 * - TF-IDF embedding generation
 * - LRU caching for hot-path reads
 * - Dual-mode semantic search (fast / deep)
 * - Cross-reference tracking between related memories
 *
 * Backward compatible: all existing memory operations continue to work
 * unchanged. The new capabilities are additive.
 */

import type { Database } from 'bun:sqlite';
import type { AgentMemory } from '../../shared/types';
import {
    saveMemory,
    recallMemory,
    listMemories,
} from '../db/agent-memories';
import { ensureMemorySchema } from './schema';
import { LRUCache } from './cache';
import type { LRUCacheOptions } from './cache';
import { categorize } from './categories';
import type { MemoryCategory, CategoryResult } from './categories';
import { tokenize, IDFCorpus } from './embeddings';
import {
    search as semanticSearch,
    fastSearch,
} from './semantic-search';
import type {
    SearchMode,
    SearchOptions,
    ScoredMemory,
    DeepSearchFn,
} from './semantic-search';
import { createLogger } from '../lib/logger';

const log = createLogger('MemoryManager');

export interface MemoryManagerOptions {
    /** LRU cache settings. */
    cache?: LRUCacheOptions;
    /** Deep search LLM callback (optional). Without it, deep mode falls back to fast. */
    deepSearchFn?: DeepSearchFn;
}

export interface EnrichedMemory extends AgentMemory {
    category?: MemoryCategory;
    categoryConfidence?: number;
}

export interface SearchResult {
    memories: ScoredMemory[];
    mode: SearchMode;
    totalCandidates: number;
}

/**
 * Build a cache key for a memory lookup.
 */
function cacheKey(agentId: string, key: string): string {
    return `${agentId}:${key}`;
}

export class MemoryManager {
    private readonly db: Database;
    private readonly cache: LRUCache<AgentMemory>;
    private readonly corpora = new Map<string, IDFCorpus>();
    private deepSearchFn?: DeepSearchFn;
    private schemaReady = false;

    constructor(db: Database, opts: MemoryManagerOptions = {}) {
        this.db = db;
        this.cache = new LRUCache<AgentMemory>(opts.cache);
        this.deepSearchFn = opts.deepSearchFn;
    }

    // ─── Schema ──────────────────────────────────────────────────────────────

    /** Ensure memory extension tables exist. Idempotent. */
    private ensureSchema(): void {
        if (this.schemaReady) return;
        try {
            ensureMemorySchema(this.db);
            this.schemaReady = true;
        } catch (err) {
            log.warn('Failed to ensure memory schema', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // ─── Save ────────────────────────────────────────────────────────────────

    /**
     * Save a memory with automatic categorization and embedding generation.
     *
     * Backward compatible: delegates to the existing `saveMemory` function,
     * then enriches with category and embedding metadata.
     */
    save(params: { agentId: string; key: string; content: string }): EnrichedMemory {
        this.ensureSchema();

        // Delegate to existing save (handles upsert, status reset, etc.)
        const memory = saveMemory(this.db, params);

        // Update cache
        this.cache.set(cacheKey(params.agentId, params.key), memory);

        // Auto-categorize
        const cat = this.categorizeAndStore(memory);

        // Update embedding
        this.updateEmbedding(memory);

        // Update cross-references
        this.updateCrossRefs(memory);

        return {
            ...memory,
            category: cat.category,
            categoryConfidence: cat.confidence,
        };
    }

    // ─── Recall ──────────────────────────────────────────────────────────────

    /**
     * Recall a memory by key with cache acceleration.
     */
    recall(agentId: string, key: string): EnrichedMemory | null {
        // Check cache first
        const cached = this.cache.get(cacheKey(agentId, key));
        if (cached) {
            const cat = this.getCategory(cached.id);
            return { ...cached, ...cat };
        }

        const memory = recallMemory(this.db, agentId, key);
        if (!memory) return null;

        // Populate cache
        this.cache.set(cacheKey(agentId, key), memory);

        const cat = this.getCategory(memory.id);
        return { ...memory, ...cat };
    }

    // ─── Search ──────────────────────────────────────────────────────────────

    /**
     * Search memories with dual-mode support.
     *
     * @param mode - 'fast' (default) uses FTS5 + TF-IDF. 'deep' adds LLM reasoning.
     */
    async search(
        agentId: string,
        query: string,
        opts: SearchOptions = {},
    ): Promise<SearchResult> {
        this.ensureSchema();

        const mode = opts.mode ?? 'fast';

        const memories = await semanticSearch(
            this.db,
            agentId,
            query,
            opts,
            this.deepSearchFn,
        );

        return {
            memories,
            mode,
            totalCandidates: memories.length,
        };
    }

    /**
     * Fast synchronous search (for contexts where async is not available).
     */
    searchFast(
        agentId: string,
        query: string,
        opts: Omit<SearchOptions, 'mode'> = {},
    ): ScoredMemory[] {
        this.ensureSchema();
        return fastSearch(this.db, agentId, query, { ...opts, mode: 'fast' });
    }

    // ─── List ────────────────────────────────────────────────────────────────

    /**
     * List recent memories (backward compatible).
     */
    list(agentId: string): AgentMemory[] {
        return listMemories(this.db, agentId);
    }

    /**
     * List memories filtered by category.
     */
    listByCategory(agentId: string, category: MemoryCategory): AgentMemory[] {
        this.ensureSchema();

        try {
            const rows = this.db.query(
                `SELECT m.* FROM agent_memories m
                 JOIN memory_categories mc ON mc.memory_id = m.id
                 WHERE m.agent_id = ? AND mc.category = ?
                 ORDER BY m.updated_at DESC
                 LIMIT 20`
            ).all(agentId, category) as AgentMemoryRow[];

            return rows.map(rowToAgentMemory);
        } catch {
            // Table may not exist
            return [];
        }
    }

    // ─── Cross References ────────────────────────────────────────────────────

    /**
     * Get memories related to a given memory.
     */
    getRelated(memoryId: string, limit = 5): Array<{ memory: AgentMemory; score: number }> {
        this.ensureSchema();

        try {
            const rows = this.db.query(
                `SELECT m.*, cr.score
                 FROM memory_cross_refs cr
                 JOIN agent_memories m ON m.id = cr.target_id
                 WHERE cr.source_id = ?
                 ORDER BY cr.score DESC
                 LIMIT ?`
            ).all(memoryId, limit) as (AgentMemoryRow & { score: number })[];

            return rows.map((row) => ({
                memory: rowToAgentMemory(row),
                score: row.score,
            }));
        } catch {
            return [];
        }
    }

    // ─── Cache Management ────────────────────────────────────────────────────

    /** Invalidate cache for an agent (e.g. after bulk operations). */
    invalidateAgent(agentId: string): void {
        this.cache.invalidatePrefix(`${agentId}:`);
    }

    /** Clear all caches. */
    clearCache(): void {
        this.cache.clear();
        this.corpora.clear();
    }

    /** Get cache stats. */
    getCacheStats(): { size: number } {
        return { size: this.cache.size };
    }

    // ─── Deep Search Configuration ───────────────────────────────────────────

    /** Set or update the deep search LLM callback. */
    setDeepSearchFn(fn: DeepSearchFn): void {
        this.deepSearchFn = fn;
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    private categorizeAndStore(memory: AgentMemory): CategoryResult {
        const result = categorize(memory.key, memory.content);

        try {
            this.db.query(
                `INSERT INTO memory_categories (memory_id, category, confidence)
                 VALUES (?, ?, ?)
                 ON CONFLICT(memory_id) DO UPDATE SET
                     category = excluded.category,
                     confidence = excluded.confidence,
                     updated_at = datetime('now')`
            ).run(memory.id, result.category, result.confidence);
        } catch (err) {
            log.debug('Failed to store category', {
                memoryId: memory.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return result;
    }

    private getCategory(memoryId: string): { category?: MemoryCategory; categoryConfidence?: number } {
        try {
            const row = this.db.query(
                'SELECT category, confidence FROM memory_categories WHERE memory_id = ?'
            ).get(memoryId) as { category: string; confidence: number } | null;

            if (row) {
                return {
                    category: row.category as MemoryCategory,
                    categoryConfidence: row.confidence,
                };
            }
        } catch {
            // Table may not exist
        }
        return {};
    }

    private getOrCreateCorpus(agentId: string): IDFCorpus {
        let corpus = this.corpora.get(agentId);
        if (corpus) return corpus;

        corpus = new IDFCorpus();
        this.corpora.set(agentId, corpus);

        // Bootstrap corpus from existing memories
        try {
            const memories = this.db.query(
                'SELECT key, content FROM agent_memories WHERE agent_id = ?'
            ).all(agentId) as Array<{ key: string; content: string }>;

            for (const m of memories) {
                corpus.addDocument(tokenize(`${m.key} ${m.content}`));
            }
        } catch {
            // OK — corpus starts empty
        }

        return corpus;
    }

    private updateEmbedding(memory: AgentMemory): void {
        try {
            const corpus = this.getOrCreateCorpus(memory.agentId);
            const tokens = tokenize(`${memory.key} ${memory.content}`);
            corpus.addDocument(tokens);

            const vector = corpus.tfidfVector(tokens);
            const vectorObj = Object.fromEntries(vector);

            this.db.query(
                `INSERT INTO memory_embeddings (memory_id, vector, vocabulary)
                 VALUES (?, ?, ?)
                 ON CONFLICT(memory_id) DO UPDATE SET
                     vector = excluded.vector,
                     vocabulary = excluded.vocabulary,
                     updated_at = datetime('now')`
            ).run(
                memory.id,
                JSON.stringify(vectorObj),
                tokens.slice(0, 50).join(','),
            );
        } catch (err) {
            log.debug('Failed to store embedding', {
                memoryId: memory.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private updateCrossRefs(memory: AgentMemory): void {
        try {
            const tokens = tokenize(`${memory.key} ${memory.content}`);
            const tokenSet = new Set(tokens);

            // Get other memories for the agent
            const others = this.db.query(
                `SELECT m.id, m.key, m.content FROM agent_memories m
                 WHERE m.agent_id = ? AND m.id != ?
                 ORDER BY m.updated_at DESC
                 LIMIT 50`
            ).all(memory.agentId, memory.id) as Array<{ id: string; key: string; content: string }>;

            // Compute Jaccard similarity (token overlap) for cross-references.
            // This is more robust than TF-IDF cosine for small corpora where
            // shared terms can have zero IDF.
            const refs: Array<{ targetId: string; score: number }> = [];
            for (const other of others) {
                const otherTokens = tokenize(`${other.key} ${other.content}`);
                const otherSet = new Set(otherTokens);

                // Jaccard: |intersection| / |union|
                let intersection = 0;
                for (const t of tokenSet) {
                    if (otherSet.has(t)) intersection++;
                }
                const union = tokenSet.size + otherSet.size - intersection;
                const score = union === 0 ? 0 : intersection / union;

                if (score > 0.05) {
                    refs.push({ targetId: other.id, score });
                }
            }

            // Keep top 10 cross-refs
            refs.sort((a, b) => b.score - a.score);
            const topRefs = refs.slice(0, 10);

            // Clear existing refs for this source
            this.db.query('DELETE FROM memory_cross_refs WHERE source_id = ?').run(memory.id);

            // Insert new refs
            const insertStmt = this.db.query(
                'INSERT OR REPLACE INTO memory_cross_refs (source_id, target_id, score) VALUES (?, ?, ?)'
            );
            for (const ref of topRefs) {
                insertStmt.run(memory.id, ref.targetId, ref.score);
            }
        } catch (err) {
            log.debug('Failed to update cross-refs', {
                memoryId: memory.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

// ─── Row mapping (duplicated from agent-memories to avoid circular deps) ─────

interface AgentMemoryRow {
    id: string;
    agent_id: string;
    key: string;
    content: string;
    txid: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

function rowToAgentMemory(row: AgentMemoryRow): AgentMemory {
    return {
        id: row.id,
        agentId: row.agent_id,
        key: row.key,
        content: row.content,
        txid: row.txid,
        status: row.status as AgentMemory['status'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ─── Re-exports for convenience ──────────────────────────────────────────────

export type { SearchMode, SearchOptions, ScoredMemory, DeepSearchFn } from './semantic-search';
export type { MemoryCategory, CategoryResult } from './categories';
export type { LRUCacheOptions } from './cache';
export { LRUCache } from './cache';
export { categorize, allCategories } from './categories';
export { tokenize, IDFCorpus, cosineSimilaritySparse, cosineSimilarityDense } from './embeddings';
export { fastSearch, deepSearch } from './semantic-search';
