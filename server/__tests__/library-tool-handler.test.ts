/**
 * Tests for corvid_library_write librarian permission model.
 *
 * Only agents in LIBRARIAN_AGENT_IDS may write to the shared library.
 * All other agents receive an error.
 */
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { handleLibraryWrite } from '../mcp/tool-handlers/library';
import type { McpToolContext } from '../mcp/tool-handlers/types';

// CorvidAgent — the default librarian
const CORVID_AGENT_ID = '357251b1-128f-47a6-a8c1-d6cfa1c62b24';
const OTHER_AGENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let db: Database;

function createMockContext(agentId: string): McpToolContext {
  return {
    agentId,
    db,
    agentMessenger: {} as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {
      getAlgoChatService: () => ({ indexerClient: null }),
    } as unknown as McpToolContext['agentWalletService'],
    network: 'localnet',
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.query('INSERT INTO agents (id, name) VALUES (?, ?)').run(CORVID_AGENT_ID, 'CorvidAgent');
  db.query('INSERT INTO agents (id, name) VALUES (?, ?)').run(OTHER_AGENT_ID, 'OtherAgent');
});

afterEach(() => db.close());

describe('handleLibraryWrite — librarian permission model', () => {
  it('allows CorvidAgent (librarian) to write', async () => {
    const ctx = createMockContext(CORVID_AGENT_ID);
    const result = await handleLibraryWrite(ctx, {
      key: 'test-entry',
      content: 'Hello library',
      category: 'reference',
    });
    // Should save to local cache successfully (no wallet = local-only)
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('test-entry');
    expect(text).toContain('local cache');
  });

  it('denies non-librarian agents', async () => {
    const ctx = createMockContext(OTHER_AGENT_ID);
    const result = await handleLibraryWrite(ctx, {
      key: 'test-entry',
      content: 'Should be rejected',
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toBe('Only agents with librarian role can write to the shared library');
  });

  it('returns error for invalid category even for librarian', async () => {
    const ctx = createMockContext(CORVID_AGENT_ID);
    const result = await handleLibraryWrite(ctx, {
      key: 'test-entry',
      content: 'Content',
      category: 'bogus',
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Invalid category');
  });

  it('non-librarian cannot write regardless of category', async () => {
    const ctx = createMockContext(OTHER_AGENT_ID);
    for (const category of ['guide', 'reference', 'decision', 'standard', 'runbook']) {
      const result = await handleLibraryWrite(ctx, {
        key: `test-${category}`,
        content: 'Content',
        category,
      });
      expect(result.isError).toBe(true);
    }
  });
});
