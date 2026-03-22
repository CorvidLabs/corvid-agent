import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createPersona, assignPersona } from '../db/personas';
import { handlePersonaRoutes } from '../routes/personas';

let db: Database;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

/** Resolve the handler result (may be sync Response or async Promise<Response>). */
async function resolve(result: Response | Promise<Response> | null): Promise<Response | null> {
    return result ? await result : null;
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('Persona CRUD Routes', () => {
    test('GET /api/personas returns empty list', async () => {
        const { req, url } = fakeReq('GET', '/api/personas');
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body).toEqual([]);
    });

    test('POST /api/personas creates a persona', async () => {
        const { req, url } = fakeReq('POST', '/api/personas', {
            name: 'Professional',
            archetype: 'professional',
            traits: ['analytical'],
        });
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const body = await res!.json();
        expect(body.name).toBe('Professional');
        expect(body.archetype).toBe('professional');
        expect(body.id).toBeDefined();
    });

    test('GET /api/personas/:id returns persona', async () => {
        const persona = createPersona(db, { name: 'Test' });
        const { req, url } = fakeReq('GET', `/api/personas/${persona.id}`);
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body.name).toBe('Test');
    });

    test('GET /api/personas/:id returns 404 for missing', async () => {
        const { req, url } = fakeReq('GET', '/api/personas/nonexistent');
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    test('PUT /api/personas/:id updates persona', async () => {
        const persona = createPersona(db, { name: 'Original' });
        const { req, url } = fakeReq('PUT', `/api/personas/${persona.id}`, {
            name: 'Updated',
            archetype: 'technical',
        });
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body.name).toBe('Updated');
        expect(body.archetype).toBe('technical');
    });

    test('DELETE /api/personas/:id deletes persona', async () => {
        const persona = createPersona(db, { name: 'ToDelete' });
        const { req, url } = fakeReq('DELETE', `/api/personas/${persona.id}`);
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
    });
});

describe('Agent-Persona Assignment Routes', () => {
    test('GET /api/agents/:id/personas returns empty list', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const { req, url } = fakeReq('GET', `/api/agents/${agent.id}/personas`);
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body).toEqual([]);
    });

    test('POST /api/agents/:id/personas assigns persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'P1' });
        const { req, url } = fakeReq('POST', `/api/agents/${agent.id}/personas`, {
            personaId: persona.id,
            sortOrder: 0,
        });
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);

        // Verify assignment
        const { req: getReq, url: getUrl } = fakeReq('GET', `/api/agents/${agent.id}/personas`);
        const getRes = await resolve(handlePersonaRoutes(getReq, getUrl, db));
        const body = await getRes!.json();
        expect(body.length).toBe(1);
        expect(body[0].id).toBe(persona.id);
    });

    test('DELETE /api/agents/:id/personas/:personaId unassigns persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'P1' });
        assignPersona(db, agent.id, persona.id);

        const { req, url } = fakeReq('DELETE', `/api/agents/${agent.id}/personas/${persona.id}`);
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
    });

    test('returns 404 for non-existent agent', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent/personas');
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });
});

describe('Legacy Backward Compatibility', () => {
    test('GET /api/agents/:id/persona returns first persona or null', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });

        // No persona assigned
        const { req: req1, url: url1 } = fakeReq('GET', `/api/agents/${agent.id}/persona`);
        const res1 = await resolve(handlePersonaRoutes(req1, url1, db));
        expect(res1).not.toBeNull();
        expect(res1!.status).toBe(200);
        const body1 = await res1!.json();
        expect(body1).toBeNull();

        // Assign a persona
        const persona = createPersona(db, { name: 'P1', archetype: 'professional' });
        assignPersona(db, agent.id, persona.id);

        const { req: req2, url: url2 } = fakeReq('GET', `/api/agents/${agent.id}/persona`);
        const res2 = await resolve(handlePersonaRoutes(req2, url2, db));
        const body2 = await res2!.json();
        expect(body2.archetype).toBe('professional');
    });

    test('returns 404 for non-existent agent on legacy route', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent/persona');
        const res = await resolve(handlePersonaRoutes(req, url, db));
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });
});

describe('Unmatched paths', () => {
    test('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handlePersonaRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
