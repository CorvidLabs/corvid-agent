import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createContact,
    getContact,
    listContacts,
    updateContact,
    deleteContact,
    addPlatformLink,
    removePlatformLink,
    verifyPlatformLink,
    findContactByPlatformId,
    findContactByName,
} from '../db/contacts';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── Contact CRUD ──────────────────────────────────────────────────────

describe('Contact CRUD', () => {
    test('createContact returns a contact with generated id', () => {
        const contact = createContact(db, '', 'Alice');
        expect(contact.id).toBeTruthy();
        expect(contact.displayName).toBe('Alice');
        expect(contact.notes).toBeNull();
        expect(contact.tenantId).toBe('');
        expect(contact.createdAt).toBeTruthy();
        expect(contact.updatedAt).toBeTruthy();
    });

    test('createContact with notes', () => {
        const contact = createContact(db, '', 'Bob', 'A good friend');
        expect(contact.notes).toBe('A good friend');
    });

    test('getContact returns null for missing contact', () => {
        expect(getContact(db, '', 'nonexistent')).toBeNull();
    });

    test('getContact returns contact with links array', () => {
        const created = createContact(db, '', 'Alice');
        const fetched = getContact(db, '', created.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.links).toEqual([]);
    });

    test('listContacts returns empty on fresh db', () => {
        const result = listContacts(db, '');
        expect(result.contacts).toEqual([]);
        expect(result.total).toBe(0);
    });

    test('listContacts returns all contacts sorted by name', () => {
        createContact(db, '', 'Charlie');
        createContact(db, '', 'Alice');
        createContact(db, '', 'Bob');
        const result = listContacts(db, '');
        expect(result.total).toBe(3);
        expect(result.contacts[0].displayName).toBe('Alice');
        expect(result.contacts[1].displayName).toBe('Bob');
        expect(result.contacts[2].displayName).toBe('Charlie');
    });

    test('listContacts supports search filter', () => {
        createContact(db, '', 'Alice Smith');
        createContact(db, '', 'Bob Jones');
        const result = listContacts(db, '', { search: 'alice' });
        expect(result.total).toBe(1);
        expect(result.contacts[0].displayName).toBe('Alice Smith');
    });

    test('listContacts supports pagination', () => {
        createContact(db, '', 'Alice');
        createContact(db, '', 'Bob');
        createContact(db, '', 'Charlie');

        const page1 = listContacts(db, '', { limit: 2, offset: 0 });
        expect(page1.contacts).toHaveLength(2);
        expect(page1.total).toBe(3);

        const page2 = listContacts(db, '', { limit: 2, offset: 2 });
        expect(page2.contacts).toHaveLength(1);
    });

    test('updateContact changes display name', () => {
        const contact = createContact(db, '', 'Alice');
        const updated = updateContact(db, '', contact.id, { displayName: 'Alice Updated' });
        expect(updated).not.toBeNull();
        expect(updated!.displayName).toBe('Alice Updated');
    });

    test('updateContact changes notes', () => {
        const contact = createContact(db, '', 'Alice', 'original');
        const updated = updateContact(db, '', contact.id, { notes: 'updated notes' });
        expect(updated!.notes).toBe('updated notes');
    });

    test('updateContact can set notes to null', () => {
        const contact = createContact(db, '', 'Alice', 'has notes');
        const updated = updateContact(db, '', contact.id, { notes: null });
        expect(updated!.notes).toBeNull();
    });

    test('updateContact returns null for missing contact', () => {
        expect(updateContact(db, '', 'nonexistent', { displayName: 'x' })).toBeNull();
    });

    test('deleteContact removes contact', () => {
        const contact = createContact(db, '', 'Alice');
        expect(deleteContact(db, '', contact.id)).toBe(true);
        expect(getContact(db, '', contact.id)).toBeNull();
    });

    test('deleteContact returns false for missing contact', () => {
        expect(deleteContact(db, '', 'nonexistent')).toBe(false);
    });
});

// ── Platform Links ────────────────────────────────────────────────────

