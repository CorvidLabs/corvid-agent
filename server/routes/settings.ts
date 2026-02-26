/**
 * Settings API routes — provides read/write access to system configuration
 * including credit config, operational mode info, and AlgoChat status.
 */

import type { Database } from 'bun:sqlite';
import { json } from '../lib/response';
import { parseBodyOrThrow, ValidationError, UpdateCreditConfigSchema } from '../lib/validation';

export function handleSettingsRoutes(req: Request, url: URL, db: Database): Response | Promise<Response> | null {
    // GET /api/settings — all settings
    if (url.pathname === '/api/settings' && req.method === 'GET') {
        return handleGetSettings(db);
    }

    // PUT /api/settings/credits — update credit config
    if (url.pathname === '/api/settings/credits' && req.method === 'PUT') {
        return handleUpdateCreditConfig(req, db);
    }

    return null;
}

function handleGetSettings(db: Database): Response {
    // Credit configuration
    const creditRows = db.query(`SELECT key, value FROM credit_config`).all() as { key: string; value: string }[];
    const creditConfig: Record<string, string> = {};
    for (const row of creditRows) {
        creditConfig[row.key] = row.value;
    }

    // System stats
    const agentCount = (db.query(`SELECT COUNT(*) as c FROM agents`).get() as { c: number }).c;
    const projectCount = (db.query(`SELECT COUNT(*) as c FROM projects`).get() as { c: number }).c;
    const sessionCount = (db.query(`SELECT COUNT(*) as c FROM sessions`).get() as { c: number }).c;
    const schemaVersion = (db.query(`SELECT version FROM schema_version LIMIT 1`).get() as { version: number } | null)?.version ?? 0;

    return json({
        creditConfig,
        system: {
            schemaVersion,
            agentCount,
            projectCount,
            sessionCount,
        },
    });
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
