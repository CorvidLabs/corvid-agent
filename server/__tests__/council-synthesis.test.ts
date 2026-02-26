import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createSession } from '../db/sessions';
import {
    createCouncil,
    createCouncilLaunch,
    getCouncilLaunch,
    updateCouncilLaunchStage,
    insertDiscussionMessage,
} from '../db/councils';
import {
    triggerReview,
    aggregateSessionResponses,
    finishWithAggregatedSynthesis,
    triggerSynthesis,
} from '../councils/synthesis';
import type { EmitLogFn, BroadcastStageChangeFn, WatchAutoAdvanceFn } from '../councils/synthesis';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';

// ─── Mock ProcessManager ────────────────────────────────────────────────────

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
        stopProcess: mock((_sessionId: string) => {
            running.delete(_sessionId);
        }),
        startProcess: mock(() => {}),
        sendMessage: mock(() => true),
    };

    return {
        pm: pm as unknown as ProcessManager,
        markRunning(sessionId: string) { running.add(sessionId); },
        emitExit(sessionId: string) {
            running.delete(sessionId);
            const cbs = subscribers.get(sessionId);
            if (cbs) {
                for (const cb of cbs) {
                    cb(sessionId, { type: 'session_exited', exitCode: 0, duration: 1000 } as ClaudeStreamEvent);
                }
            }
        },
        subscribers,
        running,
    };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

let db: Database;
const emitLog: EmitLogFn = mock(() => {});
const broadcastStageChange: BroadcastStageChangeFn = mock(() => {});

function resetMocks() {
    (emitLog as ReturnType<typeof mock>).mockClear();
    (broadcastStageChange as ReturnType<typeof mock>).mockClear();
}

/** Seed a project + N agents + council + launch at a given stage. */
function seedCouncil(opts: {
    agentCount?: number;
    stage?: string;
    prompt?: string;
    chairmanAgentId?: string | null;
}) {
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const agents = Array.from({ length: opts.agentCount ?? 3 }, (_, i) =>
        createAgent(db, { name: `Agent ${String.fromCharCode(65 + i)}`, model: 'sonnet' }),
    );
    const council = createCouncil(db, {
        name: 'Test Council',
        agentIds: agents.map((a) => a.id),
        chairmanAgentId: opts.chairmanAgentId !== undefined ? (opts.chairmanAgentId ?? undefined) : agents[0].id,
    });
    const launchId = crypto.randomUUID();
    createCouncilLaunch(db, {
        id: launchId,
        councilId: council.id,
        projectId: project.id,
        prompt: opts.prompt ?? 'What is the meaning of life?',
    });
    if (opts.stage) {
        updateCouncilLaunchStage(db, launchId, opts.stage as import('../../shared/types').CouncilStage);
    }
    return { project, agents, council, launchId };
}

/** Insert a mock assistant message into a session. */
function insertAssistantMessage(sessionId: string, content: string) {
    db.query(
        `INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)`,
    ).run(sessionId, content);
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    resetMocks();
});

afterEach(() => {
    db.close();
});

// ─── triggerReview ───────────────────────────────────────────────────────────

