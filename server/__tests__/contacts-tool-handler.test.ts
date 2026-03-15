import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleLookupContact } from '../mcp/tool-handlers/contacts';
import { createContact, addPlatformLink } from '../db/contacts';
import type { McpToolContext } from '../mcp/tool-handlers/types';

let db: Database;

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId: 'test-agent',
        db,
        agentMessenger: {} as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        ...overrides,
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
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
});
