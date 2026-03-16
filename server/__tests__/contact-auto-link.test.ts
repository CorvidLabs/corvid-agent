import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { findContactByPlatformId } from '../db/contacts';
import {
    resolveDiscordContact,
    contactCache,
    CONTACT_CACHE_TTL,
} from '../discord/contact-linker';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    contactCache.clear();
});

afterEach(() => {
    db.close();
});

describe('Discord contact auto-link', () => {
    test('creates contact on first message from a Discord user', () => {
        const contactId = resolveDiscordContact(db, '123456', 'testuser');

        expect(contactId).toBeTruthy();

        // Verify the contact was created with a Discord platform link
        const contact = findContactByPlatformId(db, 'default', 'discord', '123456');
        expect(contact).not.toBeNull();
        expect(contact!.displayName).toBe('testuser');
        expect(contact!.id).toBe(contactId!);
        expect(contact!.links).toBeDefined();
        expect(contact!.links!.length).toBe(1);
        expect(contact!.links![0].platform).toBe('discord');
        expect(contact!.links![0].platformId).toBe('123456');
    });

    test('returns cached contact on subsequent messages', () => {
        const first = resolveDiscordContact(db, '123456', 'testuser');
        const second = resolveDiscordContact(db, '123456', 'testuser');

        expect(first).toBe(second);

        // Verify only one contact exists (no duplicates)
        const rows = db.query(
            "SELECT COUNT(*) as cnt FROM contacts WHERE display_name = 'testuser'",
        ).get() as { cnt: number };
        expect(rows.cnt).toBe(1);
    });

    test('returns existing contact from DB when cache is empty', () => {
        const first = resolveDiscordContact(db, '123456', 'testuser');

        // Clear cache to force DB lookup
        contactCache.clear();

        const second = resolveDiscordContact(db, '123456', 'testuser');
        expect(second).toBe(first);

        // Still only one contact
        const rows = db.query(
            "SELECT COUNT(*) as cnt FROM contacts WHERE display_name = 'testuser'",
        ).get() as { cnt: number };
        expect(rows.cnt).toBe(1);
    });

    test('cache expires after TTL', () => {
        const contactId = resolveDiscordContact(db, '123456', 'testuser');

        // Manually expire the cache entry
        const entry = contactCache.get('123456');
        expect(entry).toBeDefined();
        entry!.resolvedAt = Date.now() - CONTACT_CACHE_TTL - 1;

        // Should do a fresh DB lookup (but still return the same contact)
        const second = resolveDiscordContact(db, '123456', 'testuser');
        expect(second).toBe(contactId);

        // Verify cache was refreshed
        const refreshed = contactCache.get('123456');
        expect(refreshed).toBeDefined();
        expect(Date.now() - refreshed!.resolvedAt).toBeLessThan(1000);
    });

    test('handles different Discord users independently', () => {
        const contact1 = resolveDiscordContact(db, 'user-a', 'alice');
        const contact2 = resolveDiscordContact(db, 'user-b', 'bob');

        expect(contact1).not.toBe(contact2);
        expect(contact1).toBeTruthy();
        expect(contact2).toBeTruthy();

        const rows = db.query(
            'SELECT COUNT(*) as cnt FROM contacts',
        ).get() as { cnt: number };
        expect(rows.cnt).toBe(2);
    });

    test('does not create duplicate contacts for same Discord user', () => {
        // Simulate multiple rapid calls (cache populated on first)
        resolveDiscordContact(db, '123456', 'testuser');
        contactCache.clear();
        resolveDiscordContact(db, '123456', 'testuser');
        contactCache.clear();
        resolveDiscordContact(db, '123456', 'testuser');

        const rows = db.query(
            'SELECT COUNT(*) as cnt FROM contacts',
        ).get() as { cnt: number };
        expect(rows.cnt).toBe(1);

        const linkRows = db.query(
            "SELECT COUNT(*) as cnt FROM contact_platform_links WHERE platform = 'discord' AND platform_id = '123456'",
        ).get() as { cnt: number };
        expect(linkRows.cnt).toBe(1);
    });

    test('handles DB errors gracefully when called from message handler', () => {
        // Close the DB to simulate an error
        db.close();

        // resolveDiscordContact itself throws on DB error,
        // but the message handler wraps it in try/catch
        expect(() => resolveDiscordContact(db, '123456', 'testuser')).toThrow();

        // Re-open for afterEach cleanup
        db = new Database(':memory:');
    });
});
