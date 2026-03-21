/**
 * FlockDirectoryService — Agent registry for the Flock Directory.
 *
 * Manages agent registration, discovery, heartbeat tracking,
 * and reputation aggregation for the on-chain agent registry.
 *
 * Supports hybrid operation: off-chain SQLite for fast queries,
 * with optional on-chain sync via OnChainFlockClient when available.
 */
import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { queryCount } from '../db/types';
import type {
    FlockAgent,
    FlockDirectorySearchParams,
    FlockDirectorySearchResult,
    FlockSortField,
    FlockSortOrder,
} from '../../shared/types/flock-directory';
import type {
    FlockAgentRecord,
    RegisterFlockAgentInput,
    UpdateFlockAgentInput,
} from './types';
import type { OnChainFlockClient, OnChainAgentRecord } from './on-chain-client';
import { TIER_NAMES } from './on-chain-client';
import { createLogger } from '../lib/logger';

const log = createLogger('FlockDirectory');

/** Config for on-chain operations that require signing. */
export interface OnChainSignerConfig {
    /** The Algorand address that signs transactions. */
    senderAddress: string;
    /** The secret key for signing (Uint8Array). */
    sk: Uint8Array;
    /** Network name (for logging). */
    network: string;
}

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

/** Stale threshold: agents without heartbeat for 24 hours are marked inactive. */
const HEARTBEAT_STALE_MINUTES = 24 * 60; // 1440 minutes = 24 hours

/** Map sort field names to SQL columns. */
const SORT_COLUMN_MAP: Record<FlockSortField, string> = {
    reputation: 'reputation_score',
    name: 'name',
    uptime: 'uptime_pct',
    registered: 'registered_at',
    attestations: 'attestation_count',
};

/** Validate sort order — only 'asc' or 'desc' are valid. */
function safeSortOrder(order?: FlockSortOrder): 'ASC' | 'DESC' {
    return order === 'asc' ? 'ASC' : 'DESC';
}

/**
 * Reputation weights for composite score calculation.
 * Total weights = 100; score output is 0–100.
 */
const REPUTATION_WEIGHTS = {
    uptime: 35,
    attestations: 25,
    council: 20,
    heartbeatConsistency: 20,
} as const;

export class FlockDirectoryService {
    private onChainClient: OnChainFlockClient | null = null;
    private signerConfig: OnChainSignerConfig | null = null;

    constructor(private readonly db: Database) {}

    /**
     * Inject the on-chain client and signer config for hybrid operation.
     * When set, register/deregister/heartbeat also write on-chain.
     */
    setOnChainClient(client: OnChainFlockClient, signer: OnChainSignerConfig): void {
        this.onChainClient = client;
        this.signerConfig = signer;
        log.info('On-chain client attached', {
            appId: client.getAppId(),
            network: signer.network,
        });
    }

    /** Whether on-chain operations are available. */
    get hasOnChain(): boolean {
        return this.onChainClient !== null && this.signerConfig !== null;
    }

    /** Get the on-chain client (null if not attached). */
    getOnChainClient(): OnChainFlockClient | null {
        return this.onChainClient;
    }

