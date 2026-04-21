import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod/v4';
import { runMigrations } from '../db/schema';
import { PluginRegistry } from '../plugins/registry';
import { buildPluginSdkTools } from '../plugins/sdk-bridge';
import type { CorvidPlugin } from '../plugins/types';

// ─── DB Setup ───────────────────────────────────────────────────────────────

function setupDb(): Database {
  const d = new Database(':memory:');
  runMigrations(d);
  d.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      name TEXT PRIMARY KEY,
      package_name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT DEFAULT '',
      author TEXT DEFAULT '',
      capabilities TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'active',
      loaded_at TEXT DEFAULT (datetime('now')),
      config TEXT DEFAULT '{}'
    )
  `);
  d.exec(`
    CREATE TABLE IF NOT EXISTS plugin_capabilities (
      plugin_name TEXT NOT NULL,
      capability TEXT NOT NULL,
      granted INTEGER DEFAULT 0,
      granted_at TEXT DEFAULT NULL,
      PRIMARY KEY (plugin_name, capability)
    )
  `);
  return d;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function injectPlugin(registry: PluginRegistry, plugin: CorvidPlugin): void {
  // Access private map via type cast for test injection
  (registry as unknown as { plugins: Map<string, CorvidPlugin> }).plugins.set(plugin.manifest.name, plugin);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildPluginSdkTools', () => {
  let db: Database;
  let registry: PluginRegistry;

  beforeEach(() => {
    db = setupDb();
    registry = new PluginRegistry(db);
  });

  test('returns empty array when no plugins loaded', () => {
    const tools = buildPluginSdkTools(registry, 'agent-1', 'session-1');
    expect(tools).toEqual([]);
  });

  test('creates one SDK tool per plugin tool', () => {
    const plugin: CorvidPlugin = {
      manifest: { name: 'my-plugin', version: '1.0.0', description: 'Test', author: 'Test', capabilities: [] },
      tools: [
        {
          name: 'greet',
          description: 'Say hello',
          inputSchema: z.object({ name: z.string() }),
          handler: async (input: unknown) => `Hello, ${(input as { name: string }).name}!`,
        },
      ],
    };
    injectPlugin(registry, plugin);

    const tools = buildPluginSdkTools(registry, 'agent-1', 'session-1');
    expect(tools.length).toBe(1);
  });

  test('tool name matches plugin namespacing convention', () => {
    const plugin: CorvidPlugin = {
      manifest: { name: 'my-plugin', version: '1.0.0', description: 'Test', author: 'Test', capabilities: [] },
      tools: [
        {
          name: 'do-thing',
          description: 'Does a thing',
          inputSchema: z.object({ input: z.string() }),
          handler: async () => 'done',
        },
      ],
    };
    injectPlugin(registry, plugin);

    const tools = buildPluginSdkTools(registry, 'agent-1', 'session-1');
    // buildPluginToolName replaces hyphens in plugin name only, not tool name
    expect(tools[0].name).toBe('corvid_plugin_my_plugin_do-thing');
  });

  test('handles non-ZodObject schema with passthrough fallback', () => {
    const plugin: CorvidPlugin = {
      manifest: { name: 'simple', version: '1.0.0', description: 'Test', author: 'Test', capabilities: [] },
      tools: [
        {
          name: 'ping',
          description: 'Ping',
          inputSchema: z.any(),
          handler: async () => 'pong',
        },
      ],
    };
    injectPlugin(registry, plugin);

    // Should not throw when building tools with non-ZodObject schemas
    expect(() => buildPluginSdkTools(registry, 'agent-1', 'session-1')).not.toThrow();
    const tools = buildPluginSdkTools(registry, 'agent-1', 'session-1');
    expect(tools.length).toBe(1);
  });

  test('creates tools for multiple plugins', () => {
    for (const name of ['alpha', 'beta']) {
      injectPlugin(registry, {
        manifest: { name, version: '1.0.0', description: name, author: 'Test', capabilities: [] },
        tools: [
          {
            name: 'run',
            description: `Run ${name}`,
            inputSchema: z.object({}),
            handler: async () => name,
          },
        ],
      });
    }

    const tools = buildPluginSdkTools(registry, 'agent-1', 'session-1');
    expect(tools.length).toBe(2);
  });
});
