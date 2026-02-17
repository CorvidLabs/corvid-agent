/**
 * Database operations for reputation scores and events.
 * Used by routes that need direct DB access without going through the scorer.
 */
import type { Database } from 'bun:sqlite';
import type { ReputationRecord, ReputationEventRecord } from '../reputation/types';

export function getReputationRecord(db: Database, agentId: string): ReputationRecord | null {
    return db.query(
        'SELECT * FROM agent_reputation WHERE agent_id = ?',
    ).get(agentId) as ReputationRecord | null;
}

export function listReputationRecords(db: Database): ReputationRecord[] {
    return db.query(
        'SELECT * FROM agent_reputation ORDER BY overall_score DESC',
    ).all() as ReputationRecord[];
}

export function getReputationEvents(
    db: Database,
    agentId: string,
    limit: number = 50,
): ReputationEventRecord[] {
    return db.query(
        'SELECT * FROM reputation_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
    ).all(agentId, limit) as ReputationEventRecord[];
}

export function deleteReputationRecord(db: Database, agentId: string): boolean {
    const result = db.query('DELETE FROM agent_reputation WHERE agent_id = ?').run(agentId);
    return result.changes > 0;
}
