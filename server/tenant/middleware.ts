/**
 * Tenant Middleware — Extracts tenant context from requests.
 *
 * In multi-tenant mode, looks for tenant ID in:
 * 1. X-Tenant-ID header
 * 2. JWT claim (when using auth flow tokens)
 * 3. API key mapping (each API key belongs to a tenant)
 *
 * In single-tenant mode, always returns the default tenant.
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import type { TenantService } from './context';
import type { TenantContext } from './types';

const log = createLogger('TenantMiddleware');

/**
 * Extract tenant ID from a request.
 *
 * Priority: API key → X-Tenant-ID header → default.
 * If both API key and header are present and disagree, returns a 403 Response.
 */
export function extractTenantId(req: Request, db: Database, tenantService: TenantService): TenantContext | Response {
  if (!tenantService.isMultiTenant()) {
    return tenantService.resolveContext();
  }

  // 1. Resolve tenant from API key (authoritative source)
  let apiKeyTenantId: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const row = db.query('SELECT tenant_id FROM api_keys WHERE key_hash = ?').get(hashKey(token)) as {
      tenant_id: string;
    } | null;

    if (row) {
      apiKeyTenantId = row.tenant_id;
    }
  }

  // 2. Check X-Tenant-ID header
  const headerTenantId = req.headers.get('x-tenant-id');

  // 3. If both present and mismatch → 403
  if (apiKeyTenantId && headerTenantId && apiKeyTenantId !== headerTenantId) {
    log.warn('Tenant ID mismatch: API key vs header', {
      apiKeyTenant: apiKeyTenantId,
      headerTenant: headerTenantId,
    });
    return new Response(
      JSON.stringify({
        error: 'Forbidden: X-Tenant-ID header does not match API key tenant',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // 4. API key takes precedence, then header, then default
  const resolvedTenantId = apiKeyTenantId ?? headerTenantId ?? undefined;
  return tenantService.resolveContext(resolvedTenantId);
}

/**
 * Synchronous hash for key lookup (uses Bun's built-in hasher).
 */
function hashKey(key: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(key);
  return hasher.digest('hex');
}

/**
 * Register an API key for a tenant.
 */
export function registerApiKey(db: Database, tenantId: string, key: string, label: string = 'default'): void {
  const keyHash = hashKey(key);
  db.query(`
        INSERT OR REPLACE INTO api_keys (key_hash, tenant_id, label, created_at)
        VALUES (?, ?, ?, datetime('now'))
    `).run(keyHash, tenantId, label);

  log.info('Registered API key for tenant', { tenantId, label });
}

/**
 * Register a tenant member by email address (for proxy-trust mode).
 * Used when oauth2-proxy provides X-Forwarded-Email and the backend
 * maps the email to a tenant member role.
 *
 * The `key_hash` is derived from the email so the primary key constraint
 * is satisfied without requiring an actual API key.
 */
export function registerMemberByEmail(
  db: Database,
  tenantId: string,
  email: string,
  role: 'owner' | 'operator' | 'viewer' = 'viewer',
): void {
  // Use a deterministic key_hash from tenantId+email so upsert is idempotent
  const keyHash = hashKey(`email:${tenantId}:${email}`);
  db.query(`
        INSERT INTO tenant_members (tenant_id, key_hash, role, email)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id, key_hash) DO UPDATE SET role = excluded.role, email = excluded.email, updated_at = datetime('now')
    `).run(tenantId, keyHash, role, email);

  log.info('Registered tenant member by email', { tenantId, email, role });
}

/**
 * Look up a tenant member by email address within a tenant.
 * Returns the role, or null if the email is not registered.
 */
export function getMemberRoleByEmail(db: Database, tenantId: string, email: string): string | null {
  const row = db.query('SELECT role FROM tenant_members WHERE tenant_id = ? AND email = ?').get(tenantId, email) as {
    role: string;
  } | null;
  return row?.role ?? null;
}

/**
 * Revoke an API key.
 */
export function revokeApiKey(db: Database, key: string): boolean {
  const keyHash = hashKey(key);
  const result = db.query('DELETE FROM api_keys WHERE key_hash = ?').run(keyHash);
  return result.changes > 0;
}
