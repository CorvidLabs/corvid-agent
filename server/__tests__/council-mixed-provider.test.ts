/**
 * Council mixed-provider smoke tests.
 *
 * These tests verify that Council mode works correctly with heterogeneous
 * provider configurations.  They exercise:
 *   - FallbackManager with multi-provider chains (the dispatch layer councils use)
 *   - waitForSessions with provider-tagged session IDs (the parallelism layer)
 *   - aggregateSessionResponses with cross-provider member outputs
 *   - Degraded and stalled provider scenarios
 *
 * Test naming follows: [<provider-config>] council: <scenario>
 */
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { FallbackManager } from '../providers/fallback';
import { waitForSessions } from '../routes/councils';
import { aggregateSessionResponses } from '../councils/synthesis';
import { listSessionsByCouncilLaunch } from '../db/sessions';
import { runMigrations } from '../db/schema';
import { createAgent } from '../db/agents';
import { createProject } from '../db/projects';
import { createSession } from '../db/sessions';
import { createCouncil, createCouncilLaunch, getCouncilLaunch, updateCouncilLaunchStage } from '../db/councils';
import type { ProcessManager, EventCallback } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import type { CouncilStage } from '../../shared/types';
import {
    createProviderAgent,
    createMockRegistry,
    makeParams,
    makeChain,
    mockProviderResponse,
    mockProviderFailure,
    assertProviderUsed,
} from './helpers/provider-matrix';

// ─── Mock ProcessManager ─────────────────────────────────────────────────────

