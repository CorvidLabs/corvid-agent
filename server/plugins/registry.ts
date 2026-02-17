import type { Database } from 'bun:sqlite';
import type { CorvidPlugin, CorvidPluginTool, PluginToolContext, PluginRecord } from './types';
import { loadPluginFromPackage, buildPluginToolName } from './loader';
import { getGrantedCapabilities, grantAllCapabilities } from './permissions';
import { createLogger } from '../lib/logger';

const log = createLogger('PluginRegistry');

// ─── Execution Timeout ──────────────────────────────────────────────────────

const TOOL_TIMEOUT_MS = 30_000;

// ─── Registry ───────────────────────────────────────────────────────────────

export class PluginRegistry {
    private plugins = new Map<string, CorvidPlugin>();
    private db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    // ─── Load / Unload ──────────────────────────────────────────────────

    async loadPlugin(packageName: string, autoGrant = false): Promise<{ success: boolean; error?: string }> {
        const result = await loadPluginFromPackage(packageName);
        if (!result.success || !result.plugin) {
            return { success: false, error: result.error };
        }

        const plugin = result.plugin;
        const name = plugin.manifest.name;

        if (this.plugins.has(name)) {
            return { success: false, error: `Plugin ${name} is already loaded` };
        }

        // Call onLoad hook
        if (plugin.onLoad) {
            try {
                await plugin.onLoad();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error('Plugin onLoad failed', { name, error: msg });
                return { success: false, error: `onLoad failed: ${msg}` };
            }
        }

        // Register in DB
        this.db.query(`
            INSERT INTO plugins (name, package_name, version, description, author, capabilities, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT(name) DO UPDATE SET
                package_name = excluded.package_name,
                version = excluded.version,
                description = excluded.description,
                author = excluded.author,
                capabilities = excluded.capabilities,
                status = 'active',
                loaded_at = datetime('now')
        `).run(
            name,
            packageName,
            plugin.manifest.version,
            plugin.manifest.description,
            plugin.manifest.author,
            JSON.stringify(plugin.manifest.capabilities),
        );

        // Auto-grant capabilities if requested
        if (autoGrant) {
            grantAllCapabilities(this.db, name, plugin.manifest.capabilities);
        }

        this.plugins.set(name, plugin);
        log.info('Plugin loaded', { name, version: plugin.manifest.version, tools: plugin.tools.length });

        return { success: true };
    }

    async unloadPlugin(name: string): Promise<{ success: boolean; error?: string }> {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            return { success: false, error: `Plugin ${name} is not loaded` };
        }

        // Call onUnload hook
        if (plugin.onUnload) {
            try {
                await plugin.onUnload();
            } catch (err) {
                log.warn('Plugin onUnload failed', { name, error: err instanceof Error ? err.message : String(err) });
            }
        }

        this.plugins.delete(name);

        // Update DB
        this.db.query("UPDATE plugins SET status = 'disabled' WHERE name = ?").run(name);

        log.info('Plugin unloaded', { name });
        return { success: true };
    }

    // ─── Tool Access ────────────────────────────────────────────────────

    /**
     * Get all tools from all loaded plugins, with namespaced names.
     */
    getPluginTools(): Array<{ name: string; description: string; inputSchema: unknown; pluginName: string; handler: CorvidPluginTool['handler'] }> {
        const tools: Array<{ name: string; description: string; inputSchema: unknown; pluginName: string; handler: CorvidPluginTool['handler'] }> = [];

        for (const [pluginName, plugin] of this.plugins) {
            for (const tool of plugin.tools) {
                tools.push({
                    name: buildPluginToolName(pluginName, tool.name),
                    description: `[${pluginName}] ${tool.description}`,
                    inputSchema: tool.inputSchema,
                    pluginName,
                    handler: tool.handler,
                });
            }
        }

        return tools;
    }

    /**
     * Execute a plugin tool with timeout and sandboxing.
     */
    async executeTool(
        toolName: string,
        input: unknown,
        context: PluginToolContext,
    ): Promise<{ result: string; error?: string }> {
        // Find the tool
        let foundTool: CorvidPluginTool | null = null;
        let foundPluginName: string | null = null;

        for (const [pluginName, plugin] of this.plugins) {
            for (const tool of plugin.tools) {
                if (buildPluginToolName(pluginName, tool.name) === toolName) {
                    foundTool = tool;
                    foundPluginName = pluginName;
                    break;
                }
            }
            if (foundTool) break;
        }

        if (!foundTool || !foundPluginName) {
            return { result: '', error: `Tool ${toolName} not found in any loaded plugin` };
        }

        // Check capabilities
        const grantedCaps = getGrantedCapabilities(this.db, foundPluginName);
        const requiredCaps = this.plugins.get(foundPluginName)?.manifest.capabilities ?? [];
        const missingCaps = requiredCaps.filter(c => !grantedCaps.includes(c));

        if (missingCaps.length > 0) {
            return { result: '', error: `Plugin ${foundPluginName} missing capabilities: ${missingCaps.join(', ')}` };
        }

        // Execute with timeout
        try {
            const result = await Promise.race([
                foundTool.handler(input, { ...context, grantedCapabilities: grantedCaps }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Tool execution timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS),
                ),
            ]);
            return { result };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error('Plugin tool execution failed', { toolName, pluginName: foundPluginName, error: message });
            return { result: '', error: message };
        }
    }

    // ─── Query ──────────────────────────────────────────────────────────

    getLoadedPlugins(): Array<{ name: string; version: string; description: string; toolCount: number }> {
        return Array.from(this.plugins.entries()).map(([name, plugin]) => ({
            name,
            version: plugin.manifest.version,
            description: plugin.manifest.description,
            toolCount: plugin.tools.length,
        }));
    }

    isLoaded(name: string): boolean {
        return this.plugins.has(name);
    }

    getPlugin(name: string): CorvidPlugin | undefined {
        return this.plugins.get(name);
    }

    /**
     * List all plugins from DB (including disabled ones).
     */
    listAllPlugins(): PluginRecord[] {
        return this.db.query('SELECT * FROM plugins ORDER BY loaded_at DESC').all() as PluginRecord[];
    }
}
