/**
 * Database operations for sandbox configurations.
 */
import type { Database } from 'bun:sqlite';
import type { SandboxConfigRecord } from '../sandbox/types';

export function getSandboxConfig(db: Database, agentId: string): SandboxConfigRecord | null {
    return db.query(
        'SELECT * FROM sandbox_configs WHERE agent_id = ?',
    ).get(agentId) as SandboxConfigRecord | null;
}

export function listSandboxConfigs(db: Database): SandboxConfigRecord[] {
    return db.query(
        'SELECT * FROM sandbox_configs ORDER BY created_at DESC',
    ).all() as SandboxConfigRecord[];
}

export function deleteSandboxConfig(db: Database, agentId: string): boolean {
    const result = db.query('DELETE FROM sandbox_configs WHERE agent_id = ?').run(agentId);
    return result.changes > 0;
}
