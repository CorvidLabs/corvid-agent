/**
 * Settings API routes — provides read/write access to system configuration
 * including credit config, operational mode info, AlgoChat status, and API key management.
 */

import type { Database } from 'bun:sqlite';
import { json } from '../lib/response';
import { parseBodyOrThrow, ValidationError, UpdateCreditConfigSchema } from '../lib/validation';
import type { RequestContext } from '../middleware/guards';
import {
    rotateApiKey,
    getApiKeyRotationStatus,
    setApiKeyExpiry,
    isApiKeyExpired,
    getApiKeyExpiryWarning,
    type AuthConfig,
} from '../middleware/auth';
import { recordAudit } from '../db/audit';

export function handleSettingsRoutes(req: Request, url: URL, db: Database, context?: RequestContext, authConfig?: AuthConfig | null): Response | Promise<Response> | null {
    // GET /api/settings — all settings (system metadata is admin-only)
    if (url.pathname === '/api/settings' && req.method === 'GET') {
        return handleGetSettings(db, context?.role === 'admin');
    }

    // PUT /api/settings/credits — update credit config
    if (url.pathname === '/api/settings/credits' && req.method === 'PUT') {
        return handleUpdateCreditConfig(req, db);
    }

    // POST /api/settings/api-key/rotate — rotate the API key (admin-only, guarded by ADMIN_PATHS)
    if (url.pathname === '/api/settings/api-key/rotate' && req.method === 'POST') {
        return handleApiKeyRotate(req, db, authConfig ?? null);
    }

    // GET /api/settings/api-key/status — get API key rotation + expiry status (admin-only)
    if (url.pathname === '/api/settings/api-key/status' && req.method === 'GET') {
        return handleApiKeyStatus(authConfig ?? null);
    }

    return null;
}

function handleGetSettings(db: Database, isAdmin: boolean): Response {
    // Credit configuration (public — users need to know rates)
    const creditRows = db.query(`SELECT key, value FROM credit_config`).all() as { key: string; value: string }[];
    const creditConfig: Record<string, string> = {};
    for (const row of creditRows) {
        creditConfig[row.key] = row.value;
    }

    const result: Record<string, unknown> = { creditConfig };

    // System stats — admin-only to avoid leaking operational metadata
    if (isAdmin) {
        const agentCount = (db.query(`SELECT COUNT(*) as c FROM agents`).get() as { c: number }).c;
        const projectCount = (db.query(`SELECT COUNT(*) as c FROM projects`).get() as { c: number }).c;
        const sessionCount = (db.query(`SELECT COUNT(*) as c FROM sessions`).get() as { c: number }).c;
        const schemaVersion = (db.query(`SELECT version FROM schema_version LIMIT 1`).get() as { version: number } | null)?.version ?? 0;

        result.system = {
            schemaVersion,
            agentCount,
            projectCount,
            sessionCount,
        };
    }

    return json(result);
}

async function handleUpdateCreditConfig(req: Request, db: Database): Promise<Response> {
    let data: Record<string, string | number>;
    try {
        data = await parseBodyOrThrow(req, UpdateCreditConfigSchema);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }

    const updates: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(data)) {
        updates.push({ key, value: String(value) });
    }

    const stmt = db.prepare(`INSERT OR REPLACE INTO credit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`);
    db.transaction(() => {
        for (const { key, value } of updates) {
            stmt.run(key, value);
        }
    })();

    return json({ ok: true, updated: updates.length });
}

async function handleApiKeyRotate(req: Request, db: Database, authConfig: AuthConfig | null): Promise<Response> {
    if (!authConfig) {
        return json({ error: 'Auth not configured' }, 503);
    }
    if (!authConfig.apiKey) {
        return json({ error: 'No API key configured (localhost mode)' }, 400);
    }

    // Parse optional body for ttlDays
    let ttlDays = 0;
    try {
        const body = await req.json() as { ttlDays?: number };
        if (body.ttlDays !== undefined) {
            ttlDays = typeof body.ttlDays === 'number' ? body.ttlDays : 0;
        }
    } catch {
        // Empty body is fine — use defaults
    }

    const newKey = rotateApiKey(authConfig);

    // Set expiry if ttlDays provided
    if (ttlDays > 0) {
        setApiKeyExpiry(authConfig, ttlDays * 24 * 60 * 60 * 1000);
    }

    // Audit log
    recordAudit(db, 'api_key_rotation', 'admin', 'api_key', null, JSON.stringify({
        ttlDays: ttlDays || null,
        expiresAt: authConfig.apiKeyExpiresAt ? new Date(authConfig.apiKeyExpiresAt).toISOString() : null,
    }));

    return json({
        ok: true,
        apiKey: newKey,
        expiresAt: authConfig.apiKeyExpiresAt ? new Date(authConfig.apiKeyExpiresAt).toISOString() : null,
        gracePeriodExpiry: authConfig.previousKeyExpiry
            ? new Date(authConfig.previousKeyExpiry).toISOString()
            : null,
    });
}

function handleApiKeyStatus(authConfig: AuthConfig | null): Response {
    if (!authConfig) {
        return json({ error: 'Auth not configured' }, 503);
    }

    const rotationStatus = getApiKeyRotationStatus(authConfig);
    const expired = isApiKeyExpired(authConfig);
    const warning = getApiKeyExpiryWarning(authConfig);

    return json({
        ...rotationStatus,
        expired,
        expiresAt: authConfig.apiKeyExpiresAt
            ? new Date(authConfig.apiKeyExpiresAt).toISOString()
            : null,
        warning,
    });
}
