/**
 * Common database type utilities.
 *
 * Provides typed helpers for frequent query patterns (counts, existence checks,
 * pagination) to replace scattered inline type casts.
 */

import type { Database, SQLQueryBindings } from 'bun:sqlite';

// ─── Count Queries ──────────────────────────────────────────────────────────

/** Row shape for COUNT(*) queries aliased as `cnt`. */
export interface CountRow { cnt: number }

/**
 * Execute a COUNT(*) query and return the numeric result.
 *
 * Usage:
 *   const total = queryCount(db, 'SELECT COUNT(*) as cnt FROM agents WHERE active = 1');
 *   const filtered = queryCount(db, 'SELECT COUNT(*) as cnt FROM sessions WHERE agent_id = ?', agentId);
 */
export function queryCount(db: Database, sql: string, ...params: SQLQueryBindings[]): number {
    const row = db.query(sql).get(...params) as CountRow | null;
    return row?.cnt ?? 0;
}

/**
 * Check if any rows exist matching the query.
 *
 * Usage:
 *   const hasAgent = queryExists(db, 'SELECT COUNT(*) as cnt FROM agents WHERE id = ?', id);
 */
export function queryExists(db: Database, sql: string, ...params: SQLQueryBindings[]): boolean {
    return queryCount(db, sql, ...params) > 0;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

/** Paginated query result with items and total count. */
export interface PaginatedResult<T> {
    items: T[];
    total: number;
}

// ─── Common Row Types ───────────────────────────────────────────────────────

/** Row with just a string ID (for SELECT id FROM ...). */
export interface IdRow { id: string }

/** Row with just a numeric ID. */
export interface NumericIdRow { id: number }

/** Stats row used by polling service. */
export interface PollingStatsRow {
    total: number;
    active: number;
    triggers: number;
}
