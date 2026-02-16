import type { PluginRegistry } from '../plugins/registry';
import { grantCapability, revokeCapability, isValidCapability } from '../plugins/permissions';
import { json } from '../lib/response';
import type { Database } from 'bun:sqlite';
import type { PluginCapability } from '../plugins/types';

export function handlePluginRoutes(
    req: Request,
    url: URL,
    db: Database,
    pluginRegistry: PluginRegistry | null,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (!pluginRegistry) {
        if (path.startsWith('/api/plugins')) {
            return json({ error: 'Plugin system not available' }, 503);
        }
        return null;
    }

    // GET /api/plugins — list all plugins
    if (path === '/api/plugins' && method === 'GET') {
        const loaded = pluginRegistry.getLoadedPlugins();
        const all = pluginRegistry.listAllPlugins();
        return json({ loaded, all });
    }

    // POST /api/plugins/load — load a plugin
    if (path === '/api/plugins/load' && method === 'POST') {
        return handleLoad(req, pluginRegistry);
    }

    // POST /api/plugins/:name/unload — unload a plugin
    const unloadMatch = path.match(/^\/api\/plugins\/([^/]+)\/unload$/);
    if (unloadMatch && method === 'POST') {
        return handleUnload(unloadMatch[1], pluginRegistry);
    }

    // POST /api/plugins/:name/grant — grant a capability
    const grantMatch = path.match(/^\/api\/plugins\/([^/]+)\/grant$/);
    if (grantMatch && method === 'POST') {
        return handleGrant(req, db, grantMatch[1]);
    }

    // POST /api/plugins/:name/revoke — revoke a capability
    const revokeMatch = path.match(/^\/api\/plugins\/([^/]+)\/revoke$/);
    if (revokeMatch && method === 'POST') {
        return handleRevoke(req, db, revokeMatch[1]);
    }

    return null;
}

async function handleLoad(req: Request, registry: PluginRegistry): Promise<Response> {
    try {
        const body = await req.json() as { packageName?: string; autoGrant?: boolean };
        const packageName = body.packageName?.trim();
        if (!packageName) {
            return json({ error: 'packageName is required' }, 400);
        }
        const result = await registry.loadPlugin(packageName, body.autoGrant ?? false);
        if (!result.success) {
            return json({ error: result.error }, 400);
        }
        return json({ ok: true, message: `Plugin loaded from ${packageName}` });
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
}

async function handleUnload(name: string, registry: PluginRegistry): Promise<Response> {
    const result = await registry.unloadPlugin(name);
    if (!result.success) {
        return json({ error: result.error }, 404);
    }
    return json({ ok: true, message: `Plugin ${name} unloaded` });
}

async function handleGrant(req: Request, db: Database, pluginName: string): Promise<Response> {
    try {
        const body = await req.json() as { capability?: string };
        const cap = body.capability?.trim();
        if (!cap || !isValidCapability(cap)) {
            return json({ error: 'Invalid capability. Valid: db:read, network:outbound, fs:project-dir, agent:read, session:read' }, 400);
        }
        grantCapability(db, pluginName, cap as PluginCapability);
        return json({ ok: true, message: `${cap} granted to ${pluginName}` });
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
}

async function handleRevoke(req: Request, db: Database, pluginName: string): Promise<Response> {
    try {
        const body = await req.json() as { capability?: string };
        const cap = body.capability?.trim();
        if (!cap || !isValidCapability(cap)) {
            return json({ error: 'Invalid capability' }, 400);
        }
        revokeCapability(db, pluginName, cap as PluginCapability);
        return json({ ok: true, message: `${cap} revoked from ${pluginName}` });
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
}
