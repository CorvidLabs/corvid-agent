import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ProcessManager } from '../process/manager';
import { createSession } from '../db/sessions';
import { getSessionMetrics } from '../db/session-metrics';
import type { ClaudeStreamEvent, DirectProcessMetrics } from '../process/types';

/**
 * Tests for ProcessManager session metrics persistence.
 *
 * Verifies that when a 'result' event with metrics is received,
 * the metrics are persisted to the session_metrics table.
 */

let db: Database;
let pm: ProcessManager;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';
let sessionId: string;

function makeMetrics(overrides: Partial<DirectProcessMetrics> = {}): DirectProcessMetrics {
    return {
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
    pm = new ProcessManager(db);
});

afterEach(() => {
    pm.shutdown();
    db.close();
});

describe('ProcessManager metrics persistence', () => {
    test('persists session metrics on result event with metrics', () => {
        const metrics = makeMetrics();
        const event = {
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0,
            duration_ms: 15000,
            num_turns: 5,
            session_id: sessionId,
            metrics,
        } as ClaudeStreamEvent;

        // Call handleEvent via bracket notation (private method)
        (pm as any).handleEvent(sessionId, event);

        // Verify metrics were persisted
        const rows = getSessionMetrics(db, sessionId);
        expect(rows).toHaveLength(1);
        expect(rows[0].model).toBe('llama3.1:70b');
        expect(rows[0].tier).toBe('standard');
        expect(rows[0].totalIterations).toBe(5);
        expect(rows[0].toolCallCount).toBe(12);
        expect(rows[0].maxChainDepth).toBe(4);
        expect(rows[0].nudgeCount).toBe(1);
        expect(rows[0].midChainNudgeCount).toBe(0);
        expect(rows[0].explorationDriftCount).toBe(0);
        expect(rows[0].stallDetected).toBe(false);
        expect(rows[0].stallType).toBeNull();
        expect(rows[0].terminationReason).toBe('normal');
        expect(rows[0].durationMs).toBe(15000);
        expect(rows[0].needsSummary).toBe(false);
    });

    test('persists stall metrics correctly', () => {
        const metrics = makeMetrics({
            stallDetected: true,
            stallType: 'repeat',
            terminationReason: 'stall_repeat',
            needsSummary: true,
        });
        const event = {
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0,
            duration_ms: 5000,
            num_turns: 3,
            session_id: sessionId,
            metrics,
        } as ClaudeStreamEvent;

        (pm as any).handleEvent(sessionId, event);

        const rows = getSessionMetrics(db, sessionId);
        expect(rows).toHaveLength(1);
        expect(rows[0].stallDetected).toBe(true);
        expect(rows[0].stallType).toBe('repeat');
        expect(rows[0].terminationReason).toBe('stall_repeat');
        expect(rows[0].needsSummary).toBe(true);
    });

    test('does not persist metrics for result events without metrics', () => {
        const event = {
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0,
            duration_ms: 1000,
            num_turns: 1,
            session_id: sessionId,
        } as ClaudeStreamEvent;

        (pm as any).handleEvent(sessionId, event);

        const rows = getSessionMetrics(db, sessionId);
        expect(rows).toHaveLength(0);
    });

    test('does not persist metrics for non-result events', () => {
        const event = {
            type: 'assistant',
            message: { content: 'hello' },
        } as ClaudeStreamEvent;

        (pm as any).handleEvent(sessionId, event);

        const rows = getSessionMetrics(db, sessionId);
        expect(rows).toHaveLength(0);
    });

    test('handles metrics persistence failure gracefully', () => {
        // Use an invalid session ID that violates FK constraint
        const metrics = makeMetrics();
        const event = {
            type: 'result',
            subtype: 'success',
            total_cost_usd: 0,
            duration_ms: 5000,
            num_turns: 1,
            session_id: 'nonexistent-session',
            metrics,
        } as ClaudeStreamEvent;

        // Should not throw — error is caught and logged
        expect(() => {
            (pm as any).handleEvent('nonexistent-session', event);
        }).not.toThrow();
    });
});
