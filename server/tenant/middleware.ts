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
 */
export function extractTenantId(
    req: Request,
    db: Database,
    tenantService: TenantService,
): TenantContext {
    if (!tenantService.isMultiTenant()) {
        return tenantService.resolveContext();
    }

    // 1. Check X-Tenant-ID header
    const headerTenantId = req.headers.get('x-tenant-id');
    if (headerTenantId) {
        return tenantService.resolveContext(headerTenantId);
    }

    // 2. Check API key → tenant mapping
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const row = db.query(
            'SELECT tenant_id FROM api_keys WHERE key_hash = ?',
        ).get(hashKey(token)) as { tenant_id: string } | null;

        if (row) {
            return tenantService.resolveContext(row.tenant_id);
        }
    }

    // 3. Default tenant
    return tenantService.resolveContext();
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