describe('Platform Links', () => {
    test('addPlatformLink creates a link', () => {
        const contact = createContact(db, '', 'Alice');
        const link = addPlatformLink(db, '', contact.id, 'discord', '123456789');
        expect(link.id).toBeTruthy();
        expect(link.contactId).toBe(contact.id);
        expect(link.platform).toBe('discord');
        expect(link.platformId).toBe('123456789');
        expect(link.verified).toBe(false);
    });

    test('addPlatformLink appears in getContact links', () => {
        const contact = createContact(db, '', 'Alice');
        addPlatformLink(db, '', contact.id, 'discord', '123');
        addPlatformLink(db, '', contact.id, 'github', 'alice-gh');

        const fetched = getContact(db, '', contact.id);
        expect(fetched!.links).toHaveLength(2);
    });

    test('addPlatformLink enforces unique constraint on (tenant_id, platform, platform_id)', () => {
        const c1 = createContact(db, '', 'Alice');
        const c2 = createContact(db, '', 'Bob');
        addPlatformLink(db, '', c1.id, 'discord', '123');

        expect(() => {
            addPlatformLink(db, '', c2.id, 'discord', '123');
        }).toThrow();
    });

    test('removePlatformLink deletes the link', () => {
        const contact = createContact(db, '', 'Alice');
        const link = addPlatformLink(db, '', contact.id, 'github', 'alice');
        expect(removePlatformLink(db, '', link.id)).toBe(true);

        const fetched = getContact(db, '', contact.id);
        expect(fetched!.links).toHaveLength(0);
    });

    test('removePlatformLink returns false for missing link', () => {
        expect(removePlatformLink(db, '', 'nonexistent')).toBe(false);
    });

    test('verifyPlatformLink sets verified flag', () => {
        const contact = createContact(db, '', 'Alice');
        const link = addPlatformLink(db, '', contact.id, 'github', 'alice');
        expect(link.verified).toBe(false);

        expect(verifyPlatformLink(db, '', link.id)).toBe(true);

        const fetched = getContact(db, '', contact.id);
        const updatedLink = fetched!.links!.find((l) => l.id === link.id);
        expect(updatedLink!.verified).toBe(true);
    });

    test('verifyPlatformLink returns false for missing link', () => {
        expect(verifyPlatformLink(db, '', 'nonexistent')).toBe(false);
    });

    test('deleting contact cascades to links', () => {
        const contact = createContact(db, '', 'Alice');
        const link = addPlatformLink(db, '', contact.id, 'discord', '123');
        deleteContact(db, '', contact.id);

        // Link should be gone
        const row = db.query('SELECT * FROM contact_platform_links WHERE id = ?').get(link.id);
        expect(row).toBeNull();
    });
});

// ── Lookups ───────────────────────────────────────────────────────────

describe('Lookups', () => {
    test('findContactByPlatformId returns contact with links', () => {
        const contact = createContact(db, '', 'Alice');
        addPlatformLink(db, '', contact.id, 'discord', '123');
        addPlatformLink(db, '', contact.id, 'github', 'alice-gh');

        const found = findContactByPlatformId(db, '', 'discord', '123');
        expect(found).not.toBeNull();
        expect(found!.displayName).toBe('Alice');
        expect(found!.links).toHaveLength(2);
    });

    test('findContactByPlatformId returns null when not found', () => {
        expect(findContactByPlatformId(db, '', 'discord', 'nonexistent')).toBeNull();
    });

    test('findContactByName returns contact case-insensitively', () => {
        createContact(db, '', 'Alice Smith');
        const found = findContactByName(db, '', 'alice smith');
        expect(found).not.toBeNull();
        expect(found!.displayName).toBe('Alice Smith');
    });

    test('findContactByName returns null when not found', () => {
        expect(findContactByName(db, '', 'Nobody')).toBeNull();
    });

    test('findContactByName returns contact with links', () => {
        const contact = createContact(db, '', 'Alice');
        addPlatformLink(db, '', contact.id, 'algochat', 'ALGO123');

        const found = findContactByName(db, '', 'Alice');
        expect(found!.links).toHaveLength(1);
        expect(found!.links![0].platform).toBe('algochat');
    });
});

// ── Tenant Isolation ──────────────────────────────────────────────────

