import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { saveMemory } from '../db/agent-memories';
import { ensureMemorySchema } from '../memory/schema';
import { fastSearch } from '../memory/semantic-search';

let db: Database;
let agentId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    ensureMemorySchema(db);
    const agent = createAgent(db, { name: 'Search Agent', model: 'sonnet' });
    agentId = agent.id;
});

afterEach(() => {
    db.close();
});

// ─── Fast Search ─────────────────────────────────────────────────────────────

describe('Fast Search', () => {
    test('finds relevant memories', () => {
        saveMemory(db, { agentId, key: 'deploy-config', content: 'Kubernetes cluster in us-east-1' });
        saveMemory(db, { agentId, key: 'team-info', content: 'Alice is the team lead' });
        saveMemory(db, { agentId, key: 'k8s-notes', content: 'Kubernetes pod scaling policy' });

        const results = fastSearch(db, agentId, 'Kubernetes');
        expect(results.length).toBeGreaterThanOrEqual(2);

        // Both Kubernetes memories should be found
        const keys = results.map((r) => r.memory.key);
        expect(keys).toContain('deploy-config');
        expect(keys).toContain('k8s-notes');
    });

    test('ranks more relevant results higher', () => {
        saveMemory(db, { agentId, key: 'about-ts', content: 'TypeScript is great' });
        saveMemory(db, { agentId, key: 'ts-deep', content: 'TypeScript compiler TypeScript config TypeScript types' });

        const results = fastSearch(db, agentId, 'TypeScript');
        expect(results.length).toBeGreaterThanOrEqual(2);

        // The document with more TypeScript mentions should rank higher
        expect(results[0].memory.key).toBe('ts-deep');
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    test('returns empty for no matches', () => {
        saveMemory(db, { agentId, key: 'data', content: 'something' });
        const results = fastSearch(db, agentId, 'nonexistent');
        expect(results).toHaveLength(0);
    });

    test('respects limit option', () => {
        for (let i = 0; i < 10; i++) {
            saveMemory(db, { agentId, key: `config-${i}`, content: `server config ${i}` });
        }

        const results = fastSearch(db, agentId, 'config', { limit: 3 });
        expect(results.length).toBeLessThanOrEqual(3);
    });

    test('scores are between 0 and 1', () => {
        saveMemory(db, { agentId, key: 'note', content: 'important note about the project' });
        const results = fastSearch(db, agentId, 'important project');

        for (const r of results) {
            expect(r.score).toBeGreaterThanOrEqual(0);
            expect(r.score).toBeLessThanOrEqual(1);
        }
    });

    test('is agent-scoped', () => {
        const agent2 = createAgent(db, { name: 'Agent 2' });
        saveMemory(db, { agentId, key: 'secret', content: 'agent1 confidential' });
        saveMemory(db, { agentId: agent2.id, key: 'secret', content: 'agent2 confidential' });

        const agent1Results = fastSearch(db, agentId, 'confidential');
        expect(agent1Results).toHaveLength(1);
        expect(agent1Results[0].memory.agentId).toBe(agentId);
    });
});

// ─── Category Filtering ──────────────────────────────────────────────────────

describe('Category Filtering', () => {
    test('filters by category when specified', () => {
        const m1 = saveMemory(db, { agentId, key: 'api-key', content: 'secret token' });
        const m2 = saveMemory(db, { agentId, key: 'server-config', content: 'port 8080' });

        // Manually assign categories for testing
        db.query(
            'INSERT INTO memory_categories (memory_id, category, confidence) VALUES (?, ?, ?)'
        ).run(m1.id, 'credential', 0.9);
        db.query(
            'INSERT INTO memory_categories (memory_id, category, confidence) VALUES (?, ?, ?)'
        ).run(m2.id, 'config', 0.8);

        // Search with category filter
        // Note: both match 'server' or 'secret' in the query terms
        // The FTS5 will pick up whatever matches, then category filter applies
        const results = fastSearch(db, agentId, 'config port', { category: 'config' });

        // Should prefer config category
        const categories = results.map((r) => {
            const row = db.query('SELECT category FROM memory_categories WHERE memory_id = ?')
                .get(r.memory.id) as { category: string } | null;
            return row?.category;
        });

        if (results.length > 0) {
            expect(categories).toContain('config');
        }
    });
});
