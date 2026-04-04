import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFindContactByPlatformId = mock(() => null as { id: string; name: string } | null);
const mockCreateContact = mock((_db: unknown, _tenantId: string, name: string) => ({ id: `contact-${name}`, name }));
const mockAddPlatformLink = mock(() => undefined);

mock.module('../db/contacts', () => ({
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
    mockFindContactByPlatformId.mockReset();
    mockCreateContact.mockReset();
    mockAddPlatformLink.mockReset();
    // Restore defaults after reset
    mockFindContactByPlatformId.mockImplementation(() => null);
    mockCreateContact.mockImplementation((_db: unknown, _tenantId: string, name: string) => ({ id: `contact-${name}`, name }));
    mockAddPlatformLink.mockImplementation(() => undefined);
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
