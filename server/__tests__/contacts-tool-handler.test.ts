import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { saveMemory } from '../db/agent-memories';
import { addPlatformLink, createContact } from '../db/contacts';
import { runMigrations } from '../db/schema';
import { handleLookupContact } from '../mcp/tool-handlers/contacts';
import type { McpToolContext } from '../mcp/tool-handlers/types';

let db: Database;

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
  return {
    agentId: 'test-agent',
    db,
    agentMessenger: {
      readOnChainMemories: async () => [],
    } as unknown as McpToolContext['agentMessenger'],
    agentDirectory: {} as McpToolContext['agentDirectory'],
    agentWalletService: {} as McpToolContext['agentWalletService'],
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  // Insert a test agent so agent_memories FK is satisfied
  db.query("INSERT INTO agents (id, name) VALUES ('test-agent', 'Test Agent')").run();
});

afterEach(() => db.close());

describe('handleLookupContact', () => {
  it('looks up contact by name', async () => {
    createContact(db, '', 'Alice');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Alice' });
    expect(result.isError).toBeUndefined();
    const text = result.content[0];
    expect(text.type).toBe('text');
    expect((text as { type: 'text'; text: string }).text).toContain('Alice');
  });

  it('returns not-found message when name not found', async () => {
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Nobody' });
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No contact found');
  });

  it('looks up contact by platform + platform_id', async () => {
    const contact = createContact(db, '', 'Bob');
    addPlatformLink(db, '', contact.id, 'discord', '999');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { platform: 'discord', platform_id: '999' });
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Bob');
    expect(text).toContain('discord');
  });

  it('returns not-found when platform id not found', async () => {
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { platform: 'github', platform_id: 'unknown' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No contact found');
  });

  it('returns error for invalid platform', async () => {
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { platform: 'telegram', platform_id: '123' });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Invalid platform');
  });

  it('returns error when no args provided', async () => {
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, {});
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Provide either name or platform+platform_id');
  });

  it('formats contact with notes', async () => {
    createContact(db, '', 'Alice', 'A helpful note');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Alice' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('A helpful note');
  });

  it('formats contact with verified link', async () => {
    const contact = createContact(db, '', 'Alice');
    const link = addPlatformLink(db, '', contact.id, 'github', 'alice-gh');
    // Verify the link directly
    db.query('UPDATE contact_platform_links SET verified = 1 WHERE id = ?').run(link.id);

    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Alice' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('[verified]');
    expect(text).toContain('github');
    expect(text).toContain('alice-gh');
  });

  it('formats contact with no links', async () => {
    createContact(db, '', 'Lonely');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Lonely' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No platform links');
  });

  it('includes created-at timestamp', async () => {
    createContact(db, '', 'Alice');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Alice' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Created:');
  });

  it('finds contact by partial name match', async () => {
    createContact(db, '', 'Alice Wonderland');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Alice' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Alice Wonderland');
  });

  it('returns multiple matches when partial name is ambiguous', async () => {
    createContact(db, '', 'Alice Smith');
    createContact(db, '', 'Alice Jones');
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Alice' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Multiple contacts');
    expect(text).toContain('Alice Smith');
    expect(text).toContain('Alice Jones');
  });

  it('falls back to memory when no contact in DB', async () => {
    saveMemory(db, {
      agentId: 'test-agent',
      key: 'user-leif',
      content: 'Leif — Discord: leif.algo, ID: 181969874455756800',
    });
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Leif' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('found info in memory');
    expect(text).toContain('user-leif');
    expect(text).toContain('leif.algo');
  });

  it('does not trigger memory fallback when contact exists in DB', async () => {
    createContact(db, '', 'Leif');
    saveMemory(db, { agentId: 'test-agent', key: 'user-leif', content: 'Leif — Discord: leif.algo' });
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Leif' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Contact: Leif');
    expect(text).not.toContain('found info in memory');
  });

  it('returns no-contact when neither DB nor memory has results', async () => {
    const ctx = createMockContext();
    const result = await handleLookupContact(ctx, { name: 'Nobody' });
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No contact found');
  });
});
