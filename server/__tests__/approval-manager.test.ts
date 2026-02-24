/**
 * Tests for ApprovalManager — the in-memory approval workflow engine.
 *
 * Covers:
 * - Normal mode: request → timeout → escalation
 * - Paused mode: immediate deny
 * - Queued mode: immediate queue to DB
 * - Request resolution (by ID, short ID)
 * - Sender address validation
 * - Session cancellation
 * - Shutdown cleanup
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ApprovalManager } from '../process/approval-manager';
import type { ApprovalRequest, ApprovalResponse } from '../process/approval-types';

let db: Database;
let manager: ApprovalManager;

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
        id: overrides.id ?? crypto.randomUUID(),
        sessionId: overrides.sessionId ?? 'session-1',
        toolName: overrides.toolName ?? 'Bash',
        toolInput: overrides.toolInput ?? { command: 'ls' },
        description: overrides.description ?? 'Run command: ls',
        createdAt: overrides.createdAt ?? Date.now(),
        timeoutMs: overrides.timeoutMs ?? 200,
        source: overrides.source ?? 'web',
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    manager = new ApprovalManager();
    manager.setDatabase(db);
});

afterEach(() => {
    manager.shutdown();
    db.close();
});

// ── Operational Mode ────────────────────────────────────────────────────

describe('Operational Mode', () => {
    it('starts in normal mode', () => {
        expect(manager.operationalMode).toBe('normal');
    });

    it('can be changed to queued', () => {
        manager.operationalMode = 'queued';
        expect(manager.operationalMode).toBe('queued');
    });

    it('can be changed to paused', () => {
        manager.operationalMode = 'paused';
        expect(manager.operationalMode).toBe('paused');
    });
});

// ── Paused Mode ─────────────────────────────────────────────────────────

describe('Paused Mode', () => {
    it('immediately denies requests in paused mode', async () => {
        manager.operationalMode = 'paused';
        const request = makeRequest();
        const response = await manager.createRequest(request);

        expect(response.requestId).toBe(request.id);
        expect(response.behavior).toBe('deny');
        expect(response.message).toContain('paused mode');
    });

    it('does not add to pending map in paused mode', async () => {
        manager.operationalMode = 'paused';
        await manager.createRequest(makeRequest());
        expect(manager.hasPendingRequests()).toBe(false);
    });
});

// ── Normal Mode: Timeout ────────────────────────────────────────────────

describe('Normal Mode Timeout', () => {
    it('denies request on timeout', async () => {
        const request = makeRequest({ timeoutMs: 50 });
        const response = await manager.createRequest(request);

        expect(response.requestId).toBe(request.id);
        expect(response.behavior).toBe('deny');
        expect(response.message).toContain('timed out');
    });

    it('removes from pending after timeout', async () => {
        const request = makeRequest({ timeoutMs: 50 });
        expect(manager.hasPendingRequests()).toBe(false);

        // Start the request (don't await yet)
        const promise = manager.createRequest(request);
        expect(manager.hasPendingRequests()).toBe(true);

        await promise;
        expect(manager.hasPendingRequests()).toBe(false);
    });
});

// ── Normal Mode: Resolve ────────────────────────────────────────────────

describe('Resolve Request', () => {
    it('resolves a pending request with allow', async () => {
        const request = makeRequest({ timeoutMs: 5000 });
        const promise = manager.createRequest(request);

        const resolved = manager.resolveRequest(request.id, {
            requestId: request.id,
            behavior: 'allow',
            message: 'Approved',
        });
        expect(resolved).toBe(true);

        const response = await promise;
        expect(response.behavior).toBe('allow');
        expect(response.message).toBe('Approved');
    });

    it('resolves a pending request with deny', async () => {
        const request = makeRequest({ timeoutMs: 5000 });
        const promise = manager.createRequest(request);

        manager.resolveRequest(request.id, {
            requestId: request.id,
            behavior: 'deny',
            message: 'Not allowed',
        });

        const response = await promise;
        expect(response.behavior).toBe('deny');
    });

    it('returns false for unknown request ID', () => {
        const result = manager.resolveRequest('nonexistent', {
            requestId: 'nonexistent',
            behavior: 'allow',
        });
        expect(result).toBe(false);
    });

    it('returns false for already-resolved request', async () => {
        const request = makeRequest({ timeoutMs: 5000 });
        const promise = manager.createRequest(request);

        manager.resolveRequest(request.id, { requestId: request.id, behavior: 'allow' });
        await promise;

        // Second resolve should fail
        const result = manager.resolveRequest(request.id, { requestId: request.id, behavior: 'deny' });
        expect(result).toBe(false);
    });
});

// ── Resolve by Short ID ─────────────────────────────────────────────────

describe('Resolve by Short ID', () => {
    it('resolves by prefix match', async () => {
        const id = 'abcdef12-3456-7890-abcd-ef1234567890';
        const request = makeRequest({ id, timeoutMs: 5000 });
        const promise = manager.createRequest(request);

        const resolved = manager.resolveByShortId('abcdef', { behavior: 'allow' });
        expect(resolved).toBe(true);

        const response = await promise;
        expect(response.behavior).toBe('allow');
    });

    it('is case-insensitive', async () => {
        const id = 'ABCdef12-3456-7890-abcd-ef1234567890';
        const request = makeRequest({ id, timeoutMs: 5000 });
        const promise = manager.createRequest(request);

        const resolved = manager.resolveByShortId('abcdef', { behavior: 'deny' });
        expect(resolved).toBe(true);

        const response = await promise;
        expect(response.behavior).toBe('deny');
    });

    it('returns false when no match', () => {
        const result = manager.resolveByShortId('zzzzz', { behavior: 'allow' });
        expect(result).toBe(false);
    });

    it('rejects response from wrong sender address', async () => {
        const request = makeRequest({ id: 'abcdef00-0000-0000-0000-000000000000', timeoutMs: 5000 });
        const promise = manager.createRequest(request, 'OWNER_ADDRESS_1');

        const resolved = manager.resolveByShortId('abcdef', { behavior: 'allow' }, 'DIFFERENT_ADDRESS');
        expect(resolved).toBe(false);

        // Clean up: resolve properly
        manager.resolveRequest(request.id, { requestId: request.id, behavior: 'deny' });
        await promise;
    });

    it('allows response from correct sender address', async () => {
        const request = makeRequest({ id: 'abcdef00-0000-0000-0000-000000000000', timeoutMs: 5000 });
        const promise = manager.createRequest(request, 'OWNER_ADDRESS_1');

        const resolved = manager.resolveByShortId('abcdef', { behavior: 'allow' }, 'OWNER_ADDRESS_1');
        expect(resolved).toBe(true);

        const response = await promise;
        expect(response.behavior).toBe('allow');
    });
});

// ── Sender Address ──────────────────────────────────────────────────────

describe('setSenderAddress', () => {
    it('sets sender address on existing request', async () => {
        const request = makeRequest({ id: 'sender-test-00000000-0000-000000000000', timeoutMs: 5000 });
        const promise = manager.createRequest(request);

        // Set sender address after creation
        manager.setSenderAddress(request.id, 'MY_WALLET');

        // Now resolving with wrong sender should fail
        const resolved = manager.resolveByShortId('sender-test', { behavior: 'allow' }, 'OTHER_WALLET');
        expect(resolved).toBe(false);

        // Resolve with correct sender
        const resolved2 = manager.resolveByShortId('sender-test', { behavior: 'allow' }, 'MY_WALLET');
        expect(resolved2).toBe(true);
        await promise;
    });
});

// ── Session Operations ──────────────────────────────────────────────────

describe('Session Operations', () => {
    it('getPendingForSession returns requests for that session', async () => {
        const r1 = makeRequest({ sessionId: 'sess-A', timeoutMs: 5000 });
        const r2 = makeRequest({ sessionId: 'sess-B', timeoutMs: 5000 });
        const r3 = makeRequest({ sessionId: 'sess-A', timeoutMs: 5000 });

        const p1 = manager.createRequest(r1);
        const p2 = manager.createRequest(r2);
        const p3 = manager.createRequest(r3);

        const pending = manager.getPendingForSession('sess-A');
        expect(pending.length).toBe(2);
        expect(pending.map(r => r.id).sort()).toEqual([r1.id, r3.id].sort());

        // Cleanup
        manager.shutdown();
        await Promise.all([p1, p2, p3]);
    });

    it('cancelSession denies all pending requests for that session', async () => {
        const r1 = makeRequest({ sessionId: 'sess-cancel', timeoutMs: 5000 });
        const r2 = makeRequest({ sessionId: 'sess-cancel', timeoutMs: 5000 });
        const r3 = makeRequest({ sessionId: 'sess-other', timeoutMs: 5000 });

        const p1 = manager.createRequest(r1);
        const p2 = manager.createRequest(r2);
        const p3 = manager.createRequest(r3);

        manager.cancelSession('sess-cancel');

        const resp1 = await p1;
        const resp2 = await p2;

        expect(resp1.behavior).toBe('deny');
        expect(resp1.message).toContain('Session stopped');
        expect(resp2.behavior).toBe('deny');

        // sess-other should still be pending
        expect(manager.getPendingForSession('sess-other').length).toBe(1);

        // Cleanup
        manager.resolveRequest(r3.id, { requestId: r3.id, behavior: 'deny' });
        await p3;
    });
});

// ── Default Timeout ─────────────────────────────────────────────────────

describe('getDefaultTimeout', () => {
    it('returns longer timeout for algochat source', () => {
        const algochat = manager.getDefaultTimeout('algochat');
        const web = manager.getDefaultTimeout('web');
        expect(algochat).toBeGreaterThan(web);
    });

    it('returns web timeout for non-algochat sources', () => {
        const web = manager.getDefaultTimeout('web');
        const api = manager.getDefaultTimeout('api');
        expect(web).toBe(api);
    });
});

// ── Queued Requests (DB escalation) ─────────────────────────────────────

describe('Queued Requests', () => {
    it('getQueuedRequests returns empty when no queued requests', () => {
        expect(manager.getQueuedRequests()).toEqual([]);
    });

    it('resolveQueuedRequest returns false when DB not set', () => {
        const noDbManager = new ApprovalManager();
        expect(noDbManager.resolveQueuedRequest(1, true)).toBe(false);
        noDbManager.shutdown();
    });
});

// ── Shutdown ────────────────────────────────────────────────────────────

describe('Shutdown', () => {
    it('denies all pending requests on shutdown', async () => {
        const r1 = makeRequest({ timeoutMs: 60000 });
        const r2 = makeRequest({ timeoutMs: 60000 });

        const p1 = manager.createRequest(r1);
        const p2 = manager.createRequest(r2);

        manager.shutdown();

        const resp1 = await p1;
        const resp2 = await p2;

        expect(resp1.behavior).toBe('deny');
        expect(resp1.message).toContain('shutting down');
        expect(resp2.behavior).toBe('deny');
    });

    it('clears pending map on shutdown', async () => {
        const request = makeRequest({ timeoutMs: 60000 });
        const promise = manager.createRequest(request);

        manager.shutdown();
        await promise;

        expect(manager.hasPendingRequests()).toBe(false);
    });
});

// ── hasPendingRequests ──────────────────────────────────────────────────

describe('hasPendingRequests', () => {
    it('returns false when no requests', () => {
        expect(manager.hasPendingRequests()).toBe(false);
    });

    it('returns true when requests are pending', async () => {
        const request = makeRequest({ timeoutMs: 5000 });
        const promise = manager.createRequest(request);
        expect(manager.hasPendingRequests()).toBe(true);

        // Cleanup
        manager.resolveRequest(request.id, { requestId: request.id, behavior: 'deny' });
        await promise;
    });
});
