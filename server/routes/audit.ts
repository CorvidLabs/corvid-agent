/**
 * Audit log API routes — read-only endpoint for querying the immutable audit log.
 */

import type { Database } from 'bun:sqlite';
import { queryAuditLog } from '../db/audit';
import { json } from '../lib/response';

/**
 * Handle GET /api/audit-log
 *
 * Query parameters:
 *   action        - Filter by action type
 *   actor         - Filter by actor
 *   resource_type - Filter by resource type
 *   start_date    - Filter entries after this ISO date
 *   end_date      - Filter entries before this ISO date
 *   offset        - Pagination offset (default: 0)
 *   limit         - Page size (default: 50, max: 500)
 */
export function handleAuditRoutes(
    _req: Request,
    url: URL,
    db: Database,
): Response | null {
    if (url.pathname !== '/api/audit-log') return null;

    const action = url.searchParams.get('action') ?? undefined;
    const actor = url.searchParams.get('actor') ?? undefined;
    const resourceType = url.searchParams.get('resource_type') ?? undefined;
    const startDate = url.searchParams.get('start_date') ?? undefined;
    const endDate = url.searchParams.get('end_date') ?? undefined;
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

    const result = queryAuditLog(db, {
        action,
        actor,
        resourceType,
        startDate,
        endDate,
        offset: isNaN(offset) ? 0 : offset,
        limit: isNaN(limit) ? 50 : limit,
    });

    return json({
        entries: result.entries,
        total: result.total,
        offset: isNaN(offset) ? 0 : offset,
        limit: isNaN(limit) ? 50 : limit,
    });
}
