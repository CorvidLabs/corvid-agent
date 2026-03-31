/**
 * Tests for server/memory/graduation-service.ts — MemoryGraduationService
 * lifecycle, tick processing, graduation logic, and stats.
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MemoryGraduationService } from '../memory/graduation-service';
import {
    recordObservation,
    getObservation,
    boostObservation,
} from '../db/observations';
import { up as upObservations } from '../db/migrations/095_memory_observations';

const AGENT_ID = 'agent-grad-001';

function createTestDb(): Database {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    // Minimal schema needed for graduation service
    db.exec(`CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY)`);
    db.prepare('INSERT INTO agents (id) VALUES (?)').run(AGENT_ID);

    // agent_memories table (used by saveMemory in graduation)
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_memories (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            key TEXT NOT NULL,
            content TEXT NOT NULL,
            txid TEXT,
            asa_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT DEFAULT NULL,
            access_count INTEGER NOT NULL DEFAULT 0,
            UNIQUE(agent_id, key)
        )
    `);

    upObservations(db);
    return db;
}

describe('MemoryGraduationService', () => {
    let db: Database;
    let service: MemoryGraduationService;

    beforeEach(() => {
        db = createTestDb();
        service = new MemoryGraduationService(db);
    });

    describe('start/stop lifecycle', () => {
        test('start sets timer and stop clears it', () => {
            service.start();
            const stats = service.getStats();
            expect(stats.isRunning).toBe(true);

            service.stop();
            const statsAfter = service.getStats();
            expect(statsAfter.isRunning).toBe(false);
        });

        test('double start does not create duplicate timers', () => {
            service.start();
            service.start(); // should log warning but not crash
            expect(service.getStats().isRunning).toBe(true);

            service.stop();
            expect(service.getStats().isRunning).toBe(false);
        });

        test('stop when not running is a no-op', () => {
            service.stop(); // should not throw
            expect(service.getStats().isRunning).toBe(false);
        });
    });

    describe('tick', () => {
        test('expires stale observations', async () => {
            // Create an already-expired observation
            recordObservation(db, {
                agentId: AGENT_ID,
                source: 'session',
                content: 'stale observation',
                expiresAt: '2020-01-01T00:00:00.000Z',
            });

            await service.tick();

            const obs = db.query(
                `SELECT * FROM memory_observations WHERE agent_id = ? AND status = 'expired'`,
            ).all(AGENT_ID) as { content: string }[];
            expect(obs).toHaveLength(1);
            expect(obs[0].content).toBe('stale observation');
        });

        test('graduates qualifying observations to agent_memories', async () => {
            const obs = recordObservation(db, {
                agentId: AGENT_ID,
                source: 'feedback',
                content: 'Important feedback about testing',
                suggestedKey: 'feedback-testing-pattern',
                relevanceScore: 1.0,
            });

            // Boost to meet graduation criteria (score >= 3.0, access >= 2)
            boostObservation(db, obs.id, 1.0); // score 2.0, access 1
            boostObservation(db, obs.id, 1.5); // score 3.5, access 2

            await service.tick();

            // Check observation was graduated
            const updated = getObservation(db, obs.id)!;
            expect(updated.status).toBe('graduated');
            expect(updated.graduatedKey).toBe('feedback-testing-pattern');

            // Check memory was created in agent_memories
            const memory = db.query(
                `SELECT * FROM agent_memories WHERE agent_id = ? AND key = ?`,
            ).get(AGENT_ID, 'feedback-testing-pattern') as { content: string } | null;
            expect(memory).not.toBeNull();
            expect(memory!.content).toBe('Important feedback about testing');
        });

        test('generates key from source and id when no suggested key', async () => {
            const obs = recordObservation(db, {
                agentId: AGENT_ID,
                source: 'session',
                content: 'No suggested key here',
                relevanceScore: 5.0,
            });
            boostObservation(db, obs.id, 1.0);
            boostObservation(db, obs.id, 1.0);

            await service.tick();

            const updated = getObservation(db, obs.id)!;
            expect(updated.status).toBe('graduated');
            expect(updated.graduatedKey).toStartWith('obs:session:');
        });

        test('does not re-graduate already graduated observations', async () => {
            const obs = recordObservation(db, {
                agentId: AGENT_ID,
                source: 'session',
                content: 'Already graduated',
                relevanceScore: 5.0,
            });
            boostObservation(db, obs.id, 1.0);
            boostObservation(db, obs.id, 1.0);

            await service.tick(); // first graduation
            await service.tick(); // should be a no-op for this observation

            const memories = db.query(
                `SELECT COUNT(*) as cnt FROM agent_memories WHERE agent_id = ?`,
            ).get(AGENT_ID) as { cnt: number };
            expect(memories.cnt).toBe(1);
        });

        test('skips tick if already running (reentrancy guard)', async () => {
            // Run tick once — then immediately again; second should return without doing work
            const first = service.tick();
            const second = service.tick(); // should return immediately (running guard)
            await Promise.all([first, second]);

            // No crash or error expected
        });

        test('handles agents with no active observations', async () => {
            // No observations at all — tick should complete cleanly
            await service.tick();
            // No error expected
        });
    });

    describe('getStats', () => {
        test('returns empty stats when no observations', () => {
            const stats = service.getStats();
            expect(stats.isRunning).toBe(false);
            expect(stats.agentStats).toHaveLength(0);
        });

        test('returns per-agent breakdown', () => {
            recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'active one' });
            recordObservation(db, { agentId: AGENT_ID, source: 'session', content: 'active two' });

            const stats = service.getStats();
            expect(stats.agentStats).toHaveLength(1);
            expect(stats.agentStats[0].agentId).toBe(AGENT_ID);
            expect(stats.agentStats[0].active).toBe(2);
            expect(stats.agentStats[0].graduated).toBe(0);
        });
    });

    describe('setServices', () => {
        test('sets network for localnet graduation path', () => {
            service.setServices(null as unknown as never, null, 'localnet');
            // No crash; service should use localnet path in graduation
        });
    });
});