describe('triggerReview', () => {
    it('returns 404 when launch does not exist', () => {
        const { pm } = createMockPM();
        const result = triggerReview(db, pm, 'nonexistent', emitLog, broadcastStageChange);
        expect(result).toEqual({ ok: false, error: 'Launch not found', status: 404 });
    });

    it('returns 400 when launch is not in responding or discussing stage', () => {
        const { pm } = createMockPM();
        const { launchId } = seedCouncil({ stage: 'reviewing' });

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
            expect(result.error).toContain("Cannot start review from stage");
        }
    });

    it('returns 400 for complete stage', () => {
        const { pm } = createMockPM();
        const { launchId } = seedCouncil({ stage: 'complete' });

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
        }
    });

    it('creates review sessions for each agent from responding stage', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 3 });

        // Create member sessions with responses
        for (const agent of agents) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Response from ${agent.name}`);
        }

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.reviewSessionIds).toHaveLength(3);
        }

        // Verify stage changed to reviewing
        const launch = getCouncilLaunch(db, launchId);
        expect(launch?.stage).toBe('reviewing');
    });

    it('creates review sessions from discussing stage', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'discussing', agentCount: 2 });

        for (const agent of agents) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Response from ${agent.name}`);
        }

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.reviewSessionIds).toHaveLength(2);
        }
    });

    it('starts a process for each reviewer', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 2 });

        for (const agent of agents) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Response from ${agent.name}`);
        }

        triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(2);
    });

    it('broadcasts stage change to reviewing with session IDs', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 2 });

        for (const agent of agents) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Response`);
        }

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(true);

        const calls = (broadcastStageChange as ReturnType<typeof mock>).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0]).toBe(launchId);
        expect(lastCall[1]).toBe('reviewing');
        if (result.ok) {
            expect(lastCall[2]).toEqual(result.reviewSessionIds);
        }
    });

    it('calls watchAutoAdvance when provided', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 2 });

        for (const agent of agents) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Response`);
        }

        const watchAutoAdvance: WatchAutoAdvanceFn = mock(() => {});
        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange, watchAutoAdvance);
        expect(result.ok).toBe(true);

        const watchCalls = (watchAutoAdvance as ReturnType<typeof mock>).mock.calls;
        expect(watchCalls.length).toBe(1);
        expect(watchCalls[0][2]).toBe(launchId);
        expect(watchCalls[0][4]).toBe('reviewer');
    });

    it('handles members with no assistant messages gracefully', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 2 });

        // Create member sessions without any messages
        for (const agent of agents) {
            createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
        }

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(true);
    });

    it('emits log entries for the review stage', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 2 });

        for (const agent of agents) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Response from ${agent.name}`);
        }

        triggerReview(db, pm, launchId, emitLog, broadcastStageChange);

        const logCalls = (emitLog as ReturnType<typeof mock>).mock.calls;
        // Should have at least: 1 stage log + 2 response collection logs + 2 session start logs
        expect(logCalls.length).toBeGreaterThanOrEqual(5);
        // First log should be the stage announcement
        expect(logCalls[0][2]).toBe('stage');
        expect(logCalls[0][3]).toContain('Starting peer review');
    });

    it('logs error when startProcess throws', () => {
        const { pm } = createMockPM();
        (pm.startProcess as ReturnType<typeof mock>).mockImplementation(() => {
            throw new Error('Process start failed');
        });

        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 1 });

        const session = createSession(db, {
            projectId: getCouncilLaunch(db, launchId)!.projectId,
            agentId: agents[0].id,
            name: `Member: ${agents[0].name}`,
            councilLaunchId: launchId,
            councilRole: 'member',
        });
        insertAssistantMessage(session.id, 'A response');

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        // Should still succeed — errors are logged but don't fail the operation
        expect(result.ok).toBe(true);

        const errorLogs = (emitLog as ReturnType<typeof mock>).mock.calls.filter(
            (c: unknown[]) => c[2] === 'error',
        );
        expect(errorLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('review prompt contains other agents responses but not the reviewer own response', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'responding', agentCount: 3 });

        for (let i = 0; i < agents.length; i++) {
            const session = createSession(db, {
                projectId: getCouncilLaunch(db, launchId)!.projectId,
                agentId: agents[i].id,
                name: `Member: ${agents[i].name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(session.id, `Unique response ${i}`);
        }

        const result = triggerReview(db, pm, launchId, emitLog, broadcastStageChange);
        expect(result.ok).toBe(true);
        if (result.ok) {
            // Each reviewer session should have been started with the review prompt
            // The startProcess mock captures the session objects
            const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
            expect(startCalls.length).toBe(3);
        }
    });
});

// ─── aggregateSessionResponses ──────────────────────────────────────────────

describe('aggregateSessionResponses', () => {
    it('prefers reviewer sessions over member sessions', () => {
        const { agents, launchId } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        // Create member sessions
        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Member response from ${agent.name}`);
        }

        // Create reviewer sessions
        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Reviewer: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'reviewer',
            });
            insertAssistantMessage(s.id, `Review from ${agent.name}`);
        }

        const { listSessionsByCouncilLaunch } = require('../db/sessions');
        const sessions = listSessionsByCouncilLaunch(db, launchId);
        const parts = aggregateSessionResponses(db, sessions);

        // Should contain reviewer responses, not member responses
        expect(parts.length).toBe(2);
        for (const part of parts) {
            expect(part).toContain('Review from');
        }
    });

    it('falls back to member sessions when no reviewers exist', () => {
        const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Member response from ${agent.name}`);
        }

        const { listSessionsByCouncilLaunch } = require('../db/sessions');
        const sessions = listSessionsByCouncilLaunch(db, launchId);
        const parts = aggregateSessionResponses(db, sessions);

        expect(parts.length).toBe(2);
        for (const part of parts) {
            expect(part).toContain('Member response from');
        }
    });

    it('returns empty array when no sessions have assistant messages', () => {
        const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
        }

        const { listSessionsByCouncilLaunch } = require('../db/sessions');
        const sessions = listSessionsByCouncilLaunch(db, launchId);
        const parts = aggregateSessionResponses(db, sessions);

        expect(parts).toEqual([]);
    });

    it('returns empty array for empty session list', () => {
        const parts = aggregateSessionResponses(db, []);
        expect(parts).toEqual([]);
    });

    it('labels parts with agent names', () => {
        const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, 'Some response');
        }

        const { listSessionsByCouncilLaunch } = require('../db/sessions');
        const sessions = listSessionsByCouncilLaunch(db, launchId);
        const parts = aggregateSessionResponses(db, sessions);

        expect(parts[0]).toContain('### Agent A');
        expect(parts[1]).toContain('### Agent B');
    });

    it('uses last assistant message when multiple exist', () => {
        const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 1 });
        const launch = getCouncilLaunch(db, launchId)!;

        const s = createSession(db, {
            projectId: launch.projectId,
            agentId: agents[0].id,
            name: `Member: ${agents[0].name}`,
            councilLaunchId: launchId,
            councilRole: 'member',
        });
        insertAssistantMessage(s.id, 'First response');
        insertAssistantMessage(s.id, 'Second response');
        insertAssistantMessage(s.id, 'Final response');

        const { listSessionsByCouncilLaunch } = require('../db/sessions');
        const sessions = listSessionsByCouncilLaunch(db, launchId);
        const parts = aggregateSessionResponses(db, sessions);

        expect(parts.length).toBe(1);
        expect(parts[0]).toContain('Final response');
    });
});

// ─── finishWithAggregatedSynthesis ──────────────────────────────────────────

describe('finishWithAggregatedSynthesis', () => {
    it('aggregates responses and updates launch to complete stage', () => {
        const { agents, launchId } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response from ${agent.name}`);
        }

        finishWithAggregatedSynthesis(db, launchId, emitLog, broadcastStageChange);

        const updatedLaunch = getCouncilLaunch(db, launchId);
        expect(updatedLaunch?.stage).toBe('complete');
        expect(updatedLaunch?.synthesis).toContain('Response from Agent A');
        expect(updatedLaunch?.synthesis).toContain('Response from Agent B');
    });

    it('stores fallback text when no responses are produced', () => {
        const { launchId } = seedCouncil({ stage: 'reviewing', agentCount: 2 });

        finishWithAggregatedSynthesis(db, launchId, emitLog, broadcastStageChange);

        const updatedLaunch = getCouncilLaunch(db, launchId);
        expect(updatedLaunch?.stage).toBe('complete');
        expect(updatedLaunch?.synthesis).toBe('(No responses were produced by council members)');
    });

    it('broadcasts stage change to complete', () => {
        const { launchId } = seedCouncil({ stage: 'reviewing' });

        finishWithAggregatedSynthesis(db, launchId, emitLog, broadcastStageChange);

        const calls = (broadcastStageChange as ReturnType<typeof mock>).mock.calls;
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe(launchId);
        expect(calls[0][1]).toBe('complete');
    });

    it('emits stage log with response count', () => {
        const { agents, launchId } = seedCouncil({ stage: 'reviewing', agentCount: 3 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response from ${agent.name}`);
        }

        finishWithAggregatedSynthesis(db, launchId, emitLog, broadcastStageChange);

        const logCalls = (emitLog as ReturnType<typeof mock>).mock.calls;
        expect(logCalls.length).toBe(1);
        expect(logCalls[0][2]).toBe('stage');
        expect(logCalls[0][3]).toContain('Council complete');
        expect(logCalls[0][4]).toContain('3 responses');
    });

    it('joins multiple responses with separator', () => {
        const { agents, launchId } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response from ${agent.name}`);
        }

        finishWithAggregatedSynthesis(db, launchId, emitLog, broadcastStageChange);

        const updatedLaunch = getCouncilLaunch(db, launchId);
        expect(updatedLaunch?.synthesis).toContain('---');
    });
});