    /**
     * Register a new agent in the directory. Returns the created agent.
     *
     * **Blockchain-first**: If on-chain client is available, the on-chain
     * registration must succeed before the off-chain record is created.
     * This ensures 1:1 parity between chain and SQLite.
     *
     * If the address is already registered, updates the existing record and
     * sends a heartbeat instead of creating a duplicate.
     */
    async register(input: RegisterFlockAgentInput): Promise<FlockAgent> {
        // ── On-chain first ──────────────────────────────────────────────
        if (this.onChainClient && this.signerConfig) {
            await this.registerOnChain(input);
        } else {
            log.warn('No on-chain client — registering off-chain only (dev mode)', {
                address: input.address,
            });
        }

        // ── Then persist to SQLite ──────────────────────────────────────
        // Check for existing registration by address (idempotent)
        const existing = this.getByAddress(input.address);
        if (existing) {
            // Update name/description/capabilities if provided, reactivate if deregistered
            const capabilities = JSON.stringify(input.capabilities ?? existing.capabilities);
            const now = new Date().toISOString();
            this.db.query(`
                UPDATE flock_agents
                SET name = ?, description = ?, instance_url = ?, capabilities = ?,
                    status = 'active', last_heartbeat = ?, updated_at = ?
                WHERE id = ?
            `).run(
                input.name ?? existing.name,
                input.description ?? existing.description,
                input.instanceUrl ?? existing.instanceUrl,
                capabilities, now, now, existing.id,
            );
            log.info('Agent re-registered (existing address)', { id: existing.id, address: input.address });
            return this.getById(existing.id)!;
        }

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

    /**
     * Register an agent on-chain via the admin signer.
     */
    private async registerOnChain(input: RegisterFlockAgentInput): Promise<void> {
        if (!this.onChainClient || !this.signerConfig) return;
        const metadata = JSON.stringify({
            description: input.description ?? '',
            capabilities: input.capabilities ?? [],
        });
        const DEFAULT_STAKE_MICRO_ALGOS = 1_000_000; // 1 ALGO
        await this.onChainClient.registerAgent(
            this.signerConfig.senderAddress,
            this.signerConfig.sk,
            input.name,
            input.instanceUrl ?? '',
            metadata,
            DEFAULT_STAKE_MICRO_ALGOS,
        );
        log.info('Agent registered on-chain', { address: input.address, name: input.name });
    }

    /**
     * Deregister an agent (soft delete — sets status to 'deregistered').
     *
     * **Blockchain-first**: On-chain deregistration must succeed before
     * the off-chain record is updated. This ensures 1:1 parity.
     */
    async deregister(id: string): Promise<boolean> {
        const agent = this.getById(id);
        if (!agent || agent.status === 'deregistered') return false;

        // ── On-chain first ──────────────────────────────────────────────
        if (this.onChainClient && this.signerConfig) {
            await this.onChainClient.deregister(
                this.signerConfig.senderAddress,
                this.signerConfig.sk,
            );
        } else {
            log.warn('No on-chain client — deregistering off-chain only (dev mode)', { id });
        }

        // ── Then update SQLite ──────────────────────────────────────────
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

    /**
     * Record a heartbeat for the given agent, marking it active.
     *
     * **Blockchain-first**: On-chain heartbeat must succeed before
     * the off-chain record is updated. This ensures 1:1 parity.
     */
    async heartbeat(id: string): Promise<boolean> {
        const agent = this.getById(id);
        if (!agent || agent.status === 'deregistered') return false;

        // ── On-chain first ──────────────────────────────────────────────
        if (this.onChainClient && this.signerConfig) {
            await this.onChainClient.heartbeat(
                this.signerConfig.senderAddress,
                this.signerConfig.sk,
            );
        }

        // ── Then update SQLite ──────────────────────────────────────────
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

        // Sort by specified field or default to reputation desc
        const sortCol = params.sortBy ? SORT_COLUMN_MAP[params.sortBy] : 'reputation_score';
        const sortDir = params.sortBy ? safeSortOrder(params.sortOrder) : 'DESC';

        const total = queryCount(this.db, `SELECT COUNT(*) as cnt FROM flock_agents ${where}`, ...bindParams);
        const rows = this.db.query(`
            SELECT * FROM flock_agents ${where}
            ORDER BY ${sortCol} ${sortDir}, registered_at ASC
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

    /**
     * Compute and persist a composite reputation score for an agent.
     * Combines uptime, attestation count, council participations,
     * and heartbeat consistency into a single 0–100 score.
     *
     * Returns the updated agent, or null if not found / deregistered.
     */
    computeReputation(id: string): FlockAgent | null {
        const agent = this.getById(id);
        if (!agent || agent.status === 'deregistered') return null;

        // Uptime component: direct percentage (0–100) → weighted
        const uptimeScore = Math.min(agent.uptimePct, 100) * (REPUTATION_WEIGHTS.uptime / 100);

        // Attestation component: logarithmic scale, cap at 20 attestations
        const attestCapped = Math.min(agent.attestationCount, 20);
        const attestScore = (attestCapped > 0
            ? Math.log(attestCapped + 1) / Math.log(21) // normalized 0–1
            : 0) * REPUTATION_WEIGHTS.attestations;

        // Council component: linear scale, cap at 10 participations
        const councilCapped = Math.min(agent.councilParticipations, 10);
        const councilScore = (councilCapped / 10) * REPUTATION_WEIGHTS.council;

        // Heartbeat consistency: based on status — active = full marks, inactive = half
        const heartbeatScore = agent.status === 'active'
            ? REPUTATION_WEIGHTS.heartbeatConsistency
            : REPUTATION_WEIGHTS.heartbeatConsistency * 0.5;

        const total = Math.round(uptimeScore + attestScore + councilScore + heartbeatScore);
        const clamped = Math.max(0, Math.min(100, total));

        return this.update(id, { reputationScore: clamped });
    }

    /**
     * Recompute reputation scores for all non-deregistered agents.
     * Returns the number of agents updated.
     */
    recomputeAllReputations(): number {
        const rows = this.db.query(
            `SELECT id FROM flock_agents WHERE status != 'deregistered'`,
        ).all() as { id: string }[];

        let updated = 0;
        for (const row of rows) {
            if (this.computeReputation(row.id)) updated++;
        }

        if (updated > 0) {
            log.info('Recomputed reputation scores', { count: updated });
        }
        return updated;
    }

    /** Get directory statistics. */
    getStats(): { total: number; active: number; inactive: number; onChainAppId: number | null } {
        const total = queryCount(this.db, `SELECT COUNT(*) as cnt FROM flock_agents WHERE status != 'deregistered'`);
        const active = queryCount(this.db, `SELECT COUNT(*) as cnt FROM flock_agents WHERE status = 'active'`);
        return {
            total,
            active,
            inactive: total - active,
            onChainAppId: this.onChainClient?.getAppId() ?? null,
        };
    }

    /**
     * Self-register this corvid-agent instance in the Flock Directory.
     * Blockchain-first: on-chain registration must succeed before SQLite.
     * Idempotent — skips if already registered at the given address.
     */
    async selfRegister(opts: {
        address: string;
        name: string;
        description: string;
        instanceUrl: string;
        capabilities: string[];
    }): Promise<FlockAgent> {
        // Check if already registered off-chain
        const existing = this.getByAddress(opts.address);
        if (existing && existing.status !== 'deregistered') {
            log.info('Self-registration: already registered', { id: existing.id, address: opts.address });
            // Send heartbeat to keep it active
            await this.heartbeat(existing.id);
            return existing;
        }

        // Register (blockchain-first, then SQLite)
        const agent = await this.register({
            address: opts.address,
            name: opts.name,
            description: opts.description,
            instanceUrl: opts.instanceUrl,
            capabilities: opts.capabilities,
        });

        log.info('Self-registered in Flock Directory', {
            id: agent.id,
            address: opts.address,
            onChain: this.hasOnChain,
        });
        return agent;
    }

    /**
     * Fetch an agent's on-chain record and enrich the off-chain entry
     * with tier and score data. Returns null if on-chain client is not available
     * or the agent is not found on-chain.
     */
    async syncFromChain(address: string): Promise<OnChainAgentRecord | null> {
        if (!this.onChainClient || !this.signerConfig) return null;

        try {
            const record = await this.onChainClient.getAgentInfo(
                address,
                this.signerConfig.senderAddress,
                this.signerConfig.sk,
            );

            // Update off-chain record with on-chain reputation data
            const agent = this.getByAddress(address);
            if (agent) {
                const score = record.totalMaxScore > 0
                    ? Math.round((record.totalScore / record.totalMaxScore) * 100)
                    : 0;
                this.update(agent.id, {
                    reputationScore: score,
                });
                log.debug('Synced on-chain data to off-chain', {
                    address,
                    tier: TIER_NAMES[record.tier] ?? record.tier,
                    score,
                });
            }

            return record;
        } catch (err) {
            log.debug('On-chain sync failed (agent may not be registered on-chain)', {
                address,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }
}
