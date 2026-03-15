import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createSession } from '../db/sessions';
import {
    insertSessionMetrics,
    getSessionMetrics,
    getMetricsAggregate,
    listRecentMetrics,
    type SessionMetricsInput,
} from '../db/session-metrics';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

function makeMetricsInput(overrides: Partial<SessionMetricsInput> = {}): SessionMetricsInput {
    return {
        sessionId,
        model: 'llama3.1:70b',
        tier: 'standard',
        totalIterations: 5,
        toolCallCount: 12,
        maxChainDepth: 4,
        nudgeCount: 1,
        midChainNudgeCount: 0,
        explorationDriftCount: 0,
        stallDetected: false,
        stallType: null,
        terminationReason: 'normal',
        durationMs: 15000,
        needsSummary: false,
        ...overrides,
    };
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'Test' });
    sessionId = session.id;
});

afterEach(() => {
    db.close();
});

// ── insertSessionMetrics ─────────────────────────────────────────────

describe('insertSessionMetrics', () => {
    test('inserts and returns metrics', () => {
        const m = insertSessionMetrics(db, makeMetricsInput());
        expect(m.id).toBeGreaterThan(0);
        expect(m.sessionId).toBe(sessionId);
        expect(m.model).toBe('llama3.1:70b');
        expect(m.tier).toBe('standard');
        expect(m.totalIterations).toBe(5);
        expect(m.toolCallCount).toBe(12);
        expect(m.maxChainDepth).toBe(4);
        expect(m.nudgeCount).toBe(1);
        expect(m.midChainNudgeCount).toBe(0);
        expect(m.stallDetected).toBe(false);
        expect(m.stallType).toBeNull();
        expect(m.terminationReason).toBe('normal');
        expect(m.durationMs).toBe(15000);
        expect(m.needsSummary).toBe(false);
        expect(m.createdAt).toBeTruthy();
    });

    test('stores stall info correctly', () => {
        const m = insertSessionMetrics(db, makeMetricsInput({
            stallDetected: true,
            stallType: 'repeat',
            terminationReason: 'stall_repeat',
            needsSummary: true,
        }));
        expect(m.stallDetected).toBe(true);
        expect(m.stallType).toBe('repeat');
        expect(m.terminationReason).toBe('stall_repeat');
        expect(m.needsSummary).toBe(true);
    });

    test('multiple metrics per session', () => {
        insertSessionMetrics(db, makeMetricsInput({ totalIterations: 3 }));
        insertSessionMetrics(db, makeMetricsInput({ totalIterations: 7 }));
        const all = getSessionMetrics(db, sessionId);
        expect(all).toHaveLength(2);
        expect(all[0].totalIterations).toBe(3);
        expect(all[1].totalIterations).toBe(7);
    });
});

// ── getSessionMetrics ────────────────────────────────────────────────

describe('getSessionMetrics', () => {
    test('returns empty array for unknown session', () => {
        const result = getSessionMetrics(db, 'nonexistent');
        expect(result).toEqual([]);
    });

    test('returns metrics in creation order', () => {
        insertSessionMetrics(db, makeMetricsInput({ model: 'a' }));
        insertSessionMetrics(db, makeMetricsInput({ model: 'b' }));
        const all = getSessionMetrics(db, sessionId);
        expect(all[0].model).toBe('a');
        expect(all[1].model).toBe('b');
    });
});

// ── getMetricsAggregate ──────────────────────────────────────────────

describe('getMetricsAggregate', () => {
    test('returns zeroes with no data', () => {
        const agg = getMetricsAggregate(db);
        expect(agg.totalSessions).toBe(0);
        expect(agg.avgIterations).toBe(0);
        expect(agg.stallRate).toBe(0);
        expect(agg.byTerminationReason).toEqual({});
    });

    test('computes aggregate metrics', () => {
        insertSessionMetrics(db, makeMetricsInput({
            totalIterations: 10,
            toolCallCount: 20,
            maxChainDepth: 5,
            durationMs: 10000,
        }));
        insertSessionMetrics(db, makeMetricsInput({
            totalIterations: 6,
            toolCallCount: 8,
            maxChainDepth: 3,
            durationMs: 20000,
            stallDetected: true,
            stallType: 'repeat',
            terminationReason: 'stall_repeat',
        }));

        const agg = getMetricsAggregate(db);
        expect(agg.totalSessions).toBe(2);
        expect(agg.avgIterations).toBe(8);
        expect(agg.avgToolCalls).toBe(14);
        expect(agg.avgChainDepth).toBe(4);
        expect(agg.avgDurationMs).toBe(15000);
        expect(agg.stallRate).toBe(0.5);
        expect(agg.byTerminationReason).toEqual({ normal: 1, stall_repeat: 1 });
        expect(agg.byStallType).toEqual({ repeat: 1 });
    });

    test('filters by model', () => {
        insertSessionMetrics(db, makeMetricsInput({ model: 'alpha' }));
        insertSessionMetrics(db, makeMetricsInput({ model: 'beta' }));

        const agg = getMetricsAggregate(db, { model: 'alpha' });
        expect(agg.totalSessions).toBe(1);
    });

    test('filters by tier', () => {
        insertSessionMetrics(db, makeMetricsInput({ tier: 'high' }));
        insertSessionMetrics(db, makeMetricsInput({ tier: 'limited' }));

        const agg = getMetricsAggregate(db, { tier: 'high' });
        expect(agg.totalSessions).toBe(1);
    });

    test('filters by days', () => {
        insertSessionMetrics(db, makeMetricsInput({ model: 'recent' }));
        const agg = getMetricsAggregate(db, { days: 7 });
        expect(agg.totalSessions).toBe(1);
    });

    test('combines model and days filters', () => {
        insertSessionMetrics(db, makeMetricsInput({ model: 'alpha' }));
        insertSessionMetrics(db, makeMetricsInput({ model: 'beta' }));
        const agg = getMetricsAggregate(db, { model: 'alpha', days: 30 });
        expect(agg.totalSessions).toBe(1);
    });
});

// ── listRecentMetrics ────────────────────────────────────────────────

describe('listRecentMetrics', () => {
    test('returns empty when no metrics', () => {
        expect(listRecentMetrics(db)).toEqual([]);
    });

    test('respects limit', () => {
        for (let i = 0; i < 5; i++) {
            insertSessionMetrics(db, makeMetricsInput({ totalIterations: i }));
        }
        const recent = listRecentMetrics(db, 3);
        expect(recent).toHaveLength(3);
    });

    test('returns most recent first', () => {
        insertSessionMetrics(db, makeMetricsInput({ model: 'first' }));
        insertSessionMetrics(db, makeMetricsInput({ model: 'second' }));
        const recent = listRecentMetrics(db);
        expect(recent[0].model).toBe('second');
        expect(recent[1].model).toBe('first');
    });
});
