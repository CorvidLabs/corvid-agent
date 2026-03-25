/**
 * `corvid-agent plugin` — manage plugins from the CLI.
 *
 * Wraps the /api/plugins REST endpoints so operators can
 * list, load, unload, and manage plugin capabilities.
 */

import { CorvidClient, type ApiError } from '../client';
import { loadConfig } from '../config';
import { c, printError, printSuccess, printHeader, printTable, Spinner } from '../render';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PluginInfo {
    name: string;
    version: string;
    description: string;
    toolCount: number;
}

interface PluginRecord {
    name: string;
    package_name: string;
    version: string;
    description: string;
    author: string;
    capabilities: string;
    status: string;
    loaded_at: string;
}

interface PluginListResponse {
    loaded: PluginInfo[];
    all: PluginRecord[];
}

export type PluginAction = 'list' | 'load' | 'unload' | 'grant' | 'revoke';

// ─── Main ───────────────────────────────────────────────────────────────────

export async function pluginCommand(
    action: PluginAction,
    args: { name?: string; packageName?: string; capability?: string },
): Promise<void> {
    const config = loadConfig();
    const client = new CorvidClient(config);

    switch (action) {
        case 'list':
            return listPlugins(client);
        case 'load':
            if (!args.packageName) {
                printError('Usage: corvid-agent plugin load <package-name> [--auto-grant]');
                process.exit(1);
            }
            return loadPlugin(client, args.packageName);
        case 'unload':
            if (!args.name) {
                printError('Usage: corvid-agent plugin unload <plugin-name>');
                process.exit(1);
            }
            return unloadPlugin(client, args.name);
        case 'grant':
            if (!args.name || !args.capability) {
                printError('Usage: corvid-agent plugin grant <plugin-name> <capability>');
                process.exit(1);
            }
            return grantCapability(client, args.name, args.capability);
        case 'revoke':
            if (!args.name || !args.capability) {
                printError('Usage: corvid-agent plugin revoke <plugin-name> <capability>');
                process.exit(1);
            }
            return revokeCapability(client, args.name, args.capability);
        default:
            printError(`Unknown action: ${action}. Use: list, load, unload, grant, revoke`);
            process.exit(1);
    }
}

// ─── List ───────────────────────────────────────────────────────────────────

async function listPlugins(client: CorvidClient): Promise<void> {
    const spinner = new Spinner('Fetching plugins...');
    spinner.start();

    try {
        const data = await client.get<PluginListResponse>('/api/plugins');
        spinner.stop();

        printHeader('Loaded Plugins');
        if (data.loaded.length > 0) {
            const rows = data.loaded.map(p => [
                p.name,
                p.version,
                String(p.toolCount),
                p.description.length > 50 ? p.description.slice(0, 47) + '...' : p.description,
            ]);
            printTable(['Name', 'Version', 'Tools', 'Description'], rows);
        } else {
            console.log(c.gray('  No plugins loaded'));
        }

        // Show inactive/disabled plugins
        const inactive = data.all.filter(p =>
            p.status !== 'active' || !data.loaded.some(l => l.name === p.name),
        );
        if (inactive.length > 0) {
            printHeader('Inactive Plugins');
            const rows = inactive.map(p => [
                p.name,
                p.version,
                p.status,
                p.package_name,
            ]);
            printTable(['Name', 'Version', 'Status', 'Package'], rows);
        }
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

// ─── Load ───────────────────────────────────────────────────────────────────

async function loadPlugin(client: CorvidClient, packageName: string): Promise<void> {
    const spinner = new Spinner(`Loading plugin from ${packageName}...`);
    spinner.start();

    try {
        await client.post<{ ok: boolean; message: string }>('/api/plugins/load', {
            packageName,
            autoGrant: true,
        });
        spinner.stop();
        printSuccess(`Plugin loaded from ${packageName}`);
    } catch (err) {
        spinner.stop();
        handleError(err);
    }
}

// ─── Unload ─────────────────────────────────────────────────────────────────

async function unloadPlugin(client: CorvidClient, name: string): Promise<void> {
    try {
        await client.post<{ ok: boolean }>(`/api/plugins/${encodeURIComponent(name)}/unload`, {});
        printSuccess(`Plugin ${name} unloaded`);
    } catch (err) {
        handleError(err);
    }
}

// ─── Grant / Revoke ─────────────────────────────────────────────────────────

async function grantCapability(client: CorvidClient, name: string, capability: string): Promise<void> {
    try {
        await client.post<{ ok: boolean }>(`/api/plugins/${encodeURIComponent(name)}/grant`, { capability });
        printSuccess(`${capability} granted to ${name}`);
    } catch (err) {
        handleError(err);
    }
}

async function revokeCapability(client: CorvidClient, name: string, capability: string): Promise<void> {
    try {
        await client.post<{ ok: boolean }>(`/api/plugins/${encodeURIComponent(name)}/revoke`, { capability });
        printSuccess(`${capability} revoked from ${name}`);
    } catch (err) {
        handleError(err);
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function handleError(err: unknown): void {
    if (err && typeof err === 'object' && 'message' in err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 401) {
            printError('Authentication required. Run: corvid-agent config set authToken <your-key>');
        } else if (apiErr.status === 503) {
            printError('Plugin system not available. Server may need restart.');
        } else {
            printError(apiErr.message);
        }
    } else {
        printError('Connection failed. Is the server running? Check: corvid-agent status');
    }
    process.exit(1);
}
