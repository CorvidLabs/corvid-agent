import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createPersona } from '../db/personas';
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

async function call(method: string, path: string, body?: unknown): Promise<Response | null> {
    const { req, url } = fakeReq(method, path, body);
    const res = handlePersonaRoutes(req, url, db);
    return res instanceof Promise ? await res : res;
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
    test('GET /api/personas returns empty array', async () => {
        const res = await call('GET', '/api/personas');
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body).toEqual([]);
    });

    test('POST /api/personas creates persona', async () => {
        const res = await call('POST', '/api/personas', {
            name: 'Test Persona',
            archetype: 'professional',
            traits: ['analytical'],
        });
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const body = await res!.json();
        expect(body.name).toBe('Test Persona');
        expect(body.archetype).toBe('professional');
        expect(body.id).toBeDefined();
    });

    test('GET /api/personas/:id returns persona', async () => {
        const persona = createPersona(db, { name: 'Fetch Me' });
        const res = await call('GET', `/api/personas/${persona.id}`);
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body.name).toBe('Fetch Me');
    });

    test('GET /api/personas/:id returns 404 for missing', async () => {
        const res = await call('GET', '/api/personas/nonexistent');
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });

    test('PUT /api/personas/:id updates persona', async () => {
        const persona = createPersona(db, { name: 'Original' });
        const res = await call('PUT', `/api/personas/${persona.id}`, { name: 'Updated' });
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body.name).toBe('Updated');
    });

    test('DELETE /api/personas/:id deletes persona', async () => {
        const persona = createPersona(db, { name: 'Delete Me' });
        const res = await call('DELETE', `/api/personas/${persona.id}`);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
    });
});

describe('Agent-Persona Assignment Routes', () => {
    test('GET /api/agents/:id/personas returns empty array', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const res = await call('GET', `/api/agents/${agent.id}/personas`);
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body).toEqual([]);
    });

    test('POST /api/agents/:id/personas assigns persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'Assign Me' });

        const res = await call('POST', `/api/agents/${agent.id}/personas`, {
            personaId: persona.id,
            sortOrder: 0,
        });
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);

        // Verify assignment
        const getRes = await call('GET', `/api/agents/${agent.id}/personas`);
        const body = await getRes!.json();
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(persona.id);
    });

    test('DELETE /api/agents/:id/personas/:personaId unassigns persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'Unassign Me' });

        // Assign first
        await call('POST', `/api/agents/${agent.id}/personas`, {
            personaId: persona.id,
        });

        // Unassign
        const res = await call('DELETE', `/api/agents/${agent.id}/personas/${persona.id}`);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);

        // Verify empty
        const getRes = await call('GET', `/api/agents/${agent.id}/personas`);
        const body = await getRes!.json();
        expect(body).toEqual([]);
    });

    test('returns 404 for non-existent agent', async () => {
        const res = await call('GET', '/api/agents/nonexistent/personas');
        expect(res).not.toBeNull();
        expect(res!.status).toBe(404);
    });
});

describe('Legacy Backward Compatibility', () => {
    test('GET /api/agents/:id/persona returns first persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const persona = createPersona(db, { name: 'Legacy', archetype: 'professional' });

        // Assign via new API
        await call('POST', `/api/agents/${agent.id}/personas`, {
            personaId: persona.id,
        });

        // Read via legacy endpoint
        const res = await call('GET', `/api/agents/${agent.id}/persona`);
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body.archetype).toBe('professional');
    });

    test('GET /api/agents/:id/persona returns null when no personas', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const res = await call('GET', `/api/agents/${agent.id}/persona`);
        expect(res).not.toBeNull();
        const body = await res!.json();
        expect(body).toBeNull();
    });
});

describe('Unmatched routes', () => {
    test('returns null for unmatched paths', async () => {
        const res = await call('GET', '/api/other');
        expect(res).toBeNull();
    });
});
