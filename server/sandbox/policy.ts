/**
 * Policy — Per-agent resource limits for sandboxed execution.
 *
 * Looks up agent-specific sandbox configurations from the database,
 * falling back to defaults for unconfigured agents.
 */
import type { Database } from 'bun:sqlite';
import type { ResourceLimits, SandboxConfigRecord } from './types';
import { DEFAULT_RESOURCE_LIMITS } from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('SandboxPolicy');

/**
 * Get resource limits for an agent. Checks the sandbox_configs table
 * for agent-specific overrides, falls back to defaults.
 */
export function getAgentPolicy(db: Database, agentId: string): ResourceLimits {
    const row = db.query(
        'SELECT * FROM sandbox_configs WHERE agent_id = ?',
    ).get(agentId) as SandboxConfigRecord | null;

    if (!row) {
        return { ...DEFAULT_RESOURCE_LIMITS };
    }

    return {
        cpuLimit: row.cpu_limit,
        memoryLimitMb: row.memory_limit_mb,
        networkPolicy: row.network_policy as ResourceLimits['networkPolicy'],
        timeoutSeconds: row.timeout_seconds,
        pidsLimit: DEFAULT_RESOURCE_LIMITS.pidsLimit,
        storageLimitMb: DEFAULT_RESOURCE_LIMITS.storageLimitMb,
    };
}

/**
 * Set custom resource limits for an agent.
 */
export function setAgentPolicy(
    db: Database,
    agentId: string,
    limits: Partial<ResourceLimits>,
): void {
    const merged = { ...DEFAULT_RESOURCE_LIMITS, ...limits };
    const existing = db.query(
        'SELECT id FROM sandbox_configs WHERE agent_id = ?',
    ).get(agentId) as { id: string } | null;

    if (existing) {
        db.query(`
            UPDATE sandbox_configs
            SET cpu_limit = ?, memory_limit_mb = ?, network_policy = ?,
                timeout_seconds = ?, updated_at = datetime('now')
            WHERE agent_id = ?
        `).run(
            merged.cpuLimit,
            merged.memoryLimitMb,
            merged.networkPolicy,
            merged.timeoutSeconds,
            agentId,
        );
    } else {
        const id = crypto.randomUUID();
        db.query(`
            INSERT INTO sandbox_configs (id, agent_id, image, cpu_limit, memory_limit_mb,
                network_policy, timeout_seconds, read_only_mounts, work_dir)
            VALUES (?, ?, 'corvid-agent-sandbox:latest', ?, ?, ?, ?, '[]', NULL)
        `).run(
            id,
            agentId,
            merged.cpuLimit,
            merged.memoryLimitMb,
            merged.networkPolicy,
            merged.timeoutSeconds,
        );
    }

    log.info('Set agent sandbox policy', { agentId, limits: merged });
}

/**
 * Remove custom resource limits for an agent (revert to defaults).
 */
export function removeAgentPolicy(db: Database, agentId: string): boolean {
    const result = db.query('DELETE FROM sandbox_configs WHERE agent_id = ?').run(agentId);
    return result.changes > 0;
}

/**
 * List all agents with custom sandbox policies.
 */
export function listAgentPolicies(db: Database): SandboxConfigRecord[] {
    return db.query(
        'SELECT * FROM sandbox_configs ORDER BY created_at DESC',
    ).all() as SandboxConfigRecord[];
}
