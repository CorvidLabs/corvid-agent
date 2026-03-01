/**
 * DB Filter — Row-level tenant isolation for database queries.
 *
 * Provides helpers that append WHERE tenant_id = ? to queries,
 * ensuring that all data access is scoped to the current tenant.
 *
 * In single-tenant mode (default tenant), the filter is a no-op
 * for backwards compatibility.
 */
import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { DEFAULT_TENANT_ID } from './types';

/**
 * Tables that have a tenant_id column in multi-tenant mode.
 * When adding multi-tenant support, these tables get a tenant_id column
 * via migration, defaulting to 'default' for existing rows.
 */
export const TENANT_SCOPED_TABLES = [
    'projects',
    'agents',
    'sessions',
    'session_messages',
    'work_tasks',
    'marketplace_listings',
    'agent_reputation',
    'sandbox_configs',
    'notification_channels',
] as const;

/**
 * Append a tenant filter to a WHERE clause.
 * Returns the modified query string and the binding value.
 *
 * If tenantId is the default, returns the original query unchanged
 * (single-tenant backwards compatibility).
 */
export function withTenantFilter(
    query: string,
    tenantId: string,
): { query: string; bindings: SQLQueryBindings[] } {
    if (tenantId === DEFAULT_TENANT_ID) {
        return { query, bindings: [] };
    }

    // Find the position to insert the tenant filter.
    // Insert before ORDER BY, LIMIT, GROUP BY, HAVING — or at end.
    const tailMatch = query.search(/\b(ORDER|LIMIT|GROUP|HAVING)\b/i);
    const insertPos = tailMatch > -1 ? tailMatch : query.length;

    const hasWhere = /\bWHERE\b/i.test(query);
    const clause = hasWhere ? 'AND tenant_id = ?' : 'WHERE tenant_id = ?';

    const before = query.slice(0, insertPos).trimEnd();
    const after = query.slice(insertPos).trimStart();

    return {
        query: after ? `${before} ${clause} ${after}` : `${before} ${clause}`,
        bindings: [tenantId],
    };
}

/**
 * Execute a SELECT query with tenant scoping.
 */
export function tenantQuery<T>(
    db: Database,
    query: string,
    tenantId: string,
    ...params: SQLQueryBindings[]
): T[] {
    const filtered = withTenantFilter(query, tenantId);
    return db.query(filtered.query).all(
        ...params,
        ...filtered.bindings,
    ) as T[];
}

/**
 * Execute a SELECT query returning a single row with tenant scoping.
 */
export function tenantQueryGet<T>(
    db: Database,
    query: string,
    tenantId: string,
    ...params: SQLQueryBindings[]
): T | null {
    const filtered = withTenantFilter(query, tenantId);
    return db.query(filtered.query).get(
        ...params,
        ...filtered.bindings,
    ) as T | null;
}

/**
 * Validate that a resource belongs to the given tenant.
 * Used for mutation operations (UPDATE, DELETE) to prevent cross-tenant access.
 */
/** Allowlist of valid identifier characters for SQL column/table names. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function validateTenantOwnership(
    db: Database,
    table: string,
    resourceId: string,
    tenantId: string,
    idColumn: string = 'id',
): boolean {
    if (tenantId === DEFAULT_TENANT_ID) return true;

    // Validate identifiers against allowlist to prevent SQL injection
    if (!TENANT_SCOPED_TABLES.includes(table as typeof TENANT_SCOPED_TABLES[number])) {
        throw new Error(`validateTenantOwnership: table '${table}' is not in TENANT_SCOPED_TABLES`);
    }
    if (!SAFE_IDENTIFIER.test(idColumn)) {
        throw new Error(`validateTenantOwnership: invalid idColumn '${idColumn}'`);
    }

    const row = db.query(
        `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ? AND tenant_id = ?`,
    ).get(resourceId, tenantId);

    return row !== null;
}
