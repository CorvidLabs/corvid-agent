/**
 * Memory summarization — compresses old memories into category summaries.
 *
 * Groups unarchived memories older than a threshold by their key prefix
 * (as a proxy for category), creates a summary memory per group,
 * and archives the originals.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('MemorySummarizer');

interface MemoryRow {
    id: string;
    agent_id: string;
    key: string;
    content: string;
    updated_at: string;
}

/**
 * Extract a category from a memory key.
 * Uses the first colon-delimited segment, or 'general' if no colon.
 */
function extractCategory(key: string): string {
    const colonIdx = key.indexOf(':');
    return colonIdx > 0 ? key.slice(0, colonIdx) : 'general';
}

/**
 * Summarize old memories for an agent.
 *
 * 1. Finds unarchived memories older than `olderThanDays`
 * 2. Groups them by category (key prefix before first colon)
 * 3. Creates a summary memory per category
 * 4. Archives the originals (sets archived = 1)
 *
 * Returns the number of memories archived.
 */
export function summarizeOldMemories(
    db: Database,
    agentId: string,
    olderThanDays: number = 30,
): number {
    // Find old unarchived memories
    const rows = db.query(`
        SELECT id, agent_id, key, content, updated_at
        FROM agent_memories
        WHERE agent_id = ?
          AND archived = 0
          AND updated_at < datetime('now', '-' || ? || ' days')
        ORDER BY updated_at ASC
    `).all(agentId, olderThanDays) as MemoryRow[];

    if (rows.length === 0) {
        log.debug('No old memories to summarize', { agentId, olderThanDays });
        return 0;
    }

    // Group by category
    const groups = new Map<string, MemoryRow[]>();
    for (const row of rows) {
        const category = extractCategory(row.key);
        const existing = groups.get(category) ?? [];
        existing.push(row);
        groups.set(category, existing);
    }

    let archivedCount = 0;
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    for (const [category, memories] of groups) {
        // Skip groups with only 1 memory — not worth summarizing
        if (memories.length < 2) continue;

        // Build summary content from all memories in the group
        const summaryLines = memories.map((m) => {
            const snippet = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content;
            return `- [${m.key}] ${snippet}`;
        });

        const summaryContent =
            `Summary of ${memories.length} "${category}" memories (archived ${now}):\n` +
            summaryLines.join('\n');

        const summaryKey = `summary:${category}:${now}`;

        // Insert summary memory (upsert)
        const summaryId = crypto.randomUUID();
        db.query(`
            INSERT INTO agent_memories (id, agent_id, key, content, status, archived)
            VALUES (?, ?, ?, ?, 'confirmed', 0)
            ON CONFLICT(agent_id, key) DO UPDATE SET
                content = excluded.content,
                updated_at = datetime('now')
        `).run(summaryId, agentId, summaryKey, summaryContent);

        // Archive originals
        const ids = memories.map((m) => m.id);
        const placeholders = ids.map(() => '?').join(',');
        db.query(
            `UPDATE agent_memories SET archived = 1 WHERE id IN (${placeholders})`,
        ).run(...ids);

        archivedCount += memories.length;

        log.info('Summarized memory group', {
            agentId,
            category,
            memoriesArchived: memories.length,
            summaryKey,
        });
    }

    return archivedCount;
}
