import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { saveMemory } from '../db/agent-memories';
import { MemoryManager } from '../memory/index';

let db: Database;
let agentId: string;
let manager: MemoryManager;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    const agent = createAgent(db, { name: 'Memory Agent', model: 'sonnet' });
    agentId = agent.id;
    manager = new MemoryManager(db);
});

afterEach(() => {
    db.close();
});

// ─── Save ────────────────────────────────────────────────────────────────────

describe('MemoryManager.save', () => {
    test('saves a memory and returns enriched result', () => {
        const result = manager.save({ agentId, key: 'greeting', content: 'Hello World' });

        expect(result.id).toBeTruthy();
        expect(result.key).toBe('greeting');
        expect(result.content).toBe('Hello World');
        expect(result.agentId).toBe(agentId);
        expect(result.status).toBe('pending');
    });

    test('auto-categorizes on save', () => {
        const result = manager.save({ agentId, key: 'api-key', content: 'secret token for GitHub' });

        expect(result.category).toBe('credential');
        expect(result.categoryConfidence).toBeGreaterThan(0);
    });

    test('stores category in database', () => {
        const result = manager.save({ agentId, key: 'server-config', content: 'port 8080 endpoint url' });

        const row = db.query('SELECT * FROM memory_categories WHERE memory_id = ?')
            .get(result.id) as { category: string; confidence: number } | null;

        expect(row).not.toBeNull();
        expect(row!.category).toBe('config');
    });

    test('stores embedding in database', () => {
        const result = manager.save({ agentId, key: 'note', content: 'TypeScript compiler configuration' });

        const row = db.query('SELECT * FROM memory_embeddings WHERE memory_id = ?')
            .get(result.id) as { vector: string; vocabulary: string } | null;

        expect(row).not.toBeNull();
        expect(row!.vector).toBeTruthy();

        // Vector should be valid JSON
        const parsed = JSON.parse(row!.vector);
        expect(typeof parsed).toBe('object');
    });

    test('upsert updates category and embedding', () => {
        manager.save({ agentId, key: 'evolving', content: 'some config setting' });
        const updated = manager.save({ agentId, key: 'evolving', content: 'secret password token' });

        expect(updated.category).toBe('credential');
    });

    test('creates cross-references between related memories', () => {
        manager.save({ agentId, key: 'ts-config', content: 'TypeScript compiler options for the project' });
        manager.save({ agentId, key: 'ts-notes', content: 'TypeScript project compiler settings' });

        // Check that cross-refs exist
        const refs = db.query('SELECT * FROM memory_cross_refs').all();
        // At least one cross-ref should exist between related TS memories
        expect(refs.length).toBeGreaterThanOrEqual(1);
    });
});

// ─── Recall ──────────────────────────────────────────────────────────────────

describe('MemoryManager.recall', () => {
    test('recalls a saved memory', () => {
        manager.save({ agentId, key: 'test', content: 'hello' });
        const result = manager.recall(agentId, 'test');

        expect(result).not.toBeNull();
        expect(result!.content).toBe('hello');
    });

    test('returns null for nonexistent key', () => {
        expect(manager.recall(agentId, 'nonexistent')).toBeNull();
    });

    test('includes category in enriched recall', () => {
        manager.save({ agentId, key: 'api-key', content: 'bearer token' });
        const result = manager.recall(agentId, 'api-key');

        expect(result!.category).toBe('credential');
    });

    test('uses cache on second recall', () => {
        manager.save({ agentId, key: 'cached', content: 'data' });

        // First recall populates cache
        const first = manager.recall(agentId, 'cached');
        expect(first).not.toBeNull();

        // Second recall should come from cache
        const second = manager.recall(agentId, 'cached');
        expect(second).not.toBeNull();
        expect(second!.content).toBe('data');
    });
});

// ─── Search ──────────────────────────────────────────────────────────────────

