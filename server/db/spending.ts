import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { RateLimitError } from '../lib/errors';

const log = createLogger('SpendingTracker');

const DAILY_ALGO_LIMIT_MICRO = parseInt(process.env.DAILY_ALGO_LIMIT_MICRO ?? '10000000', 10); // 10 ALGO
const DEFAULT_AGENT_DAILY_CAP_MICRO = parseInt(process.env.DEFAULT_AGENT_DAILY_CAP_MICRO ?? '5000000', 10); // 5 ALGO


interface DailyTotals {
    date: string;
    algoMicro: number;
    apiCostUsd: number;
}

export interface AgentSpendingCap {
    agentId: string;
    dailyLimitMicroalgos: number;
    dailyLimitUsdc: number;
    createdAt: string;
    updatedAt: string;
}

export interface AgentDailySpending {
    agentId: string;
    date: string;
    algoMicro: number;
    usdcMicro: number;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function ensureRow(db: Database, date: string): void {
    db.query(
        `INSERT OR IGNORE INTO daily_spending (date, algo_micro, api_cost_usd) VALUES (?, 0, 0.0)`
    ).run(date);
}

export function recordAlgoSpend(db: Database, microAlgos: number): void {
    const date = today();
    // Wrap INSERT OR IGNORE + UPDATE atomically to prevent race between
    // concurrent async operations that could both try to initialize the row.
    const record = db.transaction(() => {
        ensureRow(db, date);
        db.query(
            `UPDATE daily_spending SET algo_micro = algo_micro + ? WHERE date = ?`
        ).run(microAlgos, date);
    });
    record();
}

export function recordApiCost(db: Database, usd: number): void {
    const date = today();
    const record = db.transaction(() => {
        ensureRow(db, date);
        db.query(
            `UPDATE daily_spending SET api_cost_usd = api_cost_usd + ? WHERE date = ?`
        ).run(usd, date);
    });
    record();
}

export function getDailyTotals(db: Database): DailyTotals {
    const date = today();
    ensureRow(db, date);
    const row = db.query(
        `SELECT date, algo_micro, api_cost_usd FROM daily_spending WHERE date = ?`
    ).get(date) as { date: string; algo_micro: number; api_cost_usd: number };
    return {
        date: row.date,
        algoMicro: row.algo_micro,
        apiCostUsd: row.api_cost_usd,
    };
}

export function checkAlgoLimit(db: Database, additionalMicro: number): void {
    // Read totals inside a transaction so the limit check is consistent
    // with the current spending state — prevents TOCTOU race.
    const check = db.transaction(() => {
        const totals = getDailyTotals(db);
        const projected = totals.algoMicro + additionalMicro;
        if (projected > DAILY_ALGO_LIMIT_MICRO) {
            const limitAlgo = (DAILY_ALGO_LIMIT_MICRO / 1_000_000).toFixed(6);
            const currentAlgo = (totals.algoMicro / 1_000_000).toFixed(6);
            const message = `Daily ALGO spending limit reached: ${currentAlgo}/${limitAlgo} ALGO`;
            log.warn(message);
            throw new RateLimitError(message);
        }
    });
    check();
}

export function getSpendingLimits(): { algoMicro: number } {
    return { algoMicro: DAILY_ALGO_LIMIT_MICRO };
}

// ─── Per-agent spending caps ─────────────────────────────────────────────

function ensureAgentRow(db: Database, agentId: string, date: string): void {
    db.query(
        `INSERT OR IGNORE INTO agent_daily_spending (agent_id, date, algo_micro, usdc_micro) VALUES (?, ?, 0, 0)`
    ).run(agentId, date);
}

/**
 * Record ALGO spending for a specific agent.
 * Also records to the global daily_spending table.
 */
export function recordAgentAlgoSpend(db: Database, agentId: string, microAlgos: number): void {
    const date = today();
    const record = db.transaction(() => {
        // Global tracking
        ensureRow(db, date);
        db.query(
            `UPDATE daily_spending SET algo_micro = algo_micro + ? WHERE date = ?`
        ).run(microAlgos, date);

        // Per-agent tracking
        ensureAgentRow(db, agentId, date);
        db.query(
            `UPDATE agent_daily_spending SET algo_micro = algo_micro + ? WHERE agent_id = ? AND date = ?`
        ).run(microAlgos, agentId, date);
    });
    record();
}

/**
 * Check both global and per-agent ALGO limits before a transaction.
 * Throws RateLimitError if either limit would be exceeded.
 */
export function checkAgentAlgoLimit(db: Database, agentId: string, additionalMicro: number): void {
    const check = db.transaction(() => {
        // Check global limit first
        const totals = getDailyTotals(db);
        const globalProjected = totals.algoMicro + additionalMicro;
        if (globalProjected > DAILY_ALGO_LIMIT_MICRO) {
            const limitAlgo = (DAILY_ALGO_LIMIT_MICRO / 1_000_000).toFixed(6);
            const currentAlgo = (totals.algoMicro / 1_000_000).toFixed(6);
            throw new RateLimitError(
                `Daily global ALGO spending limit reached: ${currentAlgo}/${limitAlgo} ALGO`,
            );
        }

        // Check per-agent limit
        const cap = getAgentSpendingCap(db, agentId);
        const agentLimit = cap?.dailyLimitMicroalgos ?? DEFAULT_AGENT_DAILY_CAP_MICRO;
        if (agentLimit <= 0) return; // 0 means unlimited

        const agentSpending = getAgentDailySpending(db, agentId);
        const agentProjected = agentSpending.algoMicro + additionalMicro;
        if (agentProjected > agentLimit) {
            const limitAlgo = (agentLimit / 1_000_000).toFixed(6);
            const currentAlgo = (agentSpending.algoMicro / 1_000_000).toFixed(6);
            throw new RateLimitError(
                `Agent daily ALGO spending limit reached: ${currentAlgo}/${limitAlgo} ALGO`,
            );
        }
    });
    check();
}

/**
 * Get the spending cap for a specific agent, or null if not configured.
 */
export function getAgentSpendingCap(db: Database, agentId: string): AgentSpendingCap | null {
    const row = db.query(
        `SELECT agent_id, daily_limit_microalgos, daily_limit_usdc, created_at, updated_at
         FROM agent_spending_caps WHERE agent_id = ?`
    ).get(agentId) as {
        agent_id: string;
        daily_limit_microalgos: number;
        daily_limit_usdc: number;
        created_at: string;
        updated_at: string;
    } | null;

    if (!row) return null;
    return {
        agentId: row.agent_id,
        dailyLimitMicroalgos: row.daily_limit_microalgos,
        dailyLimitUsdc: row.daily_limit_usdc,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * Set or update the spending cap for an agent.
 */
export function setAgentSpendingCap(
    db: Database,
    agentId: string,
    dailyLimitMicroalgos: number,
    dailyLimitUsdc: number = 0,
): AgentSpendingCap {
    db.query(
        `INSERT INTO agent_spending_caps (agent_id, daily_limit_microalgos, daily_limit_usdc)
         VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
            daily_limit_microalgos = ?,
            daily_limit_usdc = ?,
            updated_at = datetime('now')`
    ).run(agentId, dailyLimitMicroalgos, dailyLimitUsdc, dailyLimitMicroalgos, dailyLimitUsdc);

    log.info('Agent spending cap set', { agentId, dailyLimitMicroalgos, dailyLimitUsdc });
    return getAgentSpendingCap(db, agentId)!;
}

/**
 * Remove per-agent spending cap (agent falls back to global default).
 */
export function removeAgentSpendingCap(db: Database, agentId: string): boolean {
    const result = db.query('DELETE FROM agent_spending_caps WHERE agent_id = ?').run(agentId);
    return result.changes > 0;
}

/**
 * List all agent spending caps.
 */
export function listAgentSpendingCaps(db: Database): AgentSpendingCap[] {
    const rows = db.query(
        `SELECT agent_id, daily_limit_microalgos, daily_limit_usdc, created_at, updated_at
         FROM agent_spending_caps ORDER BY agent_id`
    ).all() as Array<{
        agent_id: string;
        daily_limit_microalgos: number;
        daily_limit_usdc: number;
        created_at: string;
        updated_at: string;
    }>;

    return rows.map(r => ({
        agentId: r.agent_id,
        dailyLimitMicroalgos: r.daily_limit_microalgos,
        dailyLimitUsdc: r.daily_limit_usdc,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    }));
}

/**
 * Get today's per-agent spending totals.
 */
export function getAgentDailySpending(db: Database, agentId: string): AgentDailySpending {
    const date = today();
    ensureAgentRow(db, agentId, date);
    const row = db.query(
        `SELECT agent_id, date, algo_micro, usdc_micro FROM agent_daily_spending WHERE agent_id = ? AND date = ?`
    ).get(agentId, date) as {
        agent_id: string;
        date: string;
        algo_micro: number;
        usdc_micro: number;
    };
    return {
        agentId: row.agent_id,
        date: row.date,
        algoMicro: row.algo_micro,
        usdcMicro: row.usdc_micro,
    };
}

/**
 * Get the default per-agent daily cap (from env or default).
 */
export function getDefaultAgentDailyCap(): { microalgos: number } {
    return { microalgos: DEFAULT_AGENT_DAILY_CAP_MICRO };
}
