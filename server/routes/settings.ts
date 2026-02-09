/**
 * Settings API routes — provides read/write access to system configuration
 * including credit config, operational mode info, and AlgoChat status.
 */

import type { Database } from 'bun:sqlite';

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

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
    let body: Record<string, string>;
    try {
        body = await req.json() as Record<string, string>;
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const allowedKeys = [
        'credits_per_algo',
        'low_credit_threshold',
        'reserve_per_group_message',
        'credits_per_turn',
        'credits_per_agent_message',
        'free_credits_on_first_message',
    ];

    const updates: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(body)) {
        if (!allowedKeys.includes(key)) {
            return json({ error: `Unknown config key: ${key}` }, 400);
        }
        if (typeof value !== 'string' && typeof value !== 'number') {
            return json({ error: `Invalid value for ${key}` }, 400);
        }
        updates.push({ key, value: String(value) });
    }

    if (updates.length === 0) {
        return json({ error: 'No valid config keys provided' }, 400);
    }

    const stmt = db.prepare(`INSERT OR REPLACE INTO credit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`);
    db.transaction(() => {
        for (const { key, value } of updates) {
            stmt.run(key, value);
        }
    })();

    return json({ ok: true, updated: updates.length });
}
