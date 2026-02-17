import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleReputationRoutes } from '../routes/reputation';
import { ReputationScorer } from '../reputation/scorer';
import { ReputationAttestation } from '../reputation/attestation';

let db: Database;
let scorer: ReputationScorer;
let attestation: ReputationAttestation;
let agentId: string;
let projectId: string;

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

    // Seed an agent and project for FK constraints
    agentId = crypto.randomUUID();
    projectId = crypto.randomUUID();
    db.query("INSERT INTO agents (id, name) VALUES (?, 'Reputation Agent')").run(agentId);
    db.query("INSERT INTO projects (id, name, working_dir) VALUES (?, 'Test', '/tmp')").run(projectId);

    scorer = new ReputationScorer(db);
    attestation = new ReputationAttestation(db);
});

afterAll(() => db.close());

describe('Reputation Routes', () => {
    // ─── Service unavailable ─────────────────────────────────────────────────

    it('returns 503 when scorer is not available', async () => {
        const { req, url } = fakeReq('GET', '/api/reputation/scores');
        const res = await handleReputationRoutes(req, url, db, undefined, undefined);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.error).toContain('Reputation service not available');
    });

    it('returns null for non-reputation paths when service is unavailable', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleReputationRoutes(req, url, db, undefined, undefined);
        expect(res).toBeNull();
    });

    // ─── Events ──────────────────────────────────────────────────────────────

    it('POST /api/reputation/events records a valid event', async () => {
        const { req, url } = fakeReq('POST', '/api/reputation/events', {
            agentId,
            eventType: 'task_completed',
            scoreImpact: 10,
            metadata: { taskId: 'task-1' },
        });
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(201);
        const data = await res!.json();
        expect(data.ok).toBe(true);
    });

    it('POST /api/reputation/events rejects missing agentId', async () => {
        const { req, url } = fakeReq('POST', '/api/reputation/events', {
            eventType: 'task_completed',
            scoreImpact: 5,
        });
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('agentId');
    });

    it('POST /api/reputation/events rejects invalid event type', async () => {
        const { req, url } = fakeReq('POST', '/api/reputation/events', {
            agentId,
            eventType: 'invalid_type',
            scoreImpact: 5,
        });
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('eventType');
    });

    it('POST /api/reputation/events rejects missing scoreImpact', async () => {
        const { req, url } = fakeReq('POST', '/api/reputation/events', {
            agentId,
            eventType: 'task_completed',
        });
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res!.status).toBe(400);
        const data = await res!.json();
        expect(data.error).toContain('scoreImpact');
    });

    it('GET /api/reputation/events/:agentId returns events for agent', async () => {
        const { req, url } = fakeReq('GET', `/api/reputation/events/${agentId}`);
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].agent_id).toBe(agentId);
        expect(data[0].event_type).toBe('task_completed');
    });

    // ─── Scores ──────────────────────────────────────────────────────────────

    it('GET /api/reputation/scores/:agentId computes and returns score', async () => {
        const { req, url } = fakeReq('GET', `/api/reputation/scores/${agentId}`);
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.agentId).toBe(agentId);
        expect(typeof data.overallScore).toBe('number');
        expect(data.trustLevel).toBeDefined();
        expect(data.components).toBeDefined();
        expect(typeof data.components.taskCompletion).toBe('number');
        expect(typeof data.components.securityCompliance).toBe('number');
    });

    it('GET /api/reputation/scores returns all scores', async () => {
        const { req, url } = fakeReq('GET', '/api/reputation/scores');
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        expect(data[0].agentId).toBe(agentId);
    });

    it('POST /api/reputation/scores/:agentId force-recomputes score', async () => {
        const { req, url } = fakeReq('POST', `/api/reputation/scores/${agentId}`);
        const res = await handleReputationRoutes(req, url, db, scorer, attestation)!;
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(data.agentId).toBe(agentId);
        expect(typeof data.overallScore).toBe('number');
    });

    // ─── Unmatched path ──────────────────────────────────────────────────────

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleReputationRoutes(req, url, db, scorer, attestation);
        expect(res).toBeNull();
    });
});
