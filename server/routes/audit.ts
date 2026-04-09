/**
 * Audit log API routes — read-only endpoint for querying the immutable audit log.
 */

import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { queryAuditLog } from '../db/audit';
import { json } from '../lib/response';
import { parseQuery } from '../lib/validation';

/** ISO 8601 date pattern (YYYY-MM-DD or full datetime). */
const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export const AuditQuerySchema = z.object({
  action: z.string().max(64).nullable().optional(),
  actor: z.string().max(128).nullable().optional(),
  resource_type: z.string().max(64).nullable().optional(),
  start_date: z.string().max(30).regex(isoDatePattern, 'Must be ISO 8601 date').nullable().optional(),
  end_date: z.string().max(30).regex(isoDatePattern, 'Must be ISO 8601 date').nullable().optional(),
  offset: z.string().regex(/^\d+$/, 'Must be a non-negative integer').nullable().optional(),
  limit: z.string().regex(/^\d+$/, 'Must be a non-negative integer').nullable().optional(),
});

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
export function handleAuditRoutes(_req: Request, url: URL, db: Database): Response | null {
  if (url.pathname !== '/api/audit-log') return null;

  const rawParams: Record<string, string | null> = {
    action: url.searchParams.get('action'),
    actor: url.searchParams.get('actor'),
    resource_type: url.searchParams.get('resource_type'),
    start_date: url.searchParams.get('start_date'),
    end_date: url.searchParams.get('end_date'),
    offset: url.searchParams.get('offset'),
    limit: url.searchParams.get('limit'),
  };

  const parsed = parseQuery(rawParams, AuditQuerySchema);
  if (parsed.error) {
    return json({ error: parsed.error }, 400);
  }

  const data = parsed.data!;
  const offset = data.offset ? parseInt(data.offset, 10) : 0;
  const limit = Math.min(data.limit ? parseInt(data.limit, 10) : 50, 500);

  const result = queryAuditLog(db, {
    action: data.action ?? undefined,
    actor: data.actor ?? undefined,
    resourceType: data.resource_type ?? undefined,
    startDate: data.start_date ?? undefined,
    endDate: data.end_date ?? undefined,
    offset,
    limit,
  });

  return json({
    entries: result.entries,
    total: result.total,
    offset,
    limit,
  });
}
