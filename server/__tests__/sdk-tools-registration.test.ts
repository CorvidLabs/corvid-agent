import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { runMigrations } from '../db/schema';

const capturedTools: Array<{ name: string }> = [];

mock.module('@anthropic-ai/claude-agent-sdk', () => {
  return {
    tool(name: string, description: string, schema: Record<string, unknown>, handler: (...args: unknown[]) => unknown) {
      const t = { name, description, inputSchema: schema, handler };
      return t;
    },
    createSdkMcpServer(opts: { tools: Array<{ name: string }> }) {
      capturedTools.length = 0;
      capturedTools.push(...opts.tools);
      return { tools: opts.tools };
    },
  };
});

const { createCorvidMcpServer } = await import('../mcp/sdk-tools');

import type { McpToolContext } from '../mcp/tool-handlers/types';

const AGENT_ID = 'test-sdk-tools-agent';
let db: Database;

function createCtx(overrides?: Partial<McpToolContext>): McpToolContext {
  return {
    agentId: AGENT_ID,
    db,
    sessionSource: 'web',
    agentMessenger: {} as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {
      getAlgoChatService: () => ({ indexerClient: null }),
    } as unknown as McpToolContext['agentWalletService'],
    network: 'localnet',
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query('INSERT INTO agents (id, name) VALUES (?, ?)').run(AGENT_ID, 'TestAgent');
});

afterEach(() => db.close());

describe('createCorvidMcpServer tool registration', () => {
  test('registers observation tools', () => {
    createCorvidMcpServer(createCtx());
    const toolNames = capturedTools.map((t) => t.name);
    expect(toolNames).toContain('corvid_record_observation');
    expect(toolNames).toContain('corvid_list_observations');
    expect(toolNames).toContain('corvid_boost_observation');
    expect(toolNames).toContain('corvid_dismiss_observation');
    expect(toolNames).toContain('corvid_observation_stats');
  });

  test('registers core tools alongside observation tools', () => {
    createCorvidMcpServer(createCtx());
    const toolNames = capturedTools.map((t) => t.name);
    expect(toolNames).toContain('corvid_send_message');
    expect(toolNames).toContain('corvid_save_memory');
    expect(toolNames).toContain('corvid_recall_memory');
    expect(toolNames).toContain('corvid_library_write');
  });

  test('includes all tools for web sessions (no permission filtering)', () => {
    createCorvidMcpServer(createCtx({ sessionSource: 'web' }));
    expect(capturedTools.length).toBeGreaterThan(30);
  });

  test('filters tools for non-web sessions using default permissions', () => {
    createCorvidMcpServer(createCtx({ sessionSource: 'algochat' }));
    const toolNames = new Set(capturedTools.map((t) => t.name));
    expect(toolNames.has('corvid_record_observation')).toBe(true);
    expect(toolNames.has('corvid_send_message')).toBe(true);
  });

  test('filters tools for non-web sessions using explicit permissions', () => {
    createCorvidMcpServer(
      createCtx({
        sessionSource: 'agent',
        resolvedToolPermissions: ['corvid_record_observation', 'corvid_list_observations'],
      }),
    );
    const toolNames = capturedTools.map((t) => t.name);
    expect(toolNames).toEqual(['corvid_record_observation', 'corvid_list_observations']);
  });

  test('appends plugin tools', () => {
    const { tool } = require('@anthropic-ai/claude-agent-sdk');
    const pluginTool = tool('custom_plugin', 'A plugin tool', {}, async () => ({}));
    createCorvidMcpServer(createCtx(), [pluginTool]);
    const toolNames = capturedTools.map((t) => t.name);
    expect(toolNames).toContain('custom_plugin');
  });
});
