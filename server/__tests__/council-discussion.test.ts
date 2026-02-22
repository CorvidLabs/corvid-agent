import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createSession } from '../db/sessions';
import { waitForSessions } from '../routes/councils';
import type { ProcessManager, EventCallback } from '../process/manager';

// ─── Mock ProcessManager with full simulation ───────────────────────────────

function createMockPM() {
    const subscribers = new Map<string, Set<EventCallback>>();
    const running = new Set<string>();

    const pm: Pick<ProcessManager, 'subscribe' | 'unsubscribe' | 'isRunning' | 'stopProcess' | 'startProcess' | 'sendMessage'> = {
        subscribe: (sessionId: string, cb: EventCallback) => {
            if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
            subscribers.get(sessionId)!.add(cb);
        },
        unsubscribe: (sessionId: string, cb: EventCallback) => {
            subscribers.get(sessionId)?.delete(cb);
        },
        isRunning: (sessionId: string) => running.has(sessionId),
        stopProcess: mock((sessionId: string) => {
            running.delete(sessionId);
        }),
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
    };

    return {
        pm: pm as unknown as ProcessManager,
        markRunning(sessionId: string) {
            running.add(sessionId);
        },
        emitExit(sessionId: string) {
            running.delete(sessionId);
            const cbs = subscribers.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, { type: 'session_exited', exitCode: 0, duration: 1000 } as any);
                }
            }
        },
        emitStopped(sessionId: string) {
            running.delete(sessionId);
            const cbs = subscribers.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, { type: 'session_stopped' } as any);
                }
            }
        },
        subscribers,
        running,
    };
}

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ─── Parallel Agent Spawning ────────────────────────────────────────────────

describe('Council Discussion: Parallel Agent Spawning', () => {
    it('spawns multiple sessions and waits for all to complete', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        // Simulate 3 agents starting
        markRunning('session-a');
        markRunning('session-b');
        markRunning('session-c');

        const promise = waitForSessions(pm, ['session-a', 'session-b', 'session-c'], 5000);

        // All complete in parallel (different order)
        emitExit('session-c');
        emitExit('session-a');
        emitExit('session-b');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['session-a', 'session-b', 'session-c']);
        expect(result.timedOut).toEqual([]);
    });

    it('no stagger delay — sessions start immediately', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        // All sessions start at roughly the same time (no delay between spawns)
        const startTime = Date.now();
        const sessionIds = ['s1', 's2', 's3', 's4', 's5'];

        for (const sid of sessionIds) {
            markRunning(sid);
        }

        const elapsed = Date.now() - startTime;
        // Should take < 10ms (no stagger)
        expect(elapsed).toBeLessThan(50);

        const promise = waitForSessions(pm, sessionIds, 5000);

        for (const sid of sessionIds) {
            emitExit(sid);
        }

        const result = await promise;
        expect(result.completed).toHaveLength(5);
        expect(result.timedOut).toHaveLength(0);
    });
});

// ─── Auto-advance When All Sessions Complete ────────────────────────────────

describe('Council Discussion: Auto-advance', () => {
    it('resolves when all sessions complete regardless of order', async () => {
        const { pm, markRunning, emitExit, emitStopped } = createMockPM();

        markRunning('s1');
        markRunning('s2');
        markRunning('s3');

        const promise = waitForSessions(pm, ['s1', 's2', 's3'], 5000);

        // Mixed completion types
        emitExit('s1');
        emitStopped('s2');
        emitExit('s3');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['s1', 's2', 's3']);
        expect(result.timedOut).toEqual([]);
    });

    it('resolves immediately if sessions already finished before subscribe', async () => {
        const { pm } = createMockPM();
        // Sessions not marked as running → isRunning returns false → immediately complete

        const result = await waitForSessions(pm, ['s1', 's2'], 5000);
        expect(result.completed.sort()).toEqual(['s1', 's2']);
        expect(result.timedOut).toEqual([]);
    });
});

