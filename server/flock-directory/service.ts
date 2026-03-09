/**
 * FlockDirectoryService — Agent registry for the Flock Directory.
 *
 * Manages agent registration, discovery, heartbeat tracking,
 * and reputation aggregation for the on-chain agent registry.
 */
import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { queryCount } from '../db/types';
import type {
    FlockAgent,
    FlockDirectorySearchParams,
    FlockDirectorySearchResult,
} from '../../shared/types/flock-directory';
import type {
    FlockAgentRecord,
    RegisterFlockAgentInput,
    UpdateFlockAgentInput,
} from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('FlockDirectory');

// ─── Row Mapper ─────────────────────────────────────────────────────────────

function recordToAgent(row: FlockAgentRecord): FlockAgent {
    return {
        id: row.id,
        address: row.address,
        name: row.name,
        description: row.description,
        instanceUrl: row.instance_url,
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
        status: row.status as FlockAgent['status'],
        reputationScore: row.reputation_score,
        attestationCount: row.attestation_count,
        councilParticipations: row.council_participations,
        uptimePct: row.uptime_pct,
        lastHeartbeat: row.last_heartbeat,
        registeredAt: row.registered_at,
        updatedAt: row.updated_at,
    };
}

// ─── Service ────────────────────────────────────────────────────────────────

/** Stale threshold: agents without heartbeat for 30 minutes are marked inactive. */
const HEARTBEAT_STALE_MINUTES = 30;

export class FlockDirectoryService {
    constructor(private readonly db: Database) {}

    /** Register a new agent in the directory. Returns the created agent. */
    register(input: RegisterFlockAgentInput): FlockAgent {
        const id = crypto.randomUUID();
        const capabilities = JSON.stringify(input.capabilities ?? []);
        const now = new Date().toISOString();

        this.db.query(`
            INSERT INTO flock_agents (id, address, name, description, instance_url, capabilities, status, last_heartbeat, registered_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `).run(id, input.address, input.name, input.description ?? '', input.instanceUrl ?? null, capabilities, now, now, now);

        log.info('Agent registered', { id, address: input.address, name: input.name });
        return this.getById(id)!;
    }

    /** Deregister an agent (soft delete — sets status to 'deregistered'). */
    deregister(id: string): boolean {
        const result = this.db.query(`
            UPDATE flock_agents SET status = 'deregistered', updated_at = datetime('now')
            WHERE id = ? AND status != 'deregistered'
        `).run(id);
        if (result.changes > 0) {
            log.info('Agent deregistered', { id });
            return true;
        }
        return false;
    }

    /** Record a heartbeat for the given agent, marking it active. */
    heartbeat(id: string): boolean {
        const now = new Date().toISOString();
        const result = this.db.query(`
            UPDATE flock_agents SET last_heartbeat = ?, status = 'active', updated_at = ?
            WHERE id = ? AND status != 'deregistered'
        `).run(now, now, id);
        return result.changes > 0;
    }

    /** Update agent metadata. */
    update(id: string, input: UpdateFlockAgentInput): FlockAgent | null {
        const agent = this.getById(id);
        if (!agent || agent.status === 'deregistered') return null;

        const sets: string[] = [];
        const params: SQLQueryBindings[] = [];

        if (input.name !== undefined) { sets.push('name = ?'); params.push(input.name); }
        if (input.description !== undefined) { sets.push('description = ?'); params.push(input.description); }
        if (input.instanceUrl !== undefined) { sets.push('instance_url = ?'); params.push(input.instanceUrl); }
        if (input.capabilities !== undefined) { sets.push('capabilities = ?'); params.push(JSON.stringify(input.capabilities)); }
        if (input.reputationScore !== undefined) { sets.push('reputation_score = ?'); params.push(input.reputationScore); }
        if (input.attestationCount !== undefined) { sets.push('attestation_count = ?'); params.push(input.attestationCount); }
        if (input.councilParticipations !== undefined) { sets.push('council_participations = ?'); params.push(input.councilParticipations); }
        if (input.uptimePct !== undefined) { sets.push('uptime_pct = ?'); params.push(input.uptimePct); }

        if (sets.length === 0) return agent;

        sets.push("updated_at = datetime('now')");
        params.push(id);

        this.db.query(`UPDATE flock_agents SET ${sets.join(', ')} WHERE id = ?`).run(...params);
        return this.getById(id);
    }

    /** Look up an agent by ID. */
    getById(id: string): FlockAgent | null {
        const row = this.db.query(`SELECT * FROM flock_agents WHERE id = ?`).get(id) as FlockAgentRecord | null;
        return row ? recordToAgent(row) : null;
    }

    /** Look up an agent by Algorand address. */
    getByAddress(address: string): FlockAgent | null {
        const row = this.db.query(`SELECT * FROM flock_agents WHERE address = ?`).get(address) as FlockAgentRecord | null;
        return row ? recordToAgent(row) : null;
    }

    /** List all active agents. */
    listActive(limit = 100, offset = 0): FlockAgent[] {
        const rows = this.db.query(`
            SELECT * FROM flock_agents WHERE status = 'active'
            ORDER BY reputation_score DESC, registered_at ASC
            LIMIT ? OFFSET ?
        `).all(limit, offset) as FlockAgentRecord[];
        return rows.map(recordToAgent);
    }

    /** Search agents with filtering. */
    search(params: FlockDirectorySearchParams): FlockDirectorySearchResult {
        const conditions: string[] = [];
        const bindParams: SQLQueryBindings[] = [];

        if (params.status) {
            conditions.push('status = ?');
            bindParams.push(params.status);
        } else {
            conditions.push("status != 'deregistered'");
        }

        if (params.query) {
            conditions.push('(name LIKE ? OR description LIKE ?)');
            const q = `%${params.query}%`;
            bindParams.push(q, q);
        }

        if (params.capability) {
            conditions.push("capabilities LIKE ?");
            bindParams.push(`%"${params.capability}"%`);
        }

        if (params.minReputation !== undefined) {
            conditions.push('reputation_score >= ?');
            bindParams.push(params.minReputation);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = params.limit ?? 50;
        const offset = params.offset ?? 0;

        const total = queryCount(this.db, `SELECT COUNT(*) as cnt FROM flock_agents ${where}`, ...bindParams);
        const rows = this.db.query(`
            SELECT * FROM flock_agents ${where}
            ORDER BY reputation_score DESC, registered_at ASC
            LIMIT ? OFFSET ?
        `).all(...bindParams, limit, offset) as FlockAgentRecord[];

        return {
            agents: rows.map(recordToAgent),
            total,
            limit,
            offset,
        };
    }

    /** Mark agents as inactive if they haven't sent a heartbeat recently. */
    sweepStaleAgents(): number {
        const result = this.db.query(`
            UPDATE flock_agents
            SET status = 'inactive', updated_at = datetime('now')
            WHERE status = 'active'
              AND last_heartbeat IS NOT NULL
              AND last_heartbeat < datetime('now', '-${HEARTBEAT_STALE_MINUTES} minutes')
        `).run();
        if (result.changes > 0) {
            log.info('Swept stale agents', { count: result.changes });
        }
        return result.changes;
    }

    /** Get directory statistics. */
    getStats(): { total: number; active: number; inactive: number } {
        const total = queryCount(this.db, `SELECT COUNT(*) as cnt FROM flock_agents WHERE status != 'deregistered'`);
        const active = queryCount(this.db, `SELECT COUNT(*) as cnt FROM flock_agents WHERE status = 'active'`);
        return { total, active, inactive: total - active };
    }
}
