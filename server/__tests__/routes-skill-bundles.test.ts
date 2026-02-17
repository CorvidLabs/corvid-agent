import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { handleSkillBundleRoutes } from '../routes/skill-bundles';

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

describe('Skill Bundle Routes', () => {
    test('GET /api/skill-bundles returns presets', async () => {
        const { req, url } = fakeReq('GET', '/api/skill-bundles');
        const res = handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (await res!).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(5);
    });

    test('POST /api/skill-bundles creates bundle', async () => {
        const { req, url } = fakeReq('POST', '/api/skill-bundles', {
            name: 'My Bundle',
            description: 'Custom bundle',
            tools: ['corvid_web_search'],
            promptAdditions: 'Search first.',
        });
        const res = await handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.name).toBe('My Bundle');
        expect(data.tools).toEqual(['corvid_web_search']);
    });

    test('GET /api/skill-bundles/:id returns bundle', async () => {
        // Create first
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/skill-bundles', {
            name: 'Test Bundle',
        });
        const createRes = await handleSkillBundleRoutes(createReq, createUrl, db);
        const created = await createRes!.json();

        // Get by ID
        const { req, url } = fakeReq('GET', `/api/skill-bundles/${created.id}`);
        const res = handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (await res!).json();
        expect(data.name).toBe('Test Bundle');
    });

    test('DELETE /api/skill-bundles/:id deletes non-preset', async () => {
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/skill-bundles', {
            name: 'Delete Me',
        });
        const createRes = await handleSkillBundleRoutes(createReq, createUrl, db);
        const created = await createRes!.json();

        const { req, url } = fakeReq('DELETE', `/api/skill-bundles/${created.id}`);
        const res = handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((await res!).status).toBe(200);
    });
});

describe('Agent Skill Assignment Routes', () => {
    test('GET /api/agents/:id/skills returns empty list initially', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });
        const { req, url } = fakeReq('GET', `/api/agents/${agent.id}/skills`);
        const res = handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (await res!).json();
        expect(data).toEqual([]);
    });

    test('POST /api/agents/:id/skills assigns bundle', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });

        // Create a bundle
        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/skill-bundles', {
            name: 'Assignment Test',
        });
        const createRes = await handleSkillBundleRoutes(createReq, createUrl, db);
        const bundle = await createRes!.json();

        // Assign
        const { req, url } = fakeReq('POST', `/api/agents/${agent.id}/skills`, {
            bundleId: bundle.id,
        });
        const res = await handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);

        // Verify
        const { req: getReq, url: getUrl } = fakeReq('GET', `/api/agents/${agent.id}/skills`);
        const getRes = handleSkillBundleRoutes(getReq, getUrl, db);
        const skills = await (await getRes!).json();
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('Assignment Test');
    });

    test('DELETE /api/agents/:id/skills/:bundleId unassigns', async () => {
        const agent = createAgent(db, { name: 'TestAgent' });

        const { req: createReq, url: createUrl } = fakeReq('POST', '/api/skill-bundles', {
            name: 'To Unassign',
        });
        const bundle = await (await handleSkillBundleRoutes(createReq, createUrl, db))!.json();

        // Assign
        const { req: assignReq, url: assignUrl } = fakeReq('POST', `/api/agents/${agent.id}/skills`, {
            bundleId: bundle.id,
        });
        await handleSkillBundleRoutes(assignReq, assignUrl, db);

        // Unassign
        const { req, url } = fakeReq('DELETE', `/api/agents/${agent.id}/skills/${bundle.id}`);
        const res = handleSkillBundleRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((await res!).status).toBe(200);

        // Verify
        const { req: getReq, url: getUrl } = fakeReq('GET', `/api/agents/${agent.id}/skills`);
        const skills = await (await handleSkillBundleRoutes(getReq, getUrl, db)!).json();
        expect(skills).toHaveLength(0);
    });

    test('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleSkillBundleRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
