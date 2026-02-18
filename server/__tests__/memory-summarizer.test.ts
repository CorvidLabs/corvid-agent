import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { summarizeOldMemories } from '../memory/summarizer';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.run(`CREATE TABLE IF NOT EXISTS agent_memories (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL,
        key         TEXT NOT NULL,
        content     TEXT NOT NULL,
        txid        TEXT DEFAULT NULL,
        status      TEXT DEFAULT 'confirmed',
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now')),
        archived    INTEGER NOT NULL DEFAULT 0
    )`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_agent_key ON agent_memories(agent_id, key)`);
});

function insertMemory(
    agentId: string,
    key: string,
    content: string,
    opts: { daysAgo?: number; archived?: number } = {},
) {
    const { daysAgo = 60, archived = 0 } = opts;
    const id = crypto.randomUUID();
    db.run(
        `INSERT INTO agent_memories (id, agent_id, key, content, updated_at, archived)
         VALUES (?, ?, ?, ?, datetime('now', '-' || ? || ' days'), ?)`,
        [id, agentId, key, content, daysAgo, archived],
    );
    return id;
}

describe('summarizeOldMemories', () => {
    it('archives old memories and creates a summary per category', () => {
        const agent = 'agent-1';
        insertMemory(agent, 'project:alpha', 'Alpha details');
        insertMemory(agent, 'project:beta', 'Beta details');

        const archived = summarizeOldMemories(db, agent);

        expect(archived).toBe(2);

        // Both originals should be archived
        const originals = db.query(
            `SELECT archived FROM agent_memories WHERE agent_id = ? AND key IN ('project:alpha', 'project:beta')`,
        ).all(agent) as { archived: number }[];
        expect(originals.every((r) => r.archived === 1)).toBe(true);

        // A summary memory should have been created
        const summaries = db.query(
            `SELECT key, content FROM agent_memories WHERE agent_id = ? AND key LIKE 'summary:project:%'`,
        ).all(agent) as { key: string; content: string }[];
        expect(summaries.length).toBe(1);
        expect(summaries[0].content).toContain('Alpha details');
        expect(summaries[0].content).toContain('Beta details');
        expect(summaries[0].content).toContain('Summary of 2');
    });

    it('skips groups with only 1 memory', () => {
        const agent = 'agent-2';
        // "project" category gets 2 memories (should be summarized)
        insertMemory(agent, 'project:one', 'One');
        insertMemory(agent, 'project:two', 'Two');
        // "config" category gets only 1 memory (should be skipped)
        insertMemory(agent, 'config:only', 'Sole config');

        const archived = summarizeOldMemories(db, agent);

        // Only the 2 project memories should be archived
        expect(archived).toBe(2);

        // The lone config memory should remain unarchived
        const configRow = db.query(
            `SELECT archived FROM agent_memories WHERE agent_id = ? AND key = 'config:only'`,
        ).get(agent) as { archived: number };
        expect(configRow.archived).toBe(0);
    });

    it('does not archive recent memories', () => {
        const agent = 'agent-3';
        // Insert memories that are only 5 days old (well within the default 30-day threshold)
        insertMemory(agent, 'project:recent1', 'Recent one', { daysAgo: 5 });
        insertMemory(agent, 'project:recent2', 'Recent two', { daysAgo: 5 });

        const archived = summarizeOldMemories(db, agent);

        expect(archived).toBe(0);

        // Both should remain unarchived
        const rows = db.query(
            `SELECT archived FROM agent_memories WHERE agent_id = ?`,
        ).all(agent) as { archived: number }[];
        expect(rows.every((r) => r.archived === 0)).toBe(true);
    });

    it('returns count of archived memories', () => {
        const agent = 'agent-4';
        // 3 memories in "task" category
        insertMemory(agent, 'task:a', 'Task A');
        insertMemory(agent, 'task:b', 'Task B');
        insertMemory(agent, 'task:c', 'Task C');
        // 2 memories in "log" category
        insertMemory(agent, 'log:x', 'Log X');
        insertMemory(agent, 'log:y', 'Log Y');
        // 1 memory in "misc" category (will be skipped)
        insertMemory(agent, 'misc:z', 'Misc Z');

        const archived = summarizeOldMemories(db, agent);

        // 3 (task) + 2 (log) = 5 archived; the lone misc is skipped
        expect(archived).toBe(5);
    });

    it('skips already-archived memories', () => {
        const agent = 'agent-5';
        // Two old memories, but both already archived
        insertMemory(agent, 'project:old1', 'Old one', { archived: 1 });
        insertMemory(agent, 'project:old2', 'Old two', { archived: 1 });

        const archived = summarizeOldMemories(db, agent);

        expect(archived).toBe(0);

        // No summary should have been created
        const summaries = db.query(
            `SELECT id FROM agent_memories WHERE agent_id = ? AND key LIKE 'summary:%'`,
        ).all(agent) as { id: string }[];
        expect(summaries.length).toBe(0);
    });
});
