import type { CorvidPlugin } from './types';
import { validateCapabilities } from './permissions';
import { createLogger } from '../lib/logger';

const log = createLogger('PluginLoader');

// ─── Naming Convention ──────────────────────────────────────────────────────

const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function isValidPluginName(name: string): boolean {
    return PLUGIN_NAME_PATTERN.test(name) && name.length <= 50;
}

// ─── Manifest Validation ────────────────────────────────────────────────────

export interface ManifestValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateManifest(manifest: unknown): ManifestValidationResult {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['Manifest must be an object'] };
    }

    const m = manifest as Record<string, unknown>;

    if (typeof m.name !== 'string' || !isValidPluginName(m.name)) {
        errors.push('manifest.name must be a lowercase alphanumeric string with hyphens');
    }

    if (typeof m.version !== 'string' || m.version.length === 0) {
        errors.push('manifest.version must be a non-empty string');
    }

    if (typeof m.description !== 'string') {
        errors.push('manifest.description must be a string');
    }

    if (typeof m.author !== 'string') {
        errors.push('manifest.author must be a string');
    }

    if (!Array.isArray(m.capabilities)) {
        errors.push('manifest.capabilities must be an array');
    } else {
        const { invalid } = validateCapabilities(m.capabilities as string[]);
        if (invalid.length > 0) {
            errors.push(`Invalid capabilities: ${invalid.join(', ')}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ─── Dynamic Plugin Loading ─────────────────────────────────────────────────

export interface LoadResult {
    success: boolean;
    plugin?: CorvidPlugin;
    error?: string;
}

/**
 * Load a plugin from an npm package using dynamic import.
 * The package must have a default export or named `plugin` export
 * that conforms to the CorvidPlugin interface.
 */
export async function loadPluginFromPackage(packageName: string): Promise<LoadResult> {
    try {
        log.info('Loading plugin', { packageName });

        const module = await import(packageName);
        const plugin: CorvidPlugin = module.default ?? module.plugin;

        if (!plugin) {
            return { success: false, error: `Package ${packageName} does not export a CorvidPlugin (expected default or named 'plugin' export)` };
        }

        if (!plugin.manifest) {
            return { success: false, error: 'Plugin does not have a manifest' };
        }

        const validation = validateManifest(plugin.manifest);
        if (!validation.valid) {
            return { success: false, error: `Invalid manifest: ${validation.errors.join('; ')}` };
        }

        if (!Array.isArray(plugin.tools)) {
            return { success: false, error: 'Plugin does not export a tools array' };
        }

        // Validate tool naming
        for (const tool of plugin.tools) {
            if (!tool.name || typeof tool.name !== 'string') {
                return { success: false, error: 'All plugin tools must have a name' };
            }
            if (!tool.description || typeof tool.description !== 'string') {
                return { success: false, error: `Tool ${tool.name} must have a description` };
            }
            if (typeof tool.handler !== 'function') {
                return { success: false, error: `Tool ${tool.name} must have a handler function` };
            }
        }

        return { success: true, plugin };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to load plugin', { packageName, error: message });
        return { success: false, error: `Failed to import ${packageName}: ${message}` };
    }
}

/**
 * Build the namespaced tool name for a plugin tool.
 * Format: corvid_plugin_<pluginname>_<toolname>
 */
export function buildPluginToolName(pluginName: string, toolName: string): string {
    return `corvid_plugin_${pluginName.replace(/-/g, '_')}_${toolName}`;
}
