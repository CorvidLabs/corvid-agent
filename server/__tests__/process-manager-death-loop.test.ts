/**
 * Tests for the zero-turn death loop circuit breaker in ProcessManager.resumeProcess.
 *
 * When the last ZERO_TURN_CIRCUIT_BREAKER_THRESHOLD (3) consecutive session
 * completions are all zero-turn, the circuit breaker:
 *   1. Purges all session messages
 *   2. Saves a conversation summary via updateSessionSummary
 *   3. Resets session status to idle
 *   4. Emits a session_error event with recoverable: true / errorType: 'context_exhausted'
 *   5. Falls through to start a fresh process
 *
 * Introduced in commit 0ee4602c.
 */

// mock.module MUST be before any imports to prevent real SDK spawning
import { mock } from 'bun:test';
mock.module('../process/sdk-process', () => ({
    startSdkProcess: () => ({ pid: 999, sendMessage: () => true, kill: () => {} }),
}));

import { test, expect, beforeEach, afterEach, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { ProcessManager } from '../process/manager';
import { createSession, getSession } from '../db/sessions';
import type { ClaudeStreamEvent } from '../process/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_ID = 'agent-death-loop-1';
const PROJECT_ID = 'proj-death-loop-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insertZeroTurnMessage(db: Database, sessionId: string): void {
    db.query(
        "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'system', 'Session completed. Turns: 0')",
    ).run(sessionId);
}

function insertNonZeroTurnMessage(db: Database, sessionId: string): void {
    db.query(
        "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'system', 'Session completed. Turns: 3')",
    ).run(sessionId);
}

function insertUserMessage(db: Database, sessionId: string, content = 'hello'): void {
    db.query(
        "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'user', ?)",
    ).run(sessionId, content);
}

function insertAssistantMessage(db: Database, sessionId: string, content = 'hi there'): void {
    db.query(
        "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
    ).run(sessionId, content);
}

function countMessages(db: Database, sessionId: string): number {
    const row = db.query('SELECT COUNT(*) as cnt FROM session_messages WHERE session_id = ?').get(sessionId) as { cnt: number };
    return row.cnt;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let db: Database;
let pm: ProcessManager;
let sessionId: string;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'claude-haiku-4-5-20251001', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);

    const session = createSession(db, { projectId: PROJECT_ID, agentId: AGENT_ID, name: 'DeathLoopTest' });
    sessionId = session.id;

    pm = new ProcessManager(db);
});

afterEach(() => {
    pm.shutdown();
    db.close();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('zero-turn death loop circuit breaker', () => {
    test('below threshold — 2 consecutive zero-turn messages: circuit breaker does NOT fire', () => {
        // Insert 2 zero-turn completions (below the threshold of 3)
        insertZeroTurnMessage(db, sessionId);
        insertZeroTurnMessage(db, sessionId);

        const msgCountBefore = countMessages(db, sessionId);

        const events: ClaudeStreamEvent[] = [];
        pm.subscribe(sessionId, (_sid, evt) => events.push(evt));

        const session = getSession(db, sessionId)!;
        pm.resumeProcess(session);

        // Messages must remain intact — circuit breaker did not fire
        expect(countMessages(db, sessionId)).toBe(msgCountBefore);

        // No session_error emitted by the circuit breaker
        const errorEvents = events.filter((e) => e.type === 'session_error');
        expect(errorEvents).toHaveLength(0);
    });

    test('at threshold — 3 consecutive zero-turn messages: circuit breaker fires', () => {
        // Insert exactly 3 zero-turn completions
        insertZeroTurnMessage(db, sessionId);
        insertZeroTurnMessage(db, sessionId);
        insertZeroTurnMessage(db, sessionId);

        const events: ClaudeStreamEvent[] = [];
        pm.subscribe(sessionId, (_sid, evt) => events.push(evt));

        const session = getSession(db, sessionId)!;
        pm.resumeProcess(session);

        // All messages must be purged
        expect(countMessages(db, sessionId)).toBe(0);

        // session_error must be emitted with the correct shape
        const errorEvents = events.filter((e) => e.type === 'session_error');
        expect(errorEvents.length).toBeGreaterThanOrEqual(1);

        const errEvt = errorEvents[0] as Extract<ClaudeStreamEvent, { type: 'session_error' }>;
        expect(errEvt.error.recoverable).toBe(true);
        expect(errEvt.error.errorType).toBe('context_exhausted');
    });

    test('interrupted sequence — non-zero-turn message between zero-turns: circuit breaker does NOT fire', () => {
        // Pattern: zero, non-zero, zero — not 3 consecutive zero-turns
        insertZeroTurnMessage(db, sessionId);
        insertNonZeroTurnMessage(db, sessionId);
        insertZeroTurnMessage(db, sessionId);

        const msgCountBefore = countMessages(db, sessionId);

        const events: ClaudeStreamEvent[] = [];
        pm.subscribe(sessionId, (_sid, evt) => events.push(evt));

        const session = getSession(db, sessionId)!;
        pm.resumeProcess(session);

        // Messages must remain intact
        expect(countMessages(db, sessionId)).toBe(msgCountBefore);

        // No circuit-breaker session_error
        const errorEvents = events.filter((e) => e.type === 'session_error');
        expect(errorEvents).toHaveLength(0);
    });

    test('full purge — user, assistant, and system messages are all deleted when circuit breaker fires', () => {
        // Mix in user/assistant messages alongside the zero-turn system messages
        insertUserMessage(db, sessionId, 'do something');
        insertAssistantMessage(db, sessionId, 'ok');
        insertZeroTurnMessage(db, sessionId);
        insertUserMessage(db, sessionId, 'try again');
        insertZeroTurnMessage(db, sessionId);
        insertUserMessage(db, sessionId, 'one more time');
        insertZeroTurnMessage(db, sessionId);

        const events: ClaudeStreamEvent[] = [];
        pm.subscribe(sessionId, (_sid, evt) => events.push(evt));

        const session = getSession(db, sessionId)!;
        pm.resumeProcess(session);

        // All messages across all roles must be purged
        expect(countMessages(db, sessionId)).toBe(0);

        // Verify individually by role
        const byRole = db.query(
            "SELECT role, COUNT(*) as cnt FROM session_messages WHERE session_id = ? GROUP BY role",
        ).all(sessionId) as { role: string; cnt: number }[];
        expect(byRole).toHaveLength(0);

        // session_error fired with correct flags
        const errorEvents = events.filter((e) => e.type === 'session_error');
        expect(errorEvents.length).toBeGreaterThanOrEqual(1);
        const errEvt = errorEvents[0] as Extract<ClaudeStreamEvent, { type: 'session_error' }>;
        expect(errEvt.error.recoverable).toBe(true);
        expect(errEvt.error.errorType).toBe('context_exhausted');
    });
});
