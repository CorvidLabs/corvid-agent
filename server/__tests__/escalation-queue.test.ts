import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    enqueueRequest,
    resolveRequest,
    getPendingRequests,
    expireOldRequests,
} from '../db/escalation-queue';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── enqueueRequest ─────────────────────────────────────────────────────────

describe('enqueueRequest', () => {
    test('creates a pending escalation and returns it', () => {
        const req = enqueueRequest(db, 'sess-1', 'bash', { command: 'rm -rf /' });
        expect(req.id).toBe(1);
        expect(req.sessionId).toBe('sess-1');
        expect(req.toolName).toBe('bash');
        expect(req.toolInput).toBe(JSON.stringify({ command: 'rm -rf /' }));
        expect(req.status).toBe('pending');
        expect(req.resolvedAt).toBeNull();
        expect(req.createdAt).toBeTruthy();
    });

    test('auto-increments IDs', () => {
        const r1 = enqueueRequest(db, 's1', 'tool_a', {});
        const r2 = enqueueRequest(db, 's2', 'tool_b', { x: 1 });
        expect(r2.id).toBe(r1.id + 1);
    });

    test('serialises complex tool input as JSON', () => {
        const input = { nested: { deeply: [1, 2, 3] }, flag: true };
        const req = enqueueRequest(db, 's1', 'deploy', input);
        expect(JSON.parse(req.toolInput)).toEqual(input);
    });
});

// ─── resolveRequest ─────────────────────────────────────────────────────────

describe('resolveRequest', () => {
    test('approves a pending request', () => {
        const pending = enqueueRequest(db, 's1', 'bash', { cmd: 'ls' });
        const resolved = resolveRequest(db, pending.id, 'approved');
        expect(resolved).not.toBeNull();
        expect(resolved!.status).toBe('approved');
        expect(resolved!.resolvedAt).toBeTruthy();
    });

    test('denies a pending request', () => {
        const pending = enqueueRequest(db, 's1', 'bash', { cmd: 'ls' });
        const resolved = resolveRequest(db, pending.id, 'denied');
        expect(resolved!.status).toBe('denied');
        expect(resolved!.resolvedAt).toBeTruthy();
    });

    test('does not re-resolve an already resolved request', () => {
        const pending = enqueueRequest(db, 's1', 'bash', { cmd: 'ls' });
        resolveRequest(db, pending.id, 'approved');

        // Try to deny an already-approved request — status should remain 'approved'
        const second = resolveRequest(db, pending.id, 'denied');
        expect(second!.status).toBe('approved');
    });

    test('returns the row even for a non-existent ID', () => {
        const result = resolveRequest(db, 9999, 'approved');
        expect(result).toBeNull();
    });
});

// ─── getPendingRequests ─────────────────────────────────────────────────────

describe('getPendingRequests', () => {
    test('returns empty array when no requests exist', () => {
        expect(getPendingRequests(db)).toEqual([]);
    });

    test('returns only pending requests, ordered by created_at ASC', () => {
        enqueueRequest(db, 's1', 'tool_a', {});
        const r2 = enqueueRequest(db, 's2', 'tool_b', {});
        enqueueRequest(db, 's3', 'tool_c', {});

        // Resolve the middle one
        resolveRequest(db, r2.id, 'denied');

        const pending = getPendingRequests(db);
        expect(pending).toHaveLength(2);
        expect(pending[0].toolName).toBe('tool_a');
        expect(pending[1].toolName).toBe('tool_c');
    });
});

// ─── expireOldRequests ──────────────────────────────────────────────────────

describe('expireOldRequests', () => {
    test('returns 0 when no pending requests exist', () => {
        expect(expireOldRequests(db)).toBe(0);
    });

    test('does not expire recently created requests with default 24h window', () => {
        enqueueRequest(db, 's1', 'tool_a', {});
        expect(expireOldRequests(db)).toBe(0);
        expect(getPendingRequests(db)).toHaveLength(1);
    });

    test('expires requests older than the specified age', () => {
        // Insert a request and backdate it by 48 hours
        enqueueRequest(db, 's1', 'old_tool', {});
        db.exec(
            `UPDATE escalation_queue SET created_at = datetime('now', '-48 hours') WHERE session_id = 's1'`
        );

        // Also insert a fresh one
        enqueueRequest(db, 's2', 'new_tool', {});

        const expired = expireOldRequests(db, 24);
        expect(expired).toBe(1);

        const pending = getPendingRequests(db);
        expect(pending).toHaveLength(1);
        expect(pending[0].toolName).toBe('new_tool');
    });

    test('does not expire already resolved requests', () => {
        const req = enqueueRequest(db, 's1', 'tool_a', {});
        resolveRequest(db, req.id, 'approved');

        // Backdate it
        db.exec(
            `UPDATE escalation_queue SET created_at = datetime('now', '-48 hours') WHERE id = ${req.id}`
        );

        expect(expireOldRequests(db, 24)).toBe(0);
    });
});