function createMockPM() {
    const subscribers = new Map<string, Set<EventCallback>>();
    const running = new Set<string>();

    const pm: Pick<ProcessManager, 'subscribe' | 'unsubscribe' | 'isRunning' | 'stopProcess'> = {
        subscribe: (sessionId: string, cb: EventCallback) => {
            if (!subscribers.has(sessionId)) subscribers.set(sessionId, new Set());
            subscribers.get(sessionId)!.add(cb);
        },
        unsubscribe: (sessionId: string, cb: EventCallback) => {
            subscribers.get(sessionId)?.delete(cb);
        },
        isRunning: (sessionId: string) => running.has(sessionId),
        stopProcess: mock((sessionId: string) => { running.delete(sessionId); }),
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

// ─── Database helpers ─────────────────────────────────────────────────────────

let db: Database;

/** Seed a project + N agents + council + launch.  Returns helpers for creating sessions. */
function seedCouncil(opts: { agentCount?: number; stage?: CouncilStage } = {}) {
    const n = opts.agentCount ?? 3;
    const project = createProject(db, { name: 'Test Project', workingDir: '/tmp/test' });
    const agents = Array.from({ length: n }, (_, i) =>
        createAgent(db, { name: `Agent ${String.fromCharCode(65 + i)}`, model: 'sonnet' }),
    );
    const council = createCouncil(db, {
        name: 'Test Council',
        agentIds: agents.map((a) => a.id),
        chairmanAgentId: agents[0].id,
    });
    const launchId = crypto.randomUUID();
    createCouncilLaunch(db, {
        id: launchId,
        councilId: council.id,
        projectId: project.id,
        prompt: 'What is the best approach?',
    });
    if (opts.stage) {
        updateCouncilLaunchStage(db, launchId, opts.stage);
    }
    return { project, agents, council, launchId };
}

function insertAssistantMessage(sessionId: string, content: string) {
    db.query(
        `INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)`,
    ).run(sessionId, content);
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
    mock.restore();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('council mixed-provider smoke tests', () => {

    // ── [ollama] Homogeneous Ollama council ──────────────────────────────────

    describe('[ollama] council: homogeneous Ollama council', () => {
        it('all three Ollama sessions complete and waitForSessions resolves', async () => {
            const { pm, markRunning, emitExit } = createMockPM();

            markRunning('ollama-s1');
            markRunning('ollama-s2');
            markRunning('ollama-s3');

            const promise = waitForSessions(pm, ['ollama-s1', 'ollama-s2', 'ollama-s3'], 5000);

            emitExit('ollama-s1');
            emitExit('ollama-s2');
            emitExit('ollama-s3');

            const result = await promise;
            expect(result.completed.sort()).toEqual(['ollama-s1', 'ollama-s2', 'ollama-s3']);
            expect(result.timedOut).toEqual([]);
        });

        it('all three Ollama providers complete the FallbackManager chain', async () => {
            const ollamaA = createProviderAgent('ollama', 'qwen3:14b',
                mockProviderResponse('Agent A response.', 'qwen3:14b'));
            const ollamaB = createProviderAgent('ollama', 'llama3.1:8b',
                mockProviderResponse('Agent B response.', 'llama3.1:8b'));
            const ollamaC = createProviderAgent('ollama', 'mistral:7b',
                mockProviderResponse('Agent C response.', 'mistral:7b'));

            // Each agent gets its own registry (isolated by session)
            const [rA, rB, rC] = await Promise.all([
                new FallbackManager(createMockRegistry([ollamaA])).completeWithFallback(
                    makeParams(),
                    makeChain({ provider: 'ollama', model: 'qwen3:14b' }),
                ),
                new FallbackManager(createMockRegistry([ollamaB])).completeWithFallback(
                    makeParams(),
                    makeChain({ provider: 'ollama', model: 'llama3.1:8b' }),
                ),
                new FallbackManager(createMockRegistry([ollamaC])).completeWithFallback(
                    makeParams(),
                    makeChain({ provider: 'ollama', model: 'mistral:7b' }),
                ),
            ]);

            expect(rA.usedProvider).toBe('ollama');
            expect(rB.usedProvider).toBe('ollama');
            expect(rC.usedProvider).toBe('ollama');
            assertProviderUsed(ollamaA);
            assertProviderUsed(ollamaB);
            assertProviderUsed(ollamaC);
        });

        it('synthesis aggregation works when all members are Ollama', () => {
            const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 3 });
            const launch = getCouncilLaunch(db, launchId)!;

            for (const agent of agents) {
                const s = createSession(db, {
                    projectId: launch.projectId,
                    agentId: agent.id,
                    name: `Member: ${agent.name}`,
                    councilLaunchId: launchId,
                    councilRole: 'member',
                });
                insertAssistantMessage(s.id, `[ollama] ${agent.name}: use caching.`);
            }

            const sessions = listSessionsByCouncilLaunch(db, launchId);
            const parts = aggregateSessionResponses(db, sessions);

            expect(parts).toHaveLength(3);
            expect(parts.every((p) => p.length > 0)).toBe(true);
            expect(parts.every((p) => p.includes('[ollama]'))).toBe(true);
        });
    });

    // ── [mixed:ollama+anthropic+cursor] Diverse provider council ─────────────

    describe('[mixed:ollama+anthropic+cursor] council: diverse provider deliberation', () => {
        it('three providers each complete their dispatch chain independently', async () => {
            const ollamaAgent = createProviderAgent('ollama', 'qwen3:14b',
                mockProviderResponse('Ollama perspective: use caching.', 'qwen3:14b'));
            const anthropicAgent = createProviderAgent('anthropic', 'claude-sonnet-4-6',
                mockProviderResponse('Anthropic perspective: use indexing.', 'claude-sonnet-4-6'));
            const cursorAgent = createProviderAgent('cursor', 'cursor-fast',
                mockProviderResponse('Cursor perspective: use partitioning.', 'cursor-fast'));

            const results = await Promise.all([
                new FallbackManager(createMockRegistry([ollamaAgent])).completeWithFallback(
                    makeParams(),
                    makeChain({ provider: 'ollama', model: 'qwen3:14b' }),
                ),
                new FallbackManager(createMockRegistry([anthropicAgent])).completeWithFallback(
                    makeParams(),
                    makeChain({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
                ),
                new FallbackManager(createMockRegistry([cursorAgent])).completeWithFallback(
                    makeParams(),
                    makeChain({ provider: 'cursor', model: 'cursor-fast' }),
                ),
            ]);

            expect(results[0].usedProvider).toBe('ollama');
            expect(results[1].usedProvider).toBe('anthropic');
            expect(results[2].usedProvider).toBe('cursor');
        });

        it('synthesis correctly aggregates cross-provider responses', () => {
            const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 3 });
            const launch = getCouncilLaunch(db, launchId)!;

            const providerTags = ['[ollama]', '[anthropic]', '[cursor]'];
            for (let i = 0; i < agents.length; i++) {
                const s = createSession(db, {
                    projectId: launch.projectId,
                    agentId: agents[i].id,
                    name: `Member: ${agents[i].name}`,
                    councilLaunchId: launchId,
                    councilRole: 'member',
                });
                insertAssistantMessage(s.id, `${providerTags[i]} response from ${agents[i].name}.`);
            }

            const sessions = listSessionsByCouncilLaunch(db, launchId);
            const parts = aggregateSessionResponses(db, sessions);

            expect(parts).toHaveLength(3);
            const allContent = parts.join('\n');
            expect(allContent).toContain('[ollama]');
            expect(allContent).toContain('[anthropic]');
            expect(allContent).toContain('[cursor]');
        });

        it('all sessions complete via waitForSessions regardless of provider label', async () => {
            const { pm, markRunning, emitExit } = createMockPM();

            const sessionIds = ['ollama:s1', 'anthropic:s2', 'cursor:s3'];
            for (const id of sessionIds) markRunning(id);

            const promise = waitForSessions(pm, sessionIds, 5000);
            for (const id of sessionIds) emitExit(id);

            const result = await promise;
            expect(result.completed.sort()).toEqual(sessionIds.sort());
            expect(result.timedOut).toEqual([]);
        });
    });

    // ── [degraded:ollama-offline] One provider offline in council ────────────

    describe('[degraded:ollama-offline] council: completes with 2/3 members', () => {
        it('council still completes when one provider session times out', async () => {
            const { pm, markRunning, emitExit } = createMockPM();

            markRunning('s-ollama');
            markRunning('s-anthropic');
            markRunning('s-cursor');

            const promise = waitForSessions(pm, ['s-ollama', 's-anthropic', 's-cursor'], 200);

            // Anthropic and Cursor finish — Ollama stalls (provider offline)
            emitExit('s-anthropic');
            emitExit('s-cursor');

            const result = await promise;
            expect(result.completed.sort()).toEqual(['s-anthropic', 's-cursor']);
            expect(result.timedOut).toEqual(['s-ollama']);
        });

        it('synthesis handles partial results when one session has no content', () => {
            const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 3 });
            const launch = getCouncilLaunch(db, launchId)!;

            // First agent (Ollama) session has no response — provider offline
            createSession(db, {
                projectId: launch.projectId,
                agentId: agents[0].id,
                name: 'Member: Agent A (ollama)',
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            // No assistant message for agents[0]

            const s1 = createSession(db, {
                projectId: launch.projectId,
                agentId: agents[1].id,
                name: 'Member: Agent B (anthropic)',
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s1.id, 'Anthropic response: use Redis.');

            const s2 = createSession(db, {
                projectId: launch.projectId,
                agentId: agents[2].id,
                name: 'Member: Agent C (cursor)',
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s2.id, 'Cursor response: use memcached.');

            const sessions = listSessionsByCouncilLaunch(db, launchId);
            const parts = aggregateSessionResponses(db, sessions);

            // Only 2 sessions have content
            expect(parts).toHaveLength(2);
        });

        it('FallbackManager skips offline Ollama and uses Anthropic fallback', async () => {
            const ollamaOffline = createProviderAgent('ollama', 'qwen3:14b',
                mockProviderFailure('ECONNREFUSED: connection refused'));
            const anthropicOnline = createProviderAgent('anthropic', 'claude-haiku-4-5-20251001',
                mockProviderResponse('Council member response via fallback.', 'claude-haiku-4-5-20251001'));

            const registry = createMockRegistry([ollamaOffline, anthropicOnline]);
            const manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'ollama', model: 'qwen3:14b' },
                { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.usedProvider).toBe('anthropic');
            assertProviderUsed(ollamaOffline);
            assertProviderUsed(anthropicOnline);
        });
    });

    // ── [stalled:ollama-cheerleading] Stalled provider in council ────────────

    describe('[stalled:ollama-cheerleading] council: stalled provider does not block', () => {
        it('fast agents complete before stalled Ollama agent times out', async () => {
            const { pm, markRunning, emitExit } = createMockPM();

            markRunning('fast-anthropic');
            markRunning('fast-cursor');
            markRunning('stalled-ollama');

            const startTime = Date.now();
            const promise = waitForSessions(
                pm,
                ['fast-anthropic', 'fast-cursor', 'stalled-ollama'],
                200, // short timeout
            );

            emitExit('fast-anthropic');
            emitExit('fast-cursor');
            // stalled-ollama never exits

            const result = await promise;
            const elapsed = Date.now() - startTime;

            expect(result.completed.sort()).toEqual(['fast-anthropic', 'fast-cursor']);
            expect(result.timedOut).toEqual(['stalled-ollama']);
            expect(elapsed).toBeLessThan(2000);
        });

        it('synthesis still aggregates responses from non-stalled members', () => {
            const { agents, launchId } = seedCouncil({ stage: 'responding', agentCount: 3 });
            const launch = getCouncilLaunch(db, launchId)!;

            // agents[0] is the stalled Ollama — produces only a cheerleading response
            const s0 = createSession(db, {
                projectId: launch.projectId,
                agentId: agents[0].id,
                name: 'Member: Agent A (stalled-ollama)',
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s0.id, 'Great question!');

            const s1 = createSession(db, {
                projectId: launch.projectId,
                agentId: agents[1].id,
                name: 'Member: Agent B',
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s1.id, 'Use event sourcing for this.');

            const s2 = createSession(db, {
                projectId: launch.projectId,
                agentId: agents[2].id,
                name: 'Member: Agent C',
                councilLaunchId: launchId,
                councilRole: 'member',
            });
            insertAssistantMessage(s2.id, 'CQRS would solve the read/write split.');

            const sessions = listSessionsByCouncilLaunch(db, launchId);
            const parts = aggregateSessionResponses(db, sessions);

            // All 3 sessions have content; stall detection is a higher-level concern
            expect(parts).toHaveLength(3);
            const allContent = parts.join('\n');
            expect(allContent).toContain('event sourcing');
            expect(allContent).toContain('CQRS');
        });

        it('council times out gracefully with partial responses when one agent stalls', async () => {
            const { pm, markRunning, emitExit } = createMockPM();

            markRunning('m1');
            markRunning('m2-stalled-ollama');
            markRunning('m3');

            const promise = waitForSessions(pm, ['m1', 'm2-stalled-ollama', 'm3'], 100);

            emitExit('m1');
            emitExit('m3');
            // m2-stalled-ollama never exits

            const result = await promise;
            expect(result.completed.sort()).toEqual(['m1', 'm3']);
            expect(result.timedOut).toEqual(['m2-stalled-ollama']);
        });
    });
});
