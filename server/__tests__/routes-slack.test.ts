import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { handleSlackRoutes } from '../routes/slack';
import type { ProcessManager } from '../process/manager';
import * as crypto from 'crypto';

let db: Database;

const SIGNING_SECRET = 'test-signing-secret';

function createMockPM(): ProcessManager {
    return {
        startProcess: mock(() => {}),
        stopProcess: mock(() => {}),
        resumeProcess: mock(() => {}),
        resumeSession: mock(() => true),
        sendMessage: mock(() => true),
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        isRunning: mock(() => false),
        approvalManager: { resolveRequest: mock(() => {}), getQueuedRequests: mock(() => []), operationalMode: 'default' },
        ownerQuestionManager: {
            resolveQuestion: mock(() => true),
        },
    } as unknown as ProcessManager;
}

function signRequest(body: string, timestamp?: number): { timestamp: string; signature: string } {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const sigBasestring = `v0:${ts}:${body}`;
    const hmac = crypto.createHmac('sha256', SIGNING_SECRET);
    hmac.update(sigBasestring);
    const signature = `v0=${hmac.digest('hex')}`;
    return { timestamp: String(ts), signature };
}

function fakeSlackReq(
    body: string,
    contentType = 'application/json',
    timestamp?: number,
): { req: Request; url: URL } {
    const url = new URL('http://localhost:3000/slack/events');
    const { timestamp: ts, signature } = signRequest(body, timestamp);
    const req = new Request(url.toString(), {
        method: 'POST',
        body,
        headers: {
            'Content-Type': contentType,
            'X-Slack-Request-Timestamp': ts,
            'X-Slack-Signature': signature,
        },
    });
    return { req, url };
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterAll(() => db.close());

describe('Slack Routes', () => {
    beforeEach(() => {
        process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
        delete process.env.SLACK_BOT_TOKEN;
    });

    it('returns null for unmatched paths', () => {
        const pm = createMockPM();
        const url = new URL('http://localhost:3000/api/other');
        const req = new Request(url.toString(), { method: 'POST' });
        const res = handleSlackRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });

    it('returns null for non-POST /slack/events', () => {
        const pm = createMockPM();
        const url = new URL('http://localhost:3000/slack/events');
        const req = new Request(url.toString(), { method: 'GET' });
        const res = handleSlackRoutes(req, url, db, pm);
        expect(res).toBeNull();
    });

    it('returns 503 when SLACK_SIGNING_SECRET is not set', async () => {
        delete process.env.SLACK_SIGNING_SECRET;
        const pm = createMockPM();
        const url = new URL('http://localhost:3000/slack/events');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: '{}',
            headers: { 'Content-Type': 'application/json' },
        });
        const res = await handleSlackRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(503);
    });

    it('returns 401 for invalid signature', async () => {
        const pm = createMockPM();
        const url = new URL('http://localhost:3000/slack/events');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
                'X-Slack-Signature': 'v0=invalidsignature',
            },
        });
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(401);
    });

    it('returns 401 for missing signature headers', async () => {
        const pm = createMockPM();
        const url = new URL('http://localhost:3000/slack/events');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: '{}',
            headers: { 'Content-Type': 'application/json' },
        });
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(401);
    });

    it('returns 401 for stale timestamp (> 5 minutes old)', async () => {
        const pm = createMockPM();
        const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
        const body = JSON.stringify({ type: 'url_verification', challenge: 'test' });
        const { req, url } = fakeSlackReq(body, 'application/json', staleTimestamp);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(401);
    });

    it('handles url_verification challenge', async () => {
        const pm = createMockPM();
        const body = JSON.stringify({ type: 'url_verification', challenge: 'test-challenge-123' });
        const { req, url } = fakeSlackReq(body);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.challenge).toBe('test-challenge-123');
    });

    it('handles event_callback with no event gracefully', async () => {
        const pm = createMockPM();
        const body = JSON.stringify({ type: 'event_callback' });
        const { req, url } = fakeSlackReq(body);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('ignores bot messages to prevent loops', async () => {
        const pm = createMockPM();
        const body = JSON.stringify({
            type: 'event_callback',
            event: {
                type: 'message',
                text: 'bot reply',
                bot_id: 'B12345',
                thread_ts: '1234567890.123456',
                channel: 'C123',
            },
        });
        const { req, url } = fakeSlackReq(body);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('returns 400 for invalid JSON body', async () => {
        const pm = createMockPM();
        const body = 'this is not json';
        const { req, url } = fakeSlackReq(body);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('handles interactive payload with missing payload field', async () => {
        const pm = createMockPM();
        const body = 'nothing=here';
        const { req, url } = fakeSlackReq(body, 'application/x-www-form-urlencoded');
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('handles interactive payload with invalid JSON in payload field', async () => {
        const pm = createMockPM();
        const body = 'payload=not-valid-json';
        const { req, url } = fakeSlackReq(body, 'application/x-www-form-urlencoded');
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(400);
    });

    it('handles interactive payload with valid block_actions', async () => {
        const pm = createMockPM();
        const payload = JSON.stringify({
            type: 'block_actions',
            actions: [{ action_id: 'q:abc123:0', value: 'clicked' }],
            channel: { id: 'C123' },
        });
        const body = `payload=${encodeURIComponent(payload)}`;
        const { req, url } = fakeSlackReq(body, 'application/x-www-form-urlencoded');
        const res = await handleSlackRoutes(req, url, db, pm);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(data.ok).toBe(true);
    });

    it('handles unknown event types gracefully', async () => {
        const pm = createMockPM();
        const body = JSON.stringify({
            type: 'event_callback',
            event: { type: 'reaction_added', reaction: 'thumbsup' },
        });
        const { req, url } = fakeSlackReq(body);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(200);
    });

    it('handles unknown body type gracefully', async () => {
        const pm = createMockPM();
        const body = JSON.stringify({ type: 'unknown_type' });
        const { req, url } = fakeSlackReq(body);
        const res = await handleSlackRoutes(req, url, db, pm);
        expect((res as Response).status).toBe(200);
    });
});