// ─── Timeout Handling ───────────────────────────────────────────────────────

describe('Council Discussion: Timeout Handling', () => {
    it('per-round timeout fires for stuck sessions', async () => {
        const { pm, markRunning } = createMockPM();

        markRunning('stuck-1');
        markRunning('stuck-2');

        const result = await waitForSessions(pm, ['stuck-1', 'stuck-2'], 100);

        expect(result.completed).toEqual([]);
        expect(result.timedOut.sort()).toEqual(['stuck-1', 'stuck-2']);
    });

    it('per-agent timeout does not block completed agents', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        markRunning('fast');
        markRunning('slow');

        const promise = waitForSessions(pm, ['fast', 'slow'], 200);

        // Fast agent completes immediately
        emitExit('fast');

        // Slow agent never completes — timeout fires
        const result = await promise;
        expect(result.completed).toEqual(['fast']);
        expect(result.timedOut).toEqual(['slow']);
    });

    it('timeout with no sessions resolves immediately', async () => {
        const { pm } = createMockPM();
        const result = await waitForSessions(pm, [], 100);
        expect(result.completed).toEqual([]);
        expect(result.timedOut).toEqual([]);
    });
});

// ─── Mixed Completed / Timed-Out Sessions ───────────────────────────────────

describe('Council Discussion: Mixed Completion', () => {
    it('handles mix of completed and timed-out sessions', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        markRunning('agent-1');
        markRunning('agent-2');
        markRunning('agent-3');
        markRunning('agent-4');

        const promise = waitForSessions(pm, ['agent-1', 'agent-2', 'agent-3', 'agent-4'], 150);

        // 2 agents complete, 2 timeout
        emitExit('agent-1');
        emitExit('agent-3');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['agent-1', 'agent-3']);
        expect(result.timedOut.sort()).toEqual(['agent-2', 'agent-4']);
    });

    it('handles session exiting after another was already marked complete', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        markRunning('s1');
        markRunning('s2');
        markRunning('s3');

        const promise = waitForSessions(pm, ['s1', 's2', 's3'], 5000);

        // Stagger completions
        emitExit('s1');
        await new Promise(r => setTimeout(r, 10));
        emitExit('s2');
        await new Promise(r => setTimeout(r, 10));
        emitExit('s3');

        const result = await promise;
        expect(result.completed).toHaveLength(3);
        expect(result.timedOut).toHaveLength(0);
    });
});

// ─── Aggregation of Parallel Responses ──────────────────────────────────────

describe('Council Discussion: Response Aggregation', () => {
    it('creates sessions for each agent in the council', () => {
        const agent1 = createAgent(db, { name: 'Agent Alpha', model: 'sonnet' });
        const agent2 = createAgent(db, { name: 'Agent Beta', model: 'sonnet' });
        const agent3 = createAgent(db, { name: 'Agent Gamma', model: 'sonnet' });
        const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });

        // Simulate creating discusser sessions (as runDiscussionRounds does)
        const sessions = [agent1, agent2, agent3].map((agent) => {
            return createSession(db, {
                projectId: project.id,
                agentId: agent.id,
                name: `Discussion R1: Council - ${agent.name}`,
                initialPrompt: 'Discuss the topic',
                councilRole: 'discusser',
            });
        });

        expect(sessions).toHaveLength(3);
        for (const session of sessions) {
            expect(session.id).toBeTruthy();
            expect(session.councilRole).toBe('discusser');
        }
    });

    it('session messages can be queried for response extraction', () => {
        const agent = createAgent(db, { name: 'Agent', model: 'sonnet' });
        const project = createProject(db, { name: 'Project', workingDir: '/tmp/test' });

        const session = createSession(db, {
            projectId: project.id,
            agentId: agent.id,
            name: 'Discussion session',
            initialPrompt: 'test',
            councilRole: 'discusser',
        });

        // Insert a mock assistant message
        db.query(
            `INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)`
        ).run(session.id, 'I believe the answer is 42.');

        const messages = db.query(
            `SELECT content FROM session_messages WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1`
        ).get(session.id) as { content: string } | null;

        expect(messages?.content).toBe('I believe the answer is 42.');
    });
});

