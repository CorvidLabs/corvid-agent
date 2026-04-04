import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Load the REAL implementations first so we can delegate to them when this
// test file's mocks aren't active.  mock.module is process-wide in Bun and
// leaks into other test files (like contact-auto-link.test.ts), so the mock
// must pass-through by default and only intercept during our own tests.
// @ts-expect-error Bun supports query-string imports; TS does not resolve them
const _realContacts = await import('../db/contacts?real');

const mockFindContactByPlatformId = mock((...args: any[]) => (_realContacts.findContactByPlatformId as Function)(...args));
const mockCreateContact = mock((...args: any[]) => (_realContacts.createContact as Function)(...args));
const mockAddPlatformLink = mock((...args: any[]) => (_realContacts.addPlatformLink as Function)(...args));

mock.module('../db/contacts', () => ({
    ..._realContacts,
    findContactByPlatformId: mockFindContactByPlatformId,
    createContact: mockCreateContact,
    addPlatformLink: mockAddPlatformLink,
}));

import {
    resolveDiscordContact,
    contactCache,
    CONTACT_CACHE_TTL,
} from '../discord/contact-linker';

// ─── Setup ────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    contactCache.clear();
    // Reset call counts, then override with test-specific stubs
    mockFindContactByPlatformId.mockReset();
    mockCreateContact.mockReset();
    mockAddPlatformLink.mockReset();
    mockFindContactByPlatformId.mockImplementation(() => null);
    mockCreateContact.mockImplementation((_db: unknown, _tenantId: string, name: string) => ({ id: `contact-${name}`, name }));
    mockAddPlatformLink.mockImplementation(() => undefined);
});

afterEach(() => {
    db.close();
    // Restore pass-through to real implementations so other test files
    // that import ../db/contacts get real behavior.
    mockFindContactByPlatformId.mockImplementation((...args: any[]) => (_realContacts.findContactByPlatformId as Function)(...args));
    mockCreateContact.mockImplementation((...args: any[]) => (_realContacts.createContact as Function)(...args));
    mockAddPlatformLink.mockImplementation((...args: any[]) => (_realContacts.addPlatformLink as Function)(...args));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveDiscordContact', () => {
    test('returns cached contact ID without hitting DB when cache is warm', () => {
        contactCache.set('user-123', { contactId: 'cached-id', resolvedAt: Date.now() });

        const result = resolveDiscordContact(db, 'user-123', 'Alice');

        expect(result).toBe('cached-id');
        expect(mockFindContactByPlatformId).not.toHaveBeenCalled();
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    test('returns existing contact from DB and caches it', () => {
        mockFindContactByPlatformId.mockImplementation(() => ({ id: 'existing-contact', name: 'Bob' }));

        const result = resolveDiscordContact(db, 'user-456', 'Bob');

        expect(result).toBe('existing-contact');
        expect(mockFindContactByPlatformId).toHaveBeenCalledTimes(1);
        expect(mockCreateContact).not.toHaveBeenCalled();
        // Should now be cached
        expect(contactCache.has('user-456')).toBe(true);
        expect(contactCache.get('user-456')?.contactId).toBe('existing-contact');
    });

    test('creates new contact when none exists and caches it', () => {
        mockFindContactByPlatformId.mockImplementation(() => null);
        mockCreateContact.mockImplementation(() => ({ id: 'new-contact-id', name: 'Carol' }));

        const result = resolveDiscordContact(db, 'user-789', 'Carol');

        expect(result).toBe('new-contact-id');
        expect(mockFindContactByPlatformId).toHaveBeenCalledTimes(1);
        expect(mockCreateContact).toHaveBeenCalledTimes(1);
        expect(mockAddPlatformLink).toHaveBeenCalledTimes(1);
        expect(contactCache.get('user-789')?.contactId).toBe('new-contact-id');
    });

    test('re-queries DB when cache entry is expired', () => {
        // Plant an expired cache entry
        const expiredAt = Date.now() - CONTACT_CACHE_TTL - 1000;
        contactCache.set('user-111', { contactId: 'stale-id', resolvedAt: expiredAt });

        mockFindContactByPlatformId.mockImplementation(() => ({ id: 'fresh-contact', name: 'Dave' }));

        const result = resolveDiscordContact(db, 'user-111', 'Dave');

        expect(result).toBe('fresh-contact');
        expect(mockFindContactByPlatformId).toHaveBeenCalledTimes(1);
        // Cache should be updated to fresh value
        expect(contactCache.get('user-111')?.contactId).toBe('fresh-contact');
    });

    test('returns cache hit when entry is just within TTL', () => {
        // Entry resolvedAt is 1ms before TTL boundary — still valid
        const freshAt = Date.now() - CONTACT_CACHE_TTL + 1000;
        contactCache.set('user-222', { contactId: 'still-fresh', resolvedAt: freshAt });

        const result = resolveDiscordContact(db, 'user-222', 'Eve');

        expect(result).toBe('still-fresh');
        expect(mockFindContactByPlatformId).not.toHaveBeenCalled();
    });

    test('addPlatformLink is called with correct discord platform and authorId', () => {
        mockFindContactByPlatformId.mockImplementation(() => null);
        mockCreateContact.mockImplementation(() => ({ id: 'c-999', name: 'Frank' }));

        resolveDiscordContact(db, 'discord-user-999', 'Frank');

        expect(mockAddPlatformLink).toHaveBeenCalledWith(
            db,
            'default',
            'c-999',
            'discord',
            'discord-user-999',
        );
    });
});
