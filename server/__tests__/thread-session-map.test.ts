/**
 * Tests for thread-session-map.ts
 *
 * Covers: normalizeTimestamp, formatDuration, tryRecoverThread
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    normalizeTimestamp,
    formatDuration,
    tryRecoverThread,
} from '../discord/thread-session-map';
import type { ThreadSessionInfo } from '../discord/thread-session-map';

// ─── normalizeTimestamp ───────────────────────────────────────────────────────

describe('normalizeTimestamp', () => {
    test('appends Z to bare SQLite timestamp', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00')).toBe('2026-03-14 12:30:00Z');
    });

    test('does not double-append Z', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00Z')).toBe('2026-03-14 12:30:00Z');
    });

    test('handles ISO format with T separator', () => {
        expect(normalizeTimestamp('2026-03-14T12:30:00')).toBe('2026-03-14T12:30:00Z');
    });

    test('handles fractional seconds', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00.123')).toBe('2026-03-14 12:30:00.123Z');
    });

    test('result parses as UTC — hours and minutes are preserved', () => {
        const ts = normalizeTimestamp('2026-03-14 09:15:00');
        const d = new Date(ts);
        expect(d.getUTCHours()).toBe(9);
        expect(d.getUTCMinutes()).toBe(15);
    });
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
    test('formats seconds only', () => {
        expect(formatDuration(45000)).toBe('45s');
    });

    test('formats minutes and seconds', () => {
        expect(formatDuration(125000)).toBe('2m 5s');
    });

    test('formats zero milliseconds as 0s', () => {
        expect(formatDuration(0)).toBe('0s');
    });

    test('clamps negative values to 0s', () => {
        expect(formatDuration(-5000)).toBe('0s');
    });

    test('formats large durations (over 1 hour)', () => {
        expect(formatDuration(3661000)).toBe('61m 1s');
    });

    test('sub-second duration truncates to 0s', () => {
        expect(formatDuration(999)).toBe('0s');
    });

    test('exactly one minute formats as 1m 0s', () => {
        expect(formatDuration(60000)).toBe('1m 0s');
    });

    test('59 seconds formats without minutes prefix', () => {
        expect(formatDuration(59000)).toBe('59s');
    });
});

// ─── tryRecoverThread ─────────────────────────────────────────────────────────

describe('tryRecoverThread', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        runMigrations(db);
    });

    test('returns null when no matching session exists', () => {
        const sessions = new Map<string, ThreadSessionInfo>();
        const result = tryRecoverThread(db, sessions, '123456789012345678');
        expect(result).toBeNull();
        expect(sessions.size).toBe(0);
    });

    test('recovers session from DB and populates map', () => {
        // Insert minimal agent + session rows
        db.run(`INSERT INTO agents (id, name, model) VALUES ('agent-1', 'TestBot', 'claude-sonnet-4-6')`);
        db.run(`INSERT INTO sessions (id, agent_id, name, source) VALUES ('sess-1', 'agent-1', 'Discord thread:999000999000999000', 'discord')`);

        const sessions = new Map<string, ThreadSessionInfo>();
        const result = tryRecoverThread(db, sessions, '999000999000999000');

        expect(result).not.toBeNull();
        expect(result!.sessionId).toBe('sess-1');
        expect(result!.agentName).toBe('TestBot');
        expect(result!.agentModel).toBe('claude-sonnet-4-6');
        expect(sessions.get('999000999000999000')).toEqual(result!);
    });

    test('returns null for non-discord session with matching thread name pattern', () => {
        db.run(`INSERT INTO agents (id, name, model) VALUES ('agent-2', 'BotB', 'claude-haiku-4-5-20251001')`);
        db.run(`INSERT INTO sessions (id, agent_id, name, source) VALUES ('sess-2', 'agent-2', 'Discord thread:111222333444555666', 'telegram')`);

        const sessions = new Map<string, ThreadSessionInfo>();
        const result = tryRecoverThread(db, sessions, '111222333444555666');
        // Must match source = 'discord'
        expect(result).toBeNull();
    });

    test('uses most-recent session when multiple exist for same thread', () => {
        db.run(`INSERT INTO agents (id, name, model) VALUES ('agent-3', 'BotC', 'claude-opus-4-6')`);
        db.run(`INSERT INTO sessions (id, agent_id, name, source, created_at) VALUES ('sess-old', 'agent-3', 'Discord thread:777888999000111222', 'discord', '2026-01-01 00:00:00')`);
        db.run(`INSERT INTO sessions (id, agent_id, name, source, created_at) VALUES ('sess-new', 'agent-3', 'Discord thread:777888999000111222', 'discord', '2026-02-01 00:00:00')`);

        const sessions = new Map<string, ThreadSessionInfo>();
        const result = tryRecoverThread(db, sessions, '777888999000111222');
        expect(result!.sessionId).toBe('sess-new');
    });

    test('falls back to default agent name when agent row is missing', () => {
        db.run(`INSERT INTO sessions (id, agent_id, name, source) VALUES ('sess-3', NULL, 'Discord thread:100200300400500600', 'discord')`);

        const sessions = new Map<string, ThreadSessionInfo>();
        const result = tryRecoverThread(db, sessions, '100200300400500600');
        expect(result).not.toBeNull();
        expect(result!.agentName).toBe('Agent');
        expect(result!.agentModel).toBe('unknown');
    });

    test('returns null and does not throw on DB error (e.g. missing table)', () => {
        // Use a fresh DB with no schema at all
        const brokenDb = new Database(':memory:');
        const sessions = new Map<string, ThreadSessionInfo>();
        expect(() => tryRecoverThread(brokenDb, sessions, '123456789012345678')).not.toThrow();
        expect(tryRecoverThread(brokenDb, sessions, '123456789012345678')).toBeNull();
    });

    test('recovers optional project name when present', () => {
        db.run(`INSERT INTO agents (id, name, model) VALUES ('agent-4', 'BotD', 'claude-sonnet-4-6')`);
        db.run(`INSERT INTO projects (id, name, working_dir) VALUES ('proj-1', 'MyProject', '/tmp/proj')`);
        db.run(`INSERT INTO sessions (id, agent_id, project_id, name, source) VALUES ('sess-4', 'agent-4', 'proj-1', 'Discord thread:200300400500600700', 'discord')`);

        const sessions = new Map<string, ThreadSessionInfo>();
        const result = tryRecoverThread(db, sessions, '200300400500600700');
        expect(result!.projectName).toBe('MyProject');
    });
});