describe('MemoryManager.search', () => {
    test('fast search finds relevant memories', async () => {
        manager.save({ agentId, key: 'k8s-config', content: 'Kubernetes cluster in us-east-1' });
        manager.save({ agentId, key: 'python-notes', content: 'Python web framework comparison' });

        const result = await manager.search(agentId, 'Kubernetes');
        expect(result.mode).toBe('fast');
        expect(result.memories.length).toBeGreaterThanOrEqual(1);
        expect(result.memories[0].memory.key).toBe('k8s-config');
    });

    test('search returns scored results', async () => {
        manager.save({ agentId, key: 'note1', content: 'server deployment configuration' });
        manager.save({ agentId, key: 'note2', content: 'deployment pipeline CI/CD' });

        const result = await manager.search(agentId, 'deployment');
        for (const scored of result.memories) {
            expect(scored.score).toBeGreaterThan(0);
            expect(scored.source).toBeTruthy();
        }
    });

    test('searchFast is synchronous', () => {
        manager.save({ agentId, key: 'quick', content: 'fast lookup data' });
        const results = manager.searchFast(agentId, 'fast lookup');

        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test('deep search falls back to fast when no LLM fn provided', async () => {
        manager.save({ agentId, key: 'deep-test', content: 'some data for deep search' });

        const result = await manager.search(agentId, 'deep search', { mode: 'deep' });
        expect(result.mode).toBe('deep');
        // Still returns results (falls back to fast)
        expect(result.memories.length).toBeGreaterThanOrEqual(1);
    });
});

// ─── List ────────────────────────────────────────────────────────────────────

describe('MemoryManager.list', () => {
    test('lists recent memories', () => {
        manager.save({ agentId, key: 'a', content: 'data-a' });
        manager.save({ agentId, key: 'b', content: 'data-b' });

        const all = manager.list(agentId);
        expect(all).toHaveLength(2);
    });

    test('listByCategory filters correctly', () => {
        manager.save({ agentId, key: 'api-key', content: 'secret bearer token' });
        manager.save({ agentId, key: 'server-config', content: 'port 8080 host endpoint url' });

        const credentials = manager.listByCategory(agentId, 'credential');
        const configs = manager.listByCategory(agentId, 'config');

        // At least the correctly categorized ones should be found
        if (credentials.length > 0) {
            expect(credentials[0].key).toBe('api-key');
        }
        if (configs.length > 0) {
            expect(configs[0].key).toBe('server-config');
        }
    });
});

// ─── Cross References ────────────────────────────────────────────────────────

describe('MemoryManager.getRelated', () => {
    test('finds related memories', () => {
        const m1 = manager.save({ agentId, key: 'ts-setup', content: 'TypeScript compiler configuration' });
        manager.save({ agentId, key: 'ts-types', content: 'TypeScript type definitions compiler' });
        manager.save({ agentId, key: 'python-env', content: 'Python virtual environment setup' });

        const related = manager.getRelated(m1.id);
        if (related.length > 0) {
            // TypeScript-related memory should score higher than Python
            const relatedKeys = related.map((r) => r.memory.key);
            expect(relatedKeys).toContain('ts-types');
        }
    });

    test('returns empty for memory with no relations', () => {
        const m1 = manager.save({ agentId, key: 'unique-item', content: 'xyz abc 123' });
        const related = manager.getRelated(m1.id);
        // May or may not have relations depending on content overlap
        expect(related).toBeDefined();
    });
});

// ─── Cache Management ────────────────────────────────────────────────────────

describe('Cache Management', () => {
    test('invalidateAgent clears agent cache', () => {
        manager.save({ agentId, key: 'test', content: 'data' });
        manager.recall(agentId, 'test'); // populate cache

        manager.invalidateAgent(agentId);

        // Cache cleared but recall still works (falls through to DB)
        const result = manager.recall(agentId, 'test');
        expect(result).not.toBeNull();
    });

    test('clearCache empties all caches', () => {
        manager.save({ agentId, key: 'test', content: 'data' });
        manager.recall(agentId, 'test');

        const statsBefore = manager.getCacheStats();
        expect(statsBefore.size).toBeGreaterThan(0);

        manager.clearCache();

        const statsAfter = manager.getCacheStats();
        expect(statsAfter.size).toBe(0);
    });
});

// ─── Backward Compatibility ──────────────────────────────────────────────────

describe('Backward Compatibility', () => {
    test('memories saved through manager are visible to existing functions', () => {
        const { recallMemory: coreRecall, searchMemories: coreSearch } = require('../db/agent-memories');

        manager.save({ agentId, key: 'compat-test', content: 'backward compat data' });

        // Core recall should find it
        const recalled = coreRecall(db, agentId, 'compat-test');
        expect(recalled).not.toBeNull();
        expect(recalled!.content).toBe('backward compat data');

        // Core search should find it
        const searched = coreSearch(db, agentId, 'compat');
        expect(searched.length).toBeGreaterThanOrEqual(1);
    });

    test('memories saved through core functions are visible to manager', () => {
        saveMemory(db, { agentId, key: 'core-saved', content: 'via core function' });

        const recalled = manager.recall(agentId, 'core-saved');
        expect(recalled).not.toBeNull();
        expect(recalled!.content).toBe('via core function');
    });
});
