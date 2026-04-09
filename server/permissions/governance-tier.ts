/**
 * Governance Permission Tiers — Layer 0 enforcement (Issue #1038).
 *
 * Defines the PermissionTier enum and implements the requirePermissionTier
 * guard that gates all governance API actions. This is the foundational tier
 * check (Layer 0) that runs before any governance operation executes.
 *
 * Resolution order:
 *   1. API role from authGuard (context.role = 'admin' → Owner)
 *   2. Tenant role from tenantGuard (context.tenantRole → mapped tier)
 *   3. DB grant lookup via wallet address (council:* → Operator, * → Owner)
 *   4. Authenticated with no specific role → Agent
 *   5. Default: Guest (unauthenticated or unknown)
 *
 * Layer 0 only — Layer 1 (on-chain) and Layer 2 (cross-agent delegation)
 * are not implemented here.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import type { Guard, RequestContext } from '../middleware/guards';

const log = createLogger('GovernanceTier');

// ─── PermissionTier enum ──────────────────────────────────────────────────────

/**
 * Permission tier hierarchy for governance API access.
 *
 * Tiers are ordered: Owner > Operator > Agent > Guest.
 * A caller must meet or exceed the minimum tier required for an action.
 */
export enum PermissionTier {
  /** Unauthenticated or unknown caller. No governance write access. */
  Guest = 0,
  /** Authenticated agent with basic access. Read-only governance. */
  Agent = 1,
  /** Operational access. Can execute most governance operations. */
  Operator = 2,
  /** Full governance control. Human approval and constitutional actions. */
  Owner = 3,
}

/** Human-readable names for each tier (server-side logging only). */
export const PERMISSION_TIER_NAMES: Readonly<Record<PermissionTier, string>> = {
  [PermissionTier.Guest]: 'Guest',
  [PermissionTier.Agent]: 'Agent',
  [PermissionTier.Operator]: 'Operator',
  [PermissionTier.Owner]: 'Owner',
};

// ─── Route tier annotations ───────────────────────────────────────────────────

/**
 * Documents the minimum PermissionTier required for each governance route.
 * This is a documentation artifact — runtime enforcement is via requirePermissionTier().
 */
export const GOVERNANCE_ROUTE_TIERS: Readonly<Record<string, PermissionTier>> = {
  // Council CRUD
  'GET /api/councils': PermissionTier.Agent,
  'POST /api/councils': PermissionTier.Operator,
  'GET /api/councils/:id': PermissionTier.Agent,
  'PUT /api/councils/:id': PermissionTier.Operator,
  'DELETE /api/councils/:id': PermissionTier.Operator,
  'POST /api/councils/:id/launch': PermissionTier.Operator,
  'GET /api/councils/:id/launches': PermissionTier.Agent,
  // Council launches
  'GET /api/council-launches': PermissionTier.Agent,
  'GET /api/council-launches/:id': PermissionTier.Agent,
  'GET /api/council-launches/:id/logs': PermissionTier.Agent,
  'GET /api/council-launches/:id/discussion-messages': PermissionTier.Agent,
  'POST /api/council-launches/:id/abort': PermissionTier.Operator,
  'POST /api/council-launches/:id/review': PermissionTier.Operator,
  'POST /api/council-launches/:id/synthesize': PermissionTier.Operator,
  'POST /api/council-launches/:id/chat': PermissionTier.Operator,
  // Governance voting
  'GET /api/council-launches/:id/vote': PermissionTier.Agent,
  'POST /api/council-launches/:id/vote': PermissionTier.Operator,
  'POST /api/council-launches/:id/vote/approve': PermissionTier.Owner,
  // Proposals
  'GET /api/proposals': PermissionTier.Agent,
  'POST /api/proposals': PermissionTier.Operator,
  'GET /api/proposals/:id': PermissionTier.Agent,
  'PUT /api/proposals/:id': PermissionTier.Operator,
  'DELETE /api/proposals/:id': PermissionTier.Operator,
  'POST /api/proposals/:id/transition': PermissionTier.Operator,
  'GET /api/proposals/:id/evaluate': PermissionTier.Agent,
};

// ─── Tier resolution ──────────────────────────────────────────────────────────

