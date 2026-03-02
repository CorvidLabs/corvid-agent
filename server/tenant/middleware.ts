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
import type { TenantContext } from './types';
import { TenantService } from './context';
import { createLogger } from '../lib/logger';

const log = createLogger('TenantMiddleware');

/**
 * Extract tenant ID from a request.
 *
 * Priority: API key → X-Tenant-ID header → default.
 * If both API key and header are present and disagree, returns a 403 Response.
 */
export function extractTenantId(
    req: Request,
    db: Database,
    tenantService: TenantService,
): TenantContext | Response {
    if (!tenantService.isMultiTenant()) {
        return tenantService.resolveContext();
    }

    // 1. Resolve tenant from API key (authoritative source)
    let apiKeyTenantId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const row = db.query(
            'SELECT tenant_id FROM api_keys WHERE key_hash = ?',
        ).get(hashKey(token)) as { tenant_id: string } | null;

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
        return new Response(JSON.stringify({
            error: 'Forbidden: X-Tenant-ID header does not match API key tenant',
        }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
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
export function registerApiKey(
    db: Database,
    tenantId: string,
    key: string,
    label: string = 'default',
): void {
    const keyHash = hashKey(key);
    db.query(`
        INSERT OR REPLACE INTO api_keys (key_hash, tenant_id, label, created_at)
        VALUES (?, ?, ?, datetime('now'))
    `).run(keyHash, tenantId, label);

    log.info('Registered API key for tenant', { tenantId, label });
}

/**
 * Revoke an API key.
 */
export function revokeApiKey(db: Database, key: string): boolean {
    const keyHash = hashKey(key);
    const result = db.query('DELETE FROM api_keys WHERE key_hash = ?').run(keyHash);
    return result.changes > 0;
}

