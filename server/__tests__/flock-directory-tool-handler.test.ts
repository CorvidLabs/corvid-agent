/**
 * Tests for the Flock Directory MCP tool handler:
 * - Enhanced search/list output with capabilities and description
 * - health_overview action
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { FlockDirectoryService } from '../flock-directory/service';
import { handleFlockDirectory } from '../mcp/tool-handlers/flock-directory';
import type { McpToolContext } from '../mcp/tool-handlers/types';

let db: Database;
let svc: FlockDirectoryService;

function makeCtx(overrides?: Partial<McpToolContext>): McpToolContext {
  return {
    agentId: 'test-agent',
    db,
    agentMessenger: {} as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {} as McpToolContext['agentWalletService'],
    flockDirectoryService: svc,
    ...overrides,
  };
}

beforeEach(async () => {
  db = new Database(':memory:');
  runMigrations(db);
  svc = new FlockDirectoryService(db);

  // Register test agents with capabilities
  await svc.register({
    address: 'AGENT_A_ADDRESS',
    name: 'CodeBot',
    description: 'A coding specialist',
    capabilities: ['code', 'review', 'test'],
    instanceUrl: 'https://codebot.example.com',
  });
  await svc.register({
    address: 'AGENT_B_ADDRESS',
    name: 'ResearchBot',
    description: 'Research and analysis agent',
    capabilities: ['research', 'analysis'],
  });
});

afterEach(() => {
  db.close();
});

// ─── Search Output ───────────────────────────────────────────────────────────

describe('search action', () => {
  test('includes capabilities in search results', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'search' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[code, review, test]');
    expect(text).toContain('[research, analysis]');
  });

  test('includes description in search results', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'search' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('A coding specialist');
    expect(text).toContain('Research and analysis agent');
  });

  test('filters by capability', async () => {
    const result = await handleFlockDirectory(makeCtx(), {
      action: 'search',
      capability: 'code',
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('CodeBot');
    expect(text).not.toContain('ResearchBot');
  });
});

// ─── List Output ─────────────────────────────────────────────────────────────

describe('list action', () => {
  test('includes capabilities in list results', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'list' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[code, review, test]');
    expect(text).toContain('CodeBot');
  });

  test('includes description in list results', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'list' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('A coding specialist');
  });
});

// ─── Health Overview ─────────────────────────────────────────────────────────

describe('health_overview action', () => {
  test('returns overview with all agents', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'health_overview' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Flock Health Overview');
    expect(text).toContain('CodeBot');
    expect(text).toContain('ResearchBot');
  });

  test('shows heartbeat age', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'health_overview' });
    const text = (result.content[0] as { text: string }).text;
    // Just-registered agents should show recent heartbeat
    expect(text).toMatch(/heartbeat: (just now|\dm ago)/);
  });

  test('shows active status indicator', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'health_overview' });
    const text = (result.content[0] as { text: string }).text;
    // Active agents get a filled circle indicator
    expect(text).toContain('●');
  });

  test('shows capabilities per agent', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'health_overview' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[code, review, test]');
    expect(text).toContain('[research, analysis]');
  });

  test('shows instance URL when available', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'health_overview' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('https://codebot.example.com');
  });

  test('returns empty message when no agents', async () => {
    const emptyDb = new Database(':memory:');
    runMigrations(emptyDb);
    const emptySvc = new FlockDirectoryService(emptyDb);
    const result = await handleFlockDirectory(makeCtx({ flockDirectoryService: emptySvc }), {
      action: 'health_overview',
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('No agents registered');
    emptyDb.close();
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────────

describe('error handling', () => {
  test('returns error when service unavailable', async () => {
    const result = await handleFlockDirectory(makeCtx({ flockDirectoryService: undefined }), { action: 'list' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('not available');
  });

  test('health_overview is listed in unknown action error', async () => {
    const result = await handleFlockDirectory(makeCtx(), { action: 'invalid_action' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('health_overview');
  });
});
