/**
 * Auto-link Discord users to cross-platform contacts.
 *
 * On each incoming message, resolves or creates a contact record
 * for the Discord author, linking their Discord ID to the unified
 * contact identity system.
 */

import type { Database } from 'bun:sqlite';
import { findContactByPlatformId, createContact, addPlatformLink } from '../db/contacts';
import { createLogger } from '../lib/logger';

const log = createLogger('DiscordContactLinker');

/** Default tenant ID used for single-tenant deployments. */
const DEFAULT_TENANT_ID = 'default';

/** Cache TTL in milliseconds (5 minutes). */
export const CONTACT_CACHE_TTL = 5 * 60 * 1000;

interface CachedContact {
    contactId: string;
    resolvedAt: number;
}

/** In-memory cache to avoid DB lookups on every message. */
export const contactCache = new Map<string, CachedContact>();

/**
 * Resolve or create a contact for a Discord user.
 *
 * Checks cache first, then DB lookup by platform ID. If no contact
 * exists, creates one and links the Discord ID. Returns the contact
 * ID or null if an error occurs.
 */
export function resolveDiscordContact(
    db: Database,
    authorId: string,
    username: string,
): string | null {
    // Check cache first
    const cached = contactCache.get(authorId);
    if (cached && Date.now() - cached.resolvedAt < CONTACT_CACHE_TTL) {
        return cached.contactId;
    }

    // Lookup by platform ID
    const existing = findContactByPlatformId(db, DEFAULT_TENANT_ID, 'discord', authorId);
    if (existing) {
        contactCache.set(authorId, { contactId: existing.id, resolvedAt: Date.now() });
        return existing.id;
    }

    // Create new contact and link
    const contact = createContact(db, DEFAULT_TENANT_ID, username);
    addPlatformLink(db, DEFAULT_TENANT_ID, contact.id, 'discord', authorId);
    contactCache.set(authorId, { contactId: contact.id, resolvedAt: Date.now() });
    log.info('Created contact for Discord user', { authorId, username, contactId: contact.id });
    return contact.id;
}
