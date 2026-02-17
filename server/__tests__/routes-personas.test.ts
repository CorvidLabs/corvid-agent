import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
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

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

describe('Persona Routes', () => {
    test('GET persona returns 404 for agent without persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const { req, url } = fakeReq('GET', `/api/agents/${agent.id}/persona`);
        const res = handlePersonaRoutes(req, url, db);
        expect(res).not.toBeNull();
        const resolved = await res!;
        expect(resolved.status).toBe(404);
    });

    test('PUT creates persona and GET returns it', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });

        // Create persona
        const { req: putReq, url: putUrl } = fakeReq('PUT', `/api/agents/${agent.id}/persona`, {
            archetype: 'professional',
            traits: ['analytical'],
            background: 'Expert developer',
        });
        const putRes = await handlePersonaRoutes(putReq, putUrl, db);
        expect(putRes).not.toBeNull();
        expect(putRes!.status).toBe(200);
        const created = await putRes!.json();
        expect(created.archetype).toBe('professional');
        expect(created.traits).toEqual(['analytical']);

        // Get persona
        const { req: getReq, url: getUrl } = fakeReq('GET', `/api/agents/${agent.id}/persona`);
        const getRes = handlePersonaRoutes(getReq, getUrl, db);
        expect(getRes).not.toBeNull();
        const fetched = await (await getRes!).json();
        expect(fetched.archetype).toBe('professional');
    });

    test('PUT updates existing persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });

        // Create
        const { req: req1, url: url1 } = fakeReq('PUT', `/api/agents/${agent.id}/persona`, {
            archetype: 'friendly',
        });
        await handlePersonaRoutes(req1, url1, db);

        // Update
        const { req: req2, url: url2 } = fakeReq('PUT', `/api/agents/${agent.id}/persona`, {
            archetype: 'technical',
        });
        const res = await handlePersonaRoutes(req2, url2, db);
        const data = await res!.json();
        expect(data.archetype).toBe('technical');
    });

    test('DELETE removes persona', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });

        // Create
        const { req: putReq, url: putUrl } = fakeReq('PUT', `/api/agents/${agent.id}/persona`, {
            archetype: 'creative',
        });
        await handlePersonaRoutes(putReq, putUrl, db);

        // Delete
        const { req: delReq, url: delUrl } = fakeReq('DELETE', `/api/agents/${agent.id}/persona`);
        const delRes = await handlePersonaRoutes(delReq, delUrl, db);
        expect(delRes).not.toBeNull();
        expect(delRes!.status).toBe(200);

        // Verify deleted
        const { req: getReq, url: getUrl } = fakeReq('GET', `/api/agents/${agent.id}/persona`);
        const getRes = await handlePersonaRoutes(getReq, getUrl, db);
        expect(getRes!.status).toBe(404);
    });

    test('returns 404 for non-existent agent', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent/persona');
        const res = handlePersonaRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((await res!).status).toBe(404);
    });

    test('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handlePersonaRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
