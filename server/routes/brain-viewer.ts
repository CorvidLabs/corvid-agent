/**
 * Brain Viewer API — dashboard endpoints for inspecting agent memory state.
 *
 * Provides read-only visibility into both tiers:
 *   - longterm: status='confirmed' + txid (on-chain localnet Algorand)
 *   - shortterm: status='pending' or 'failed' (SQLite only)
 *
 * All endpoints live under /api/dashboard/memories and inherit the
 * dashboard auth guard automatically.
 */

import type { Database } from 'bun:sqlite';
import type { RequestContext } from '../middleware/guards';
import type { MemoryGraduationService } from '../memory/graduation-service';
import { json, badRequest, notFound, safeNumParam, handleRouteError } from '../lib/response';
import { computeDecayMultiplier } from '../memory/decay';
import {
    listObservations,
    countObservations,
    boostObservation,
    getObservation,
} from '../db/observations';

// ─── Types ──────────────────────────────────────────────────────────────────

type MemoryTier = 'longterm' | 'shortterm';

interface MemoryRow {
    id: string;
    agent_id: string;
    key: string;
    content: string;
    txid: string | null;
    asa_id: number | null;
    status: string;
    created_at: string;
    updated_at: string;
}

interface CategoryRow {
    memory_id: string;
    category: string;
    confidence: number;
}

interface CountRow {
    count: number;
}

interface StatusCountRow {
    status: string;
    count: number;
}

interface CategoryCountRow {
    category: string;
    count: number;
}

interface AgentRow {
    id: string;
    name: string;
}

interface AgentMemoryCountRow {
    agent_id: string;
    total: number;
    longterm: number;
    shortterm: number;
}

interface FailedMemoryRow {
    id: string;
    key: string;
    updated_at: string;
}

// ─── Tier derivation ────────────────────────────────────────────────────────

type StorageType = 'arc69' | 'plain-txn' | 'pending';

function deriveTier(status: string, txid: string | null): MemoryTier {
    return status === 'confirmed' && txid !== null ? 'longterm' : 'shortterm';
}

function deriveStorageType(status: string, txid: string | null, asaId: number | null): StorageType {
    if (asaId !== null) return 'arc69';
    if (txid !== null && status === 'confirmed') return 'plain-txn';
    return 'pending';
}

// ─── Route handler ──────────────────────────────────────────────────────────

const MEMORIES_PREFIX = '/api/dashboard/memories';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function handleBrainViewerRoutes(
    req: Request,
    url: URL,
    db: Database,
    _context?: RequestContext,
    graduationService?: MemoryGraduationService | null,
): Response | null | Promise<Response | null> {
    if (!url.pathname.startsWith(MEMORIES_PREFIX)) {
        return null;
    }

    // Only allow GET and POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return null;
    }

    try {
        // ─── Observation routes ─────────────────────────────────────────

        // GET /api/dashboard/memories/observations
        if (url.pathname === `${MEMORIES_PREFIX}/observations` && req.method === 'GET') {
            return handleObservationList(url, db);
        }

        // GET /api/dashboard/memories/observations/stats
        if (url.pathname === `${MEMORIES_PREFIX}/observations/stats` && req.method === 'GET') {
            return handleObservationStats(url, db);
        }

        // POST /api/dashboard/memories/observations/:id/graduate
        const graduateMatch = url.pathname.match(/^\/api\/dashboard\/memories\/observations\/([^/]+)\/graduate$/);
        if (graduateMatch && req.method === 'POST') {
            return handleForceGraduate(graduateMatch[1], db, graduationService ?? null);
        }

        // POST /api/dashboard/memories/observations/:id/boost
        const boostMatch = url.pathname.match(/^\/api\/dashboard\/memories\/observations\/([^/]+)\/boost$/);
        if (boostMatch && req.method === 'POST') {
            return handleBoostObservation(boostMatch[1], db);
        }

        // GET-only routes below
        if (req.method !== 'GET') return null;

        // /api/dashboard/memories/sync-status
        if (url.pathname === `${MEMORIES_PREFIX}/sync-status`) {
            return handleSyncStatus(url, db);
        }

        // /api/dashboard/memories/stats
        if (url.pathname === `${MEMORIES_PREFIX}/stats`) {
            return handleStats(url, db);
        }

        // /api/dashboard/memories/:id
        const idMatch = url.pathname.match(/^\/api\/dashboard\/memories\/([^/]+)$/);
        if (idMatch && idMatch[1] !== 'stats' && idMatch[1] !== 'sync-status' && idMatch[1] !== 'observations') {
            return handleMemoryDetail(idMatch[1], db);
        }

        // /api/dashboard/memories
        if (url.pathname === MEMORIES_PREFIX) {
            return handleMemoryList(url, db);
        }

        return null;
    } catch (err) {
        return handleRouteError(err);
    }
}