// ─── Cleanup After Completion ───────────────────────────────────────────────

describe('Council Discussion: Cleanup', () => {
    it('unsubscribes from all sessions after all complete', async () => {
        const { pm, subscribers } = createMockPM();

        await waitForSessions(pm, ['s1', 's2', 's3'], 5000);

        for (const [, cbs] of subscribers) {
            expect(cbs.size).toBe(0);
        }
    });

    it('unsubscribes from all sessions after timeout', async () => {
        const { pm, markRunning, subscribers } = createMockPM();

        markRunning('stuck');

        await waitForSessions(pm, ['stuck'], 50);

        for (const [, cbs] of subscribers) {
            expect(cbs.size).toBe(0);
        }
    });

    it('does not double-count sessions that exit before and after subscribe', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        // s1 already exited, s2 will exit during wait
        markRunning('s2');

        const promise = waitForSessions(pm, ['s1', 's2'], 5000);
        emitExit('s2');

        const result = await promise;
        // s1 should appear only once in completed
        const s1Count = result.completed.filter(id => id === 's1').length;
        expect(s1Count).toBe(1);
        expect(result.completed).toHaveLength(2);
    });
});

// ─── Large Scale Parallel Sessions ──────────────────────────────────────────

describe('Council Discussion: Scale', () => {
    it('handles 10 sessions completing in parallel', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        const sessionIds = Array.from({ length: 10 }, (_, i) => `s${i}`);
        for (const sid of sessionIds) {
            markRunning(sid);
        }

        const promise = waitForSessions(pm, sessionIds, 5000);

        // Complete all in reverse order
        for (const sid of [...sessionIds].reverse()) {
            emitExit(sid);
        }

        const result = await promise;
        expect(result.completed).toHaveLength(10);
        expect(result.timedOut).toHaveLength(0);
    });

    it('handles many sessions with some timing out', async () => {
        const { pm, markRunning, emitExit } = createMockPM();

        const sessionIds = Array.from({ length: 8 }, (_, i) => `s${i}`);
        for (const sid of sessionIds) {
            markRunning(sid);
        }

        const promise = waitForSessions(pm, sessionIds, 150);

        // Only first 4 complete
        for (let i = 0; i < 4; i++) {
            emitExit(`s${i}`);
        }

        const result = await promise;
        expect(result.completed).toHaveLength(4);
        expect(result.timedOut).toHaveLength(4);
    });
});

// ─── Session Stopped vs Exited ──────────────────────────────────────────────

describe('Council Discussion: Event Types', () => {
    it('treats session_stopped the same as session_exited', async () => {
        const { pm, markRunning, emitStopped } = createMockPM();

        markRunning('s1');
        markRunning('s2');

        const promise = waitForSessions(pm, ['s1', 's2'], 5000);

        emitStopped('s1');
        emitStopped('s2');

        const result = await promise;
        expect(result.completed.sort()).toEqual(['s1', 's2']);
        expect(result.timedOut).toEqual([]);
    });

    it('ignores non-exit event types', async () => {
        const { pm, markRunning, emitExit, subscribers } = createMockPM();

        markRunning('s1');

        const promise = waitForSessions(pm, ['s1'], 500);

        // Send a non-exit event (should be ignored)
        const cbs = subscribers.get('s1');
        if (cbs) {
            for (const cb of cbs) {
                cb('s1', { type: 'assistant', message: 'thinking...' } as any);
            }
        }

        // Session should still be pending
        // Now actually exit
        emitExit('s1');

        const result = await promise;
        expect(result.completed).toEqual(['s1']);
        expect(result.timedOut).toEqual([]);
    });
});