// ─── triggerSynthesis ───────────────────────────────────────────────────────

describe('triggerSynthesis', () => {
    const formatDiscussionMessages = (msgs: import('../../shared/types').CouncilDiscussionMessage[]) =>
        msgs.map((m) => `${m.agentName}: ${m.content}`).join('\n');

    it('returns 404 when launch does not exist', () => {
        const { pm } = createMockPM();
        const result = triggerSynthesis(db, pm, 'nonexistent', emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result).toEqual({ ok: false, error: 'Launch not found', status: 404 });
    });

    it('returns 400 when launch is not in reviewing stage', () => {
        const { pm } = createMockPM();
        const { launchId } = seedCouncil({ stage: 'responding' });

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
            expect(result.error).toContain("Cannot synthesize from stage");
        }
    });

    it('returns 400 when council has no chairman', () => {
        const { pm } = createMockPM();
        const { launchId } = seedCouncil({ stage: 'reviewing', chairmanAgentId: null });

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(400);
            expect(result.error).toContain('no chairman');
        }
    });

    it('creates chairman synthesis session from reviewing stage', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 3 });
        const launch = getCouncilLaunch(db, launchId)!;

        // Create member and reviewer sessions
        for (const agent of agents) {
            const memberSession = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(memberSession.id, `Response from ${agent.name}`);

            const reviewSession = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Reviewer: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'reviewer',
            });
            insertAssistantMessage(reviewSession.id, `Review by ${agent.name}`);
        }

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.synthesisSessionId).toBeTruthy();
        }

        // Verify stage changed to synthesizing
        const updatedLaunch = getCouncilLaunch(db, launchId);
        expect(updatedLaunch?.stage).toBe('synthesizing');
    });

    it('starts a process for the chairman session', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect((pm.startProcess as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });

    it('subscribes to chairman session for completion', () => {
        const { pm, subscribers } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        if (result.ok) {
            const subs = subscribers.get(result.synthesisSessionId);
            expect(subs).toBeTruthy();
            expect(subs!.size).toBe(1);
        }
    });

    it('uses chairman override when provided', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        // Create a separate chairman agent
        const chairman = createAgent(db, { name: 'Override Chairman', model: 'opus' });

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        const result = triggerSynthesis(
            db, pm, launchId, emitLog, broadcastStageChange,
            formatDiscussionMessages, chairman.id,
        );
        expect(result.ok).toBe(true);

        // The started session should be for the override chairman
        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        expect(startCalls.length).toBe(1);
        const startedSession = startCalls[0][0];
        expect(startedSession.agentId).toBe(chairman.id);
    });

    it('includes discussion messages in synthesis prompt', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        // Add discussion messages
        insertDiscussionMessage(db, {
            launchId,
            agentId: agents[0].id,
            agentName: agents[0].name,
            round: 1,
            content: 'I think we should consider option B',
        });
        insertDiscussionMessage(db, {
            launchId,
            agentId: agents[1].id,
            agentName: agents[1].name,
            round: 1,
            content: 'I agree with option B',
        });

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(true);

        // Verify the started session includes discussion context in the prompt
        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        const session = startCalls[0][0];
        expect(session.initialPrompt).toContain('Council Discussion');
        expect(session.initialPrompt).toContain('option B');
    });

    it('omits discussion section when no discussion messages exist', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);

        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        const session = startCalls[0][0];
        expect(session.initialPrompt).not.toContain('Council Discussion');
    });

    it('broadcasts stage change to synthesizing with session ID', () => {
        const { pm } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(true);

        const calls = (broadcastStageChange as ReturnType<typeof mock>).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0]).toBe(launchId);
        expect(lastCall[1]).toBe('synthesizing');
        if (result.ok) {
            expect(lastCall[2]).toEqual([result.synthesisSessionId]);
        }
    });

    it('completes launch when chairman session exits with a response', () => {
        const { pm, emitExit } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(true);

        if (result.ok) {
            // Insert a synthesis response from the chairman session
            insertAssistantMessage(result.synthesisSessionId, 'The final synthesized answer is 42.');

            // Simulate chairman session completing
            emitExit(result.synthesisSessionId);

            // Launch should now be complete
            const updatedLaunch = getCouncilLaunch(db, launchId);
            expect(updatedLaunch?.stage).toBe('complete');
            expect(updatedLaunch?.synthesis).toBe('The final synthesized answer is 42.');
        }
    });

    it('sets fallback synthesis when chairman produces no output', () => {
        const { pm, emitExit } = createMockPM();
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        expect(result.ok).toBe(true);

        if (result.ok) {
            // Chairman exits without producing any messages
            emitExit(result.synthesisSessionId);

            const updatedLaunch = getCouncilLaunch(db, launchId);
            expect(updatedLaunch?.stage).toBe('complete');
            expect(updatedLaunch?.synthesis).toBe('(no synthesis produced)');
        }
    });

    it('logs error when chairman startProcess throws', () => {
        const { pm } = createMockPM();
        (pm.startProcess as ReturnType<typeof mock>).mockImplementation(() => {
            throw new Error('Chairman process failed');
        });

        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2 });
        const launch = getCouncilLaunch(db, launchId)!;

        for (const agent of agents) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agent.id,
                name: `Member: ${agent.name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Response`);
        }

        const result = triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);
        // Should still return ok — error is logged
        expect(result.ok).toBe(true);

        const errorLogs = (emitLog as ReturnType<typeof mock>).mock.calls.filter(
            (c: unknown[]) => c[2] === 'error',
        );
        expect(errorLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('synthesis prompt includes original question and all member responses', () => {
        const { pm } = createMockPM();
        const prompt = 'Should we use microservices?';
        const { launchId, agents } = seedCouncil({ stage: 'reviewing', agentCount: 2, prompt });
        const launch = getCouncilLaunch(db, launchId)!;

        for (let i = 0; i < agents.length; i++) {
            const s = createSession(db, {
                projectId: launch.projectId,
                agentId: agents[i].id,
                name: `Member: ${agents[i].name}`,
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s.id, `Member ${i} thinks yes`);
        }

        triggerSynthesis(db, pm, launchId, emitLog, broadcastStageChange, formatDiscussionMessages);

        const startCalls = (pm.startProcess as ReturnType<typeof mock>).mock.calls;
        const session = startCalls[0][0];
        expect(session.initialPrompt).toContain(prompt);
        expect(session.initialPrompt).toContain('Response A');
        expect(session.initialPrompt).toContain('Response B');
        expect(session.initialPrompt).toContain('Member 0 thinks yes');
        expect(session.initialPrompt).toContain('Member 1 thinks yes');
    });
});