// ─── GET /api/dashboard/memories ────────────────────────────────────────────

function handleMemoryList(url: URL, db: Database): Response {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const tier = url.searchParams.get('tier') as MemoryTier | null;
    const status = url.searchParams.get('status') ?? undefined;
    const category = url.searchParams.get('category') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const limit = Math.min(safeNumParam(url.searchParams.get('limit'), DEFAULT_LIMIT), MAX_LIMIT);
    const offset = safeNumParam(url.searchParams.get('offset'), 0);

    // Validate tier
    if (tier && tier !== 'longterm' && tier !== 'shortterm') {
        return badRequest('Invalid tier: must be "longterm" or "shortterm"');
    }

    // Validate status
    if (status && !['pending', 'confirmed', 'failed'].includes(status)) {
        return badRequest('Invalid status: must be "pending", "confirmed", or "failed"');
    }

    // Search path
    if (search) {
        return handleSearchMemories(db, search, agentId, tier, limit, offset);
    }

    // Build query
    const conditions: string[] = ['m.archived = 0'];
    const bindings: (string | number)[] = [];

    if (agentId) {
        conditions.push('m.agent_id = ?');
        bindings.push(agentId);
    }

    if (status) {
        conditions.push('m.status = ?');
        bindings.push(status);
    }

    if (tier === 'longterm') {
        conditions.push("m.status = 'confirmed' AND m.txid IS NOT NULL");
    } else if (tier === 'shortterm') {
        conditions.push("(m.status != 'confirmed' OR m.txid IS NULL)");
    }

    if (category) {
        conditions.push('mc.category = ?');
        bindings.push(category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const joinClause = category
        ? 'LEFT JOIN memory_categories mc ON mc.memory_id = m.id'
        : '';

    // Count total
    const totalRow = safeQuery<CountRow>(
        db,
        `SELECT COUNT(*) as count FROM agent_memories m ${joinClause} ${whereClause}`,
        bindings,
    );
    const total = totalRow?.count ?? 0;

    // Fetch page
    const rows = safeQuery<MemoryRow[]>(
        db,
        `SELECT m.* FROM agent_memories m ${joinClause} ${whereClause}
         ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`,
        [...bindings, limit, offset],
        true,
    ) as MemoryRow[] ?? [];

    const entries = enrichMemories(db, rows);

    return json({ entries, total, limit, offset });
}

// ─── Search with FTS5 + LIKE fallback ───────────────────────────────────────

function handleSearchMemories(
    db: Database,
    query: string,
    agentId: string | undefined,
    tier: MemoryTier | null,
    limit: number,
    offset: number,
): Response {
    let rows: MemoryRow[] = [];
    let total = 0;

    // Try FTS5 first
    try {
        const ftsQuery = sanitizeFtsQuery(query);
        if (ftsQuery) {
            const conditions: string[] = [];
            const bindings: (string | number)[] = [ftsQuery];

            if (agentId) {
                conditions.push('AND m.agent_id = ?');
                bindings.push(agentId);
            }
            conditions.push('AND m.archived = 0');

            if (tier === 'longterm') {
                conditions.push("AND m.status = 'confirmed' AND m.txid IS NOT NULL");
            } else if (tier === 'shortterm') {
                conditions.push("AND (m.status != 'confirmed' OR m.txid IS NULL)");
            }

            const condStr = conditions.join(' ');

            const countRow = db.query(
                `SELECT COUNT(*) as count FROM agent_memories_fts fts
                 JOIN agent_memories m ON m.rowid = fts.rowid
                 WHERE agent_memories_fts MATCH ? ${condStr}`
            ).get(...bindings) as CountRow | null;
            total = countRow?.count ?? 0;

            rows = db.query(
                `SELECT m.* FROM agent_memories_fts fts
                 JOIN agent_memories m ON m.rowid = fts.rowid
                 WHERE agent_memories_fts MATCH ? ${condStr}
                 ORDER BY rank LIMIT ? OFFSET ?`
            ).all(...bindings, limit, offset) as MemoryRow[];

            if (rows.length > 0 || total > 0) {
                const entries = enrichMemories(db, rows);
                return json({ entries, total, limit, offset });
            }
        }
    } catch {
        // FTS5 unavailable — fall through to LIKE
    }

    // LIKE fallback
    const pattern = `%${query}%`;
    const conditions: string[] = ['(m.key LIKE ? OR m.content LIKE ?)', 'm.archived = 0'];
    const bindings: (string | number)[] = [pattern, pattern];

    if (agentId) {
        conditions.push('m.agent_id = ?');
        bindings.push(agentId);
    }

    if (tier === 'longterm') {
        conditions.push("m.status = 'confirmed' AND m.txid IS NOT NULL");
    } else if (tier === 'shortterm') {
        conditions.push("(m.status != 'confirmed' OR m.txid IS NULL)");
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countRow = safeQuery<CountRow>(
        db,
        `SELECT COUNT(*) as count FROM agent_memories m ${whereClause}`,
        bindings,
    );
    total = countRow?.count ?? 0;

    rows = safeQuery<MemoryRow[]>(
        db,
        `SELECT m.* FROM agent_memories m ${whereClause}
         ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`,
        [...bindings, limit, offset],
        true,
    ) as MemoryRow[] ?? [];

    const entries = enrichMemories(db, rows);
    return json({ entries, total, limit, offset });
}

// ─── GET /api/dashboard/memories/stats ──────────────────────────────────────

function handleStats(url: URL, db: Database): Response {
    const agentId = url.searchParams.get('agentId') ?? undefined;

    const agentFilter = agentId ? ' AND agent_id = ?' : '';
    const agentBinding = agentId ? [agentId] : [];

    // Total
    const totalRow = db.query(
        `SELECT COUNT(*) as count FROM agent_memories WHERE archived = 0${agentFilter}`
    ).get(...agentBinding) as CountRow;
    const totalMemories = totalRow.count;

    // By status
    const statusRows = db.query(
        `SELECT status, COUNT(*) as count FROM agent_memories WHERE archived = 0${agentFilter} GROUP BY status`
    ).all(...agentBinding) as StatusCountRow[];

    const byStatus = { confirmed: 0, pending: 0, failed: 0 };
    for (const row of statusRows) {
        if (row.status in byStatus) {
            byStatus[row.status as keyof typeof byStatus] = row.count;
        }
    }

    // By tier (derived)
    const longtermRow = db.query(
        `SELECT COUNT(*) as count FROM agent_memories WHERE archived = 0 AND status = 'confirmed' AND txid IS NOT NULL${agentFilter}`
    ).get(...agentBinding) as CountRow;
    const byTier = {
        longterm: longtermRow.count,
        shortterm: totalMemories - longtermRow.count,
    };

    // By category (best-effort)
    let byCategory: Record<string, number> = {};
    try {
        const catRows = db.query(
            `SELECT mc.category, COUNT(*) as count
             FROM memory_categories mc
             JOIN agent_memories m ON m.id = mc.memory_id
             WHERE m.archived = 0${agentFilter.replace('agent_id', 'm.agent_id')}
             GROUP BY mc.category`
        ).all(...agentBinding) as CategoryCountRow[];
        for (const row of catRows) {
            byCategory[row.category] = row.count;
        }
    } catch {
        // memory_categories may not exist yet
    }

    // By agent
    const byAgent: Array<{ agentId: string; agentName: string; total: number; longterm: number; shortterm: number }> = [];
    if (!agentId) {
        const agentRows = db.query(
            `SELECT a.id, a.name,
                    COUNT(m.id) as total,
                    SUM(CASE WHEN m.status = 'confirmed' AND m.txid IS NOT NULL THEN 1 ELSE 0 END) as longterm,
                    SUM(CASE WHEN m.status != 'confirmed' OR m.txid IS NULL THEN 1 ELSE 0 END) as shortterm
             FROM agents a
             LEFT JOIN agent_memories m ON m.agent_id = a.id AND m.archived = 0
             GROUP BY a.id
             HAVING total > 0
             ORDER BY total DESC`
        ).all() as (AgentRow & AgentMemoryCountRow)[];

        for (const row of agentRows) {
            byAgent.push({
                agentId: row.id,
                agentName: row.name,
                total: row.total,
                longterm: row.longterm,
                shortterm: row.shortterm,
            });
        }
    }

    // Date range
    const oldestRow = db.query(
        `SELECT MIN(created_at) as val FROM agent_memories WHERE archived = 0${agentFilter}`
    ).get(...agentBinding) as { val: string | null };
    const newestRow = db.query(
        `SELECT MAX(created_at) as val FROM agent_memories WHERE archived = 0${agentFilter}`
    ).get(...agentBinding) as { val: string | null };

    // Average decay score (computed live)
    let averageDecayScore: number | null = null;
    const decayRows = db.query(
        `SELECT updated_at FROM agent_memories WHERE archived = 0${agentFilter}`
    ).all(...agentBinding) as Array<{ updated_at: string }>;
    if (decayRows.length > 0) {
        const now = new Date();
        const totalDecay = decayRows.reduce(
            (sum, row) => sum + computeDecayMultiplier(row.updated_at, now),
            0,
        );
        averageDecayScore = Math.round((totalDecay / decayRows.length) * 100) / 100;
    }

    return json({
        totalMemories,
        byTier,
        byStatus,
        byCategory,
        byAgent,
        oldestMemory: oldestRow.val,
        newestMemory: newestRow.val,
        averageDecayScore,
    });
}

// ─── GET /api/dashboard/memories/:id ────────────────────────────────────────

function handleMemoryDetail(id: string, db: Database): Response {
    const row = db.query(
        'SELECT * FROM agent_memories WHERE id = ?'
    ).get(id) as MemoryRow | null;

    if (!row) {
        return notFound('Memory not found');
    }

    const entries = enrichMemories(db, [row]);
    return json(entries[0]);
}

// ─── GET /api/dashboard/memories/sync-status ────────────────────────────────

const SYNC_INTERVAL_MS = 60_000;

function handleSyncStatus(url: URL, db: Database): Response {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const agentFilter = agentId ? ' AND agent_id = ?' : '';
    const agentBinding = agentId ? [agentId] : [];

    // Pending count
    const pendingRow = db.query(
        `SELECT COUNT(*) as count FROM agent_memories WHERE status = 'pending'${agentFilter}`
    ).get(...agentBinding) as CountRow;

    // Failed count
    const failedRow = db.query(
        `SELECT COUNT(*) as count FROM agent_memories WHERE status = 'failed'${agentFilter}`
    ).get(...agentBinding) as CountRow;

    // Last sync: most recent confirmed memory
    const lastSyncRow = db.query(
        `SELECT MAX(updated_at) as val FROM agent_memories WHERE status = 'confirmed' AND txid IS NOT NULL${agentFilter}`
    ).get(...agentBinding) as { val: string | null };

    // isRunning: heuristic — if any memory was confirmed within 2x sync interval, service is likely active
    const recentConfirmRow = db.query(
        `SELECT COUNT(*) as count FROM agent_memories
         WHERE status = 'confirmed' AND txid IS NOT NULL
         AND updated_at > datetime('now', '-120 seconds')`
    ).get() as CountRow;
    const isRunning = recentConfirmRow.count > 0 || pendingRow.count > 0;

    // Recent errors: failed memories with their keys and timestamps
    const failedMemories = db.query(
        `SELECT id, key, updated_at FROM agent_memories
         WHERE status = 'failed'${agentFilter}
         ORDER BY updated_at DESC LIMIT 10`
    ).all(...agentBinding) as FailedMemoryRow[];

    const recentErrors = failedMemories.map((row) => ({
        memoryId: row.id,
        key: row.key,
        error: 'Sync to on-chain failed',
        failedAt: row.updated_at,
    }));

    return json({
        isRunning,
        pendingCount: pendingRow.count,
        failedCount: failedRow.count,
        lastSyncAt: lastSyncRow.val,
        syncIntervalMs: SYNC_INTERVAL_MS,
        recentErrors,
    });
}

// ─── GET /api/dashboard/memories/observations ────────────────────────────────

function handleObservationList(url: URL, db: Database): Response {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const status = url.searchParams.get('status') as 'active' | 'graduated' | 'expired' | 'dismissed' | null;
    const limit = Math.min(safeNumParam(url.searchParams.get('limit'), DEFAULT_LIMIT), MAX_LIMIT);

    if (!agentId) {
        // List observations across all agents
        const conditions: string[] = [];
        const bindings: (string | number)[] = [];

        if (status) {
            conditions.push('status = ?');
            bindings.push(status);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        bindings.push(limit);

        const rows = db.query(
            `SELECT * FROM memory_observations ${whereClause}
             ORDER BY relevance_score DESC, created_at DESC
             LIMIT ?`,
        ).all(...bindings) as Array<Record<string, unknown>>;

        const totalRow = db.query(
            `SELECT COUNT(*) as count FROM memory_observations ${whereClause}`,
        ).get(...bindings.slice(0, -1)) as CountRow;

        return json({
            observations: rows.map(formatObservationRow),
            total: totalRow?.count ?? rows.length,
        });
    }

    const observations = listObservations(db, agentId, {
        status: status ?? undefined,
        limit,
    });

    return json({ observations, total: observations.length });
}

// ─── GET /api/dashboard/memories/observations/stats ──────────────────────────

function handleObservationStats(url: URL, db: Database): Response {
    const agentId = url.searchParams.get('agentId') ?? undefined;

    if (agentId) {
        const counts = countObservations(db, agentId);
        return json({ agents: [{ agentId, ...counts }] });
    }

    // All agents
    const agentRows = db.query(
        `SELECT DISTINCT agent_id FROM memory_observations`,
    ).all() as { agent_id: string }[];

    const agents = agentRows.map(({ agent_id }) => ({
        agentId: agent_id,
        ...countObservations(db, agent_id),
    }));

    // Totals
    const totalRow = db.query(
        `SELECT COUNT(*) as count FROM memory_observations WHERE status = 'active'`,
    ).get() as CountRow;

    const graduationCandidateRow = db.query(
        `SELECT COUNT(*) as count FROM memory_observations
         WHERE status = 'active' AND relevance_score >= 3.0 AND access_count >= 2`,
    ).get() as CountRow;

    return json({
        agents,
        totalActive: totalRow?.count ?? 0,
        graduationCandidates: graduationCandidateRow?.count ?? 0,
    });
}

// ─── POST /api/dashboard/memories/observations/:id/graduate ──────────────────

async function handleForceGraduate(
    observationId: string,
    db: Database,
    graduationService: MemoryGraduationService | null,
): Promise<Response> {
    const obs = getObservation(db, observationId);
    if (!obs) {
        return notFound('Observation not found');
    }
    if (obs.status !== 'active') {
        return badRequest(`Observation is already ${obs.status}`);
    }

    // Boost the observation to meet graduation criteria, then trigger a tick
    boostObservation(db, observationId, Math.max(0, 3.0 - obs.relevanceScore));

    // If we have access to the graduation service, force a tick to graduate immediately
    if (graduationService) {
        await graduationService.tick();
    }

    // Re-fetch to confirm graduation
    const updated = getObservation(db, observationId);
    return json({
        success: updated?.status === 'graduated',
        observation: updated,
        message: updated?.status === 'graduated'
            ? `Graduated as "${updated.graduatedKey}"`
            : 'Observation boosted — will graduate on next tick',
    });
}

// ─── POST /api/dashboard/memories/observations/:id/boost ─────────────────────

function handleBoostObservation(observationId: string, db: Database): Response {
    const obs = getObservation(db, observationId);
    if (!obs) {
        return notFound('Observation not found');
    }
    if (obs.status !== 'active') {
        return badRequest(`Cannot boost — observation is ${obs.status}`);
    }

    boostObservation(db, observationId, 1.0);
    const updated = getObservation(db, observationId);
    return json({ observation: updated });
}

/** Format a raw observation row from a cross-agent query. */
function formatObservationRow(row: Record<string, unknown>) {
    return {
        id: row.id,
        agentId: row.agent_id,
        source: row.source,
        sourceId: row.source_id,
        content: row.content,
        suggestedKey: row.suggested_key,
        relevanceScore: row.relevance_score,
        accessCount: row.access_count,
        lastAccessedAt: row.last_accessed_at,
        status: row.status,
        graduatedKey: row.graduated_key,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Enrich raw memory rows with tier, category, and decay score.
 */
function enrichMemories(db: Database, rows: MemoryRow[]): Array<Record<string, unknown>> {
    if (rows.length === 0) return [];

    // Batch-load categories
    const categoryMap = new Map<string, { category: string; confidence: number }>();
    try {
        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const catRows = db.query(
            `SELECT memory_id, category, confidence FROM memory_categories WHERE memory_id IN (${placeholders})`
        ).all(...ids) as CategoryRow[];
        for (const cat of catRows) {
            categoryMap.set(cat.memory_id, { category: cat.category, confidence: cat.confidence });
        }
    } catch {
        // memory_categories may not exist yet
    }

    const now = new Date();

    return rows.map((row) => {
        const cat = categoryMap.get(row.id);
        return {
            id: row.id,
            agentId: row.agent_id,
            key: row.key,
            content: row.content,
            tier: deriveTier(row.status, row.txid),
            storageType: deriveStorageType(row.status, row.txid, row.asa_id),
            status: row.status,
            txid: row.txid,
            asaId: row.asa_id,
            category: cat?.category ?? null,
            categoryConfidence: cat?.confidence ?? null,
            decayScore: computeDecayMultiplier(row.updated_at, now),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    });
}

/**
 * FTS5 query sanitizer — same logic as agent-memories.ts.
 */
function sanitizeFtsQuery(query: string): string | null {
    const cleaned = query.replace(/[":(){}[\]^~*\\]/g, ' ').trim();
    if (!cleaned) return null;

    const words = cleaned
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `"${w}"*`);

    return words.length > 0 ? words.join(' ') : null;
}

/**
 * Safe query wrapper — catches errors from tables that may not exist yet
 * (e.g., memory extension tables created at runtime).
 */
function safeQuery<T>(db: Database, sql: string, bindings: (string | number)[], isAll?: boolean): T | null {
    try {
        if (isAll) {
            return db.query(sql).all(...bindings) as T;
        }
        return db.query(sql).get(...bindings) as T;
    } catch {
        return null;
    }
}
