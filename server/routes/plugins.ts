import type { PluginRegistry } from '../plugins/registry';
import { grantCapability, revokeCapability } from '../plugins/permissions';
import { json, handleRouteError } from '../lib/response';
import { parseBodyOrThrow, ValidationError, LoadPluginSchema, PluginCapabilityActionSchema } from '../lib/validation';
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
        const data = await parseBodyOrThrow(req, LoadPluginSchema);
        const result = await registry.loadPlugin(data.packageName, data.autoGrant);
        if (!result.success) {
            return json({ error: result.error }, 400);
        }
        return json({ ok: true, message: `Plugin loaded from ${data.packageName}` });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
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
        const data = await parseBodyOrThrow(req, PluginCapabilityActionSchema);
        grantCapability(db, pluginName, data.capability as PluginCapability);
        return json({ ok: true, message: `${data.capability} granted to ${pluginName}` });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}

async function handleRevoke(req: Request, db: Database, pluginName: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, PluginCapabilityActionSchema);
        revokeCapability(db, pluginName, data.capability as PluginCapability);
        return json({ ok: true, message: `${data.capability} revoked from ${pluginName}` });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}