describe('Tenant Isolation', () => {
    test('contacts are isolated by tenant', () => {
        createContact(db, 'tenant-a', 'Alice');
        createContact(db, 'tenant-b', 'Bob');

        const listA = listContacts(db, 'tenant-a');
        expect(listA.total).toBe(1);
        expect(listA.contacts[0].displayName).toBe('Alice');

        const listB = listContacts(db, 'tenant-b');
        expect(listB.total).toBe(1);
        expect(listB.contacts[0].displayName).toBe('Bob');
    });

    test('getContact respects tenant isolation', () => {
        const contact = createContact(db, 'tenant-a', 'Alice');
        expect(getContact(db, 'tenant-a', contact.id)).not.toBeNull();
        expect(getContact(db, 'tenant-b', contact.id)).toBeNull();
    });

    test('updateContact respects tenant isolation', () => {
        const contact = createContact(db, 'tenant-a', 'Alice');
        expect(updateContact(db, 'tenant-b', contact.id, { displayName: 'Hacked' })).toBeNull();
        expect(getContact(db, 'tenant-a', contact.id)!.displayName).toBe('Alice');
    });

    test('deleteContact respects tenant isolation', () => {
        const contact = createContact(db, 'tenant-a', 'Alice');
        expect(deleteContact(db, 'tenant-b', contact.id)).toBe(false);
        expect(getContact(db, 'tenant-a', contact.id)).not.toBeNull();
    });

    test('platform links are isolated by tenant', () => {
        const contactA = createContact(db, 'tenant-a', 'Alice');
        addPlatformLink(db, 'tenant-a', contactA.id, 'discord', '123');

        expect(findContactByPlatformId(db, 'tenant-a', 'discord', '123')).not.toBeNull();
        expect(findContactByPlatformId(db, 'tenant-b', 'discord', '123')).toBeNull();
    });

    test('findContactByName respects tenant isolation', () => {
        createContact(db, 'tenant-a', 'Alice');
        expect(findContactByName(db, 'tenant-a', 'Alice')).not.toBeNull();
        expect(findContactByName(db, 'tenant-b', 'Alice')).toBeNull();
    });

    test('removePlatformLink respects tenant isolation', () => {
        const contact = createContact(db, 'tenant-a', 'Alice');
        const link = addPlatformLink(db, 'tenant-a', contact.id, 'github', 'alice');

        expect(removePlatformLink(db, 'tenant-b', link.id)).toBe(false);
        expect(removePlatformLink(db, 'tenant-a', link.id)).toBe(true);
    });

    test('verifyPlatformLink respects tenant isolation', () => {
        const contact = createContact(db, 'tenant-a', 'Alice');
        const link = addPlatformLink(db, 'tenant-a', contact.id, 'github', 'alice');

        expect(verifyPlatformLink(db, 'tenant-b', link.id)).toBe(false);
        expect(verifyPlatformLink(db, 'tenant-a', link.id)).toBe(true);
    });
});

// ── Multi-platform identity resolution ────────────────────────────────

describe('Multi-platform identity resolution', () => {
    test('full identity resolution workflow', () => {
        // Create contact with links on all three platforms
        const contact = createContact(db, '', 'Leif', 'Creator and lead architect');
        addPlatformLink(db, '', contact.id, 'discord', '987654321');
        addPlatformLink(db, '', contact.id, 'github', '0xLeif');
        addPlatformLink(db, '', contact.id, 'algochat', 'ALGO_ADDRESS_HERE');

        // Look up by any platform identifier
        const byDiscord = findContactByPlatformId(db, '', 'discord', '987654321');
        expect(byDiscord!.displayName).toBe('Leif');
        expect(byDiscord!.links).toHaveLength(3);

        const byGithub = findContactByPlatformId(db, '', 'github', '0xLeif');
        expect(byGithub!.id).toBe(byDiscord!.id);

        const byAlgochat = findContactByPlatformId(db, '', 'algochat', 'ALGO_ADDRESS_HERE');
        expect(byAlgochat!.id).toBe(byDiscord!.id);

        // Look up by name
        const byName = findContactByName(db, '', 'Leif');
        expect(byName!.id).toBe(contact.id);
    });
});