/**
 * Maps API-level and tenant roles to PermissionTier values.
 * Unknown or missing roles default to Guest via the fallback logic in resolveCallerTier.
 */
const ROLE_TO_TIER: Readonly<Record<string, PermissionTier>> = {
  // API-level role set by authGuard when ADMIN_API_KEY matches
  admin: PermissionTier.Owner,
  // Tenant roles set by tenantGuard from DB lookup
  owner: PermissionTier.Owner,
  operator: PermissionTier.Operator,
  developer: PermissionTier.Agent,
  viewer: PermissionTier.Agent,
  communicator: PermissionTier.Agent,
};

/**
 * Look up a caller's governance tier from their active permission grants.
 * Used as a fallback when no role is available but a wallet address is known.
 *
 * Checks for:
 *   - Superuser wildcard ('*') → Owner
 *   - Council namespace wildcard ('council:*') → Operator
 *   - Council manage action ('council:manage') → Operator
 */
function lookupGrantTier(db: Database, agentId: string): PermissionTier | null {
  const now = new Date().toISOString();
  const row = db
    .query(`
        SELECT action FROM permission_grants
        WHERE agent_id = ?
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)
          AND (action = '*' OR action = 'council:*' OR action = 'council:manage')
        ORDER BY
          CASE action WHEN '*' THEN 0 WHEN 'council:*' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 1
    `)
    .get(agentId, now) as { action: string } | null;

  if (!row) return null;
  if (row.action === '*') return PermissionTier.Owner;
  return PermissionTier.Operator; // council:* or council:manage
}

/**
 * Resolve the PermissionTier for the caller identified by RequestContext.
 *
 * Resolution order:
 *  1. API role ('admin') → Owner
 *  2. Tenant role (from tenantGuard) → mapped tier
 *  3. DB grant lookup (via wallet address) → tier from permission_grants
 *  4. Authenticated with no specific signals → Agent
 *  5. Unauthenticated → Guest
 *
 * @param context - The resolved request context from auth/tenant middleware.
 * @param db      - Optional DB handle for grant-based tier lookup.
 */
export function resolveCallerTier(context: RequestContext, db?: Database): PermissionTier {
  // Admin API key — highest trust
  if (context.role === 'admin') {
    return PermissionTier.Owner;
  }

  // Tenant role mapping (multi-tenant mode via tenantGuard)
  if (context.tenantRole) {
    const tier = ROLE_TO_TIER[context.tenantRole];
    if (tier !== undefined) return tier;
  }

  // DB grant lookup using wallet address as agent identity
  if (db && context.walletAddress) {
    const grantTier = lookupGrantTier(db, context.walletAddress);
    if (grantTier !== null) return grantTier;
  }

  // Authenticated but no specific tier signal → Agent (basic access)
  if (context.authenticated) {
    return PermissionTier.Agent;
  }

  // Unknown or unauthenticated caller
  return PermissionTier.Guest;
}

// ─── Guard factory ────────────────────────────────────────────────────────────

/**
 * Middleware guard that enforces a minimum PermissionTier for a governance route.
 *
 * Returns null (allow) if the caller meets or exceeds the required tier.
 * Returns a 403 JSON response with a generic error code on denial.
 * Logs all checks server-side — never exposes tier details in the response body.
 *
 * Usage in a route handler:
 * ```typescript
 *   if (context) {
 *     const denied = requirePermissionTier(PermissionTier.Operator, db)(req, url, context);
 *     if (denied) return denied;
 *   }
 * ```
 *
 * @param minTier - The minimum tier required to proceed.
 * @param db      - Optional DB handle for grant-based tier lookup.
 */
export function requirePermissionTier(minTier: PermissionTier, db?: Database): Guard {
  return (req: Request, url: URL, context: RequestContext): Response | null => {
    const callerTier = resolveCallerTier(context, db);
    const allowed = callerTier >= minTier;

    log.info('Governance tier check', {
      path: url.pathname,
      method: req.method,
      callerTier: PERMISSION_TIER_NAMES[callerTier],
      requiredTier: PERMISSION_TIER_NAMES[minTier],
      allowed,
    });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'ERR_INSUFFICIENT_TIER', code: 'GOVERNANCE_TIER_403' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return null;
  };
}
