import type { z } from 'zod';

// ─── Plugin Manifest ────────────────────────────────────────────────────────

export interface PluginManifest {
    /** Unique plugin name (a-z, 0-9, hyphens). Used in tool name namespacing. */
    name: string;
    /** Display version (semver) */
    version: string;
    /** Human-readable description */
    description: string;
    /** Plugin author */
    author: string;
    /** Capabilities the plugin requires */
    capabilities: PluginCapability[];
}

// ─── Capabilities ───────────────────────────────────────────────────────────

export type PluginCapability =
    | 'db:read'            // Read-only access to database
    | 'network:outbound'   // Make outbound HTTP requests
    | 'fs:project-dir'     // Read files in the project working directory
    | 'agent:read'         // Read agent configuration
    | 'session:read';      // Read session data

// ─── Plugin Tool ────────────────────────────────────────────────────────────

export interface CorvidPluginTool {
    /** Tool name (without prefix — will be namespaced as corvid_plugin_<pluginname>_<name>) */
    name: string;
    /** Tool description shown to agents */
    description: string;
    /** Zod schema for tool input validation */
    inputSchema: z.ZodType;
    /** Tool handler function */
    handler: (input: unknown, context: PluginToolContext) => Promise<string>;
}

// ─── Plugin Context ─────────────────────────────────────────────────────────

export interface PluginToolContext {
    /** The agent invoking this tool */
    agentId: string;
    /** The session this tool is running in */
    sessionId: string;
    /** Granted capabilities for this plugin */
    grantedCapabilities: PluginCapability[];
}

// ─── Plugin Interface ───────────────────────────────────────────────────────

export interface CorvidPlugin {
    /** Plugin manifest with metadata */
    manifest: PluginManifest;
    /** Tools provided by this plugin */
    tools: CorvidPluginTool[];
    /** Optional: called when plugin is loaded */
    onLoad?: () => Promise<void>;
    /** Optional: called when plugin is unloaded */
    onUnload?: () => Promise<void>;
}

// ─── Plugin DB Record ───────────────────────────────────────────────────────

export type PluginStatus = 'active' | 'disabled' | 'error';

export interface PluginRecord {
    name: string;
    packageName: string;
    version: string;
    description: string;
    author: string;
    capabilities: string; // JSON array
    status: PluginStatus;
    loadedAt: string;
    config: string; // JSON object
}

export interface PluginCapabilityRecord {
    pluginName: string;
    capability: PluginCapability;
    granted: boolean;
    grantedAt: string | null;
}
