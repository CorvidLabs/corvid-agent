/**
 * Shared tenant resolution helpers for broadcasting and event routing.
 *
 * Returns `undefined` when the resource belongs to the default tenant
 * (or when multi-tenant mode is off), so callers can use flat topics.
 */

import type { Database } from 'bun:sqlite';
import { DEFAULT_TENANT_ID } from './types';

/**
 * Resolve the tenant for an agent.
 *
 * @param multiTenant - Pass `false` to always return `undefined` (single-tenant shortcut).
 *                      Defaults to `true` so callers that already filtered can omit it.
 */
export function resolveAgentTenant(db: Database, agentId: string, multiTenant = true): string | undefined {
  if (!multiTenant) return undefined;
  const row = db.query('SELECT tenant_id FROM agents WHERE id = ?').get(agentId) as { tenant_id: string } | null;
  const tid = row?.tenant_id;
  return tid && tid !== DEFAULT_TENANT_ID ? tid : undefined;
}

/**
 * Resolve the tenant for a council launch (via its first session's agent).
 */
export function resolveCouncilTenant(db: Database, launchId: string, multiTenant = true): string | undefined {
  if (!multiTenant) return undefined;
  const row = db
    .query(
      `SELECT a.tenant_id FROM sessions s
         JOIN agents a ON s.agent_id = a.id
         WHERE s.council_launch_id = ? LIMIT 1`,
    )
    .get(launchId) as { tenant_id: string } | null;
  const tid = row?.tenant_id;
  return tid && tid !== DEFAULT_TENANT_ID ? tid : undefined;
}
