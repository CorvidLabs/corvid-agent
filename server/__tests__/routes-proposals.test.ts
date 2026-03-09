import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleProposalRoutes } from '../routes/proposals';

let db: Database;
let councilId: string;
let agentId1: string;
let agentId2: string;

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    agentId1 = crypto.randomUUID();
    agentId2 = crypto.randomUUID();
    councilId = crypto.randomUUID();

    db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent1')").run(agentId1);
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Agent2')").run(agentId2);
    db.query(
        "INSERT INTO councils (id, name, discussion_rounds, tenant_id) VALUES (?, 'Gov Council', 2, 'default')",
    ).run(councilId);
    db.query('INSERT INTO council_members (council_id, agent_id, sort_order) VALUES (?, ?, 0)').run(councilId, agentId1);
    db.query('INSERT INTO council_members (council_id, agent_id, sort_order) VALUES (?, ?, 1)').run(councilId, agentId2);
});

afterAll(() => db.close());

describe('Proposal Routes', () => {
    // ─── GET list ────────────────────────────────────────────────────────

    it('GET /api/proposals returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/proposals');
        const res = handleProposalRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('GET /api/proposals filters by councilId', async () => {
        const { req, url } = fakeReq('GET', `/api/proposals?councilId=${councilId}`);
        const res = handleProposalRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/proposals filters by status', async () => {
        const { req, url } = fakeReq('GET', '/api/proposals?status=draft');
        const res = handleProposalRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
    });

    // ─── POST create ─────────────────────────────────────────────────────

    it('POST /api/proposals rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {});
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/proposals rejects missing councilId', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {
            title: 'My Proposal',
            authorId: agentId1,
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/proposals rejects missing title', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {
            councilId,
            authorId: agentId1,
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/proposals rejects missing authorId', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {
            councilId,
            title: 'My Proposal',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/proposals returns 404 for nonexistent council', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {
            councilId: 'nonexistent-council',
            title: 'My Proposal',
            authorId: agentId1,
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('POST /api/proposals creates proposal with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {
            councilId,
            title: 'Upgrade Runtime',
            authorId: agentId1,
            description: 'Upgrade Bun to latest',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.title).toBe('Upgrade Runtime');
        expect(data.status).toBe('draft');
        expect(data.id).toBeDefined();
    });

    it('POST /api/proposals accepts optional governance fields', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals', {
            councilId,
            title: 'With Options',
            authorId: agentId1,
            governanceTier: 1,
            affectedPaths: ['server/routes/proposals.ts'],
            quorumThreshold: 0.6,
            minimumVoters: 2,
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(201);
        const data = await (res as Response).json();
        expect(data.governanceTier).toBe(1);
    });

    // ─── GET by id ───────────────────────────────────────────────────────

    let proposalId: string;

    it('GET /api/proposals lists created proposals', async () => {
        const { req, url } = fakeReq('GET', '/api/proposals');
        const res = handleProposalRoutes(req, url, db);
        const data = await (res as Response).json();
        expect(data.length).toBeGreaterThanOrEqual(1);
        proposalId = data[0].id;
    });

    it('GET /api/proposals/:id returns proposal', async () => {
        const { req, url } = fakeReq('GET', `/api/proposals/${proposalId}`);
        const res = handleProposalRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.id).toBe(proposalId);
    });

    it('GET /api/proposals/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/proposals/nonexistent');
        const res = handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    // ─── PUT update ──────────────────────────────────────────────────────

    it('PUT /api/proposals/:id updates proposal in draft', async () => {
        const { req, url } = fakeReq('PUT', `/api/proposals/${proposalId}`, {
            title: 'Updated Title',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.title).toBe('Updated Title');
    });

    it('PUT /api/proposals/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('PUT', '/api/proposals/nonexistent', { title: 'X' });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    // ─── DELETE ──────────────────────────────────────────────────────────

    it('DELETE /api/proposals/:id deletes draft proposal', async () => {
        // Create a throwaway proposal
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/proposals', {
            councilId,
            title: 'Delete Me',
            authorId: agentId1,
        });
        const cRes = await handleProposalRoutes(cReq, cUrl, db);
        const created = await (cRes as Response).json();

        const { req, url } = fakeReq('DELETE', `/api/proposals/${created.id}`);
        const res = handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(200);

        // Verify deleted
        const { req: gReq, url: gUrl } = fakeReq('GET', `/api/proposals/${created.id}`);
        const gRes = handleProposalRoutes(gReq, gUrl, db);
        expect((gRes as Response).status).toBe(404);
    });

    it('DELETE /api/proposals/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('DELETE', '/api/proposals/nonexistent');
        const res = handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('DELETE /api/proposals/:id rejects non-draft proposals', async () => {
        // Create and transition to open
        const { req: cReq, url: cUrl } = fakeReq('POST', '/api/proposals', {
            councilId,
            title: 'Opened Proposal',
            authorId: agentId1,
        });
        const cRes = await handleProposalRoutes(cReq, cUrl, db);
        const created = await (cRes as Response).json();

        const { req: tReq, url: tUrl } = fakeReq('POST', `/api/proposals/${created.id}/transition`, {
            status: 'open',
        });
        await handleProposalRoutes(tReq, tUrl, db);

        const { req, url } = fakeReq('DELETE', `/api/proposals/${created.id}`);
        const res = handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    // ─── POST transition ─────────────────────────────────────────────────

    it('POST /api/proposals/:id/transition moves draft to open', async () => {
        const { req, url } = fakeReq('POST', `/api/proposals/${proposalId}/transition`, {
            status: 'open',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.status).toBe('open');
    });

    it('POST /api/proposals/:id/transition rejects invalid transition', async () => {
        // proposalId is now 'open', trying to go to 'enacted' should fail
        const { req, url } = fakeReq('POST', `/api/proposals/${proposalId}/transition`, {
            status: 'enacted',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/proposals/:id/transition rejects invalid body', async () => {
        const { req, url } = fakeReq('POST', `/api/proposals/${proposalId}/transition`, {});
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    it('POST /api/proposals/:id/transition returns 404 for unknown', async () => {
        const { req, url } = fakeReq('POST', '/api/proposals/nonexistent/transition', {
            status: 'open',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    it('PUT /api/proposals/:id allows update in open status', async () => {
        const { req, url } = fakeReq('PUT', `/api/proposals/${proposalId}`, {
            description: 'Updated while open',
        });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(200);
    });

    it('PUT /api/proposals/:id rejects update after voting', async () => {
        // Transition open → voting
        const { req: tReq, url: tUrl } = fakeReq('POST', `/api/proposals/${proposalId}/transition`, {
            status: 'voting',
        });
        await handleProposalRoutes(tReq, tUrl, db);

        const { req, url } = fakeReq('PUT', `/api/proposals/${proposalId}`, { title: 'Too Late' });
        const res = await handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(400);
    });

    // ─── GET evaluate ────────────────────────────────────────────────────

    it('GET /api/proposals/:id/evaluate returns evaluation', async () => {
        const { req, url } = fakeReq('GET', `/api/proposals/${proposalId}/evaluate`);
        const res = handleProposalRoutes(req, url, db);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.proposalId).toBe(proposalId);
        expect(data.totalMembers).toBe(2);
        expect(data.evaluation).toBeDefined();
    });

    it('GET /api/proposals/:id/evaluate returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/proposals/nonexistent/evaluate');
        const res = handleProposalRoutes(req, url, db);
        expect((res as Response).status).toBe(404);
    });

    // ─── Unmatched paths ─────────────────────────────────────────────────

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleProposalRoutes(req, url, db);
        expect(res).toBeNull();
    });
});
