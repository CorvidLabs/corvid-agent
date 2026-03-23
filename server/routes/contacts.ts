import type { Database } from 'bun:sqlite';
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
    type ContactPlatform,
} from '../db/contacts';
import { recordAudit } from '../db/audit';
import { parseBodyOrThrow, ValidationError } from '../lib/validation';
import { json } from '../lib/response';
import { safeNumParam } from '../lib/response';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';
import { z } from 'zod';

const VALID_PLATFORMS = ['discord', 'algochat', 'github'] as const;

const CreateContactSchema = z.object({
    displayName: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
});

const UpdateContactSchema = z.object({
    displayName: z.string().min(1).max(200).optional(),
    notes: z.string().max(2000).nullable().optional(),
});

const AddLinkSchema = z.object({
    platform: z.enum(VALID_PLATFORMS),
    platformId: z.string().min(1).max(500),
});

export function handleContactRoutes(
    req: Request,
    url: URL,
    db: Database,
    context: RequestContext,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;
    const tenantId = context.tenantId;

    // GET /api/contacts — list
    if (path === '/api/contacts' && method === 'GET') {
        const search = url.searchParams.get('search') ?? undefined;
        const limit = safeNumParam(url.searchParams.get('limit'), 50);
        const offset = safeNumParam(url.searchParams.get('offset'), 0);
        const result = listContacts(db, tenantId, { search, limit, offset });
        return json(result);
    }

    // POST /api/contacts — create
    if (path === '/api/contacts' && method === 'POST') {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
        return handleCreate(req, db, tenantId);
    }

    // GET /api/contacts/lookup — lookup by name or platform+platform_id
    if (path === '/api/contacts/lookup' && method === 'GET') {
        const name = url.searchParams.get('name');
        const platform = url.searchParams.get('platform');
        const platformId = url.searchParams.get('platform_id');

        if (name) {
            const contact = findContactByName(db, tenantId, name);
            return contact ? json(contact) : json({ error: 'Contact not found' }, 404);
        }
        if (platform && platformId) {
            if (!VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
                return json({ error: 'Invalid platform. Must be discord, algochat, or github.' }, 400);
            }
            const contact = findContactByPlatformId(db, tenantId, platform as ContactPlatform, platformId);
            return contact ? json(contact) : json({ error: 'Contact not found' }, 404);
        }
        return json({ error: 'Provide name or platform+platform_id query params' }, 400);
    }

    // Match /api/contacts/:id routes
    const contactMatch = path.match(/^\/api\/contacts\/([^/]+)$/);
    if (contactMatch) {
        const contactId = decodeURIComponent(contactMatch[1]);

        if (method === 'GET') {
            const contact = getContact(db, tenantId, contactId);
            return contact ? json(contact) : json({ error: 'Contact not found' }, 404);
        }

        if (method === 'PUT') {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
            return handleUpdate(req, db, tenantId, contactId);
        }

        if (method === 'DELETE') {
            const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
            if (denied) return denied;
            const deleted = deleteContact(db, tenantId, contactId);
            if (deleted) {
                recordAudit(db, 'contact_delete', tenantId, 'contact', contactId);
                return json({ ok: true });
            }
            return json({ error: 'Contact not found' }, 404);
        }
    }

    // POST /api/contacts/:id/links — add platform link
    const addLinkMatch = path.match(/^\/api\/contacts\/([^/]+)\/links$/);
    if (addLinkMatch && method === 'POST') {
        const denied = tenantRoleGuard('operator', 'owner')(req, url, context);
        if (denied) return denied;
        const contactId = decodeURIComponent(addLinkMatch[1]);
        return handleAddLink(req, db, tenantId, contactId);
    }

    // DELETE /api/contacts/:id/links/:linkId — remove link
    const removeLinkMatch = path.match(/^\/api\/contacts\/([^/]+)\/links\/([^/]+)$/);
    if (removeLinkMatch && method === 'DELETE') {
        const linkId = decodeURIComponent(removeLinkMatch[2]);
        const removed = removePlatformLink(db, tenantId, linkId);
        if (removed) {
            recordAudit(db, 'link_remove', tenantId, 'contact_platform_link', linkId);
            return json({ ok: true });
        }
        return json({ error: 'Link not found' }, 404);
    }

    // PUT /api/contacts/:id/links/:linkId/verify — verify link
    const verifyLinkMatch = path.match(/^\/api\/contacts\/([^/]+)\/links\/([^/]+)\/verify$/);
    if (verifyLinkMatch && method === 'PUT') {
        const linkId = decodeURIComponent(verifyLinkMatch[2]);
        const verified = verifyPlatformLink(db, tenantId, linkId);
        if (verified) {
            recordAudit(db, 'link_verify', tenantId, 'contact_platform_link', linkId);
            return json({ ok: true });
        }
        return json({ error: 'Link not found' }, 404);
    }

    return null;
}

async function handleCreate(req: Request, db: Database, tenantId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateContactSchema);
        const contact = createContact(db, tenantId, data.displayName, data.notes);
        recordAudit(db, 'contact_create', tenantId, 'contact', contact.id);
        return json(contact, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleUpdate(req: Request, db: Database, tenantId: string, contactId: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateContactSchema);
        const contact = updateContact(db, tenantId, contactId, data);
        if (!contact) return json({ error: 'Contact not found' }, 404);
        recordAudit(db, 'contact_update', tenantId, 'contact', contactId);
        return json(contact);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}

async function handleAddLink(req: Request, db: Database, tenantId: string, contactId: string): Promise<Response> {
    try {
        // Verify contact exists
        const contact = getContact(db, tenantId, contactId);
        if (!contact) return json({ error: 'Contact not found' }, 404);

        const data = await parseBodyOrThrow(req, AddLinkSchema);
        const link = addPlatformLink(db, tenantId, contactId, data.platform, data.platformId);
        recordAudit(db, 'link_add', tenantId, 'contact_platform_link', link.id, `${data.platform}:${data.platformId}`);
        return json(link, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        throw err;
    }
}
