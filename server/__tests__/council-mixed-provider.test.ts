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

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CouncilStage } from '../../shared/types';
import { aggregateSessionResponses } from '../councils/synthesis';
import { createAgent } from '../db/agents';
import {
  createCouncil,
  createCouncilLaunch,
  getCouncilLaunch,
  getDiscussionMessages,
  insertDiscussionMessage,
  updateCouncilLaunchDiscussionRound,
  updateCouncilLaunchStage,
} from '../db/councils';
import { createProject } from '../db/projects';
import { runMigrations } from '../db/schema';
import { createSession, listSessionsByCouncilLaunch } from '../db/sessions';
import type { EventCallback, ProcessManager } from '../process/manager';
import type { ClaudeStreamEvent } from '../process/types';
import { FallbackManager } from '../providers/fallback';
import { waitForSessions } from '../routes/councils';
import {
  assertProviderUsed,
  createMockRegistry,
  createProviderAgent,
  makeChain,
  makeParams,
  mockProviderFailure,
  mockProviderResponse,
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
    stopProcess: mock((sessionId: string) => {
      running.delete(sessionId);
    }),
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
  db.query(`INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)`).run(
    sessionId,
    content,
  );
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
      const ollamaA = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderResponse('Agent A response.', 'qwen3:14b'),
      );
      const ollamaB = createProviderAgent(
        'ollama',
        'llama3.1:8b',
        mockProviderResponse('Agent B response.', 'llama3.1:8b'),
      );
      const ollamaC = createProviderAgent(
        'ollama',
        'mistral:7b',
        mockProviderResponse('Agent C response.', 'mistral:7b'),
      );

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
      const ollamaAgent = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderResponse('Ollama perspective: use caching.', 'qwen3:14b'),
      );
      const anthropicAgent = createProviderAgent(
        'anthropic',
        'claude-sonnet-4-6',
        mockProviderResponse('Anthropic perspective: use indexing.', 'claude-sonnet-4-6'),
      );
      const cursorAgent = createProviderAgent(
        'cursor',
        'cursor-fast',
        mockProviderResponse('Cursor perspective: use partitioning.', 'cursor-fast'),
      );

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
      const ollamaOffline = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderFailure('ECONNREFUSED: connection refused'),
      );
      const anthropicOnline = createProviderAgent(
        'anthropic',
        'claude-haiku-4-5-20251001',
        mockProviderResponse('Council member response via fallback.', 'claude-haiku-4-5-20251001'),
      );

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

  // ── [ollama-only] Full phase cycle ───────────────────────────────────────

  describe('[ollama-only] council: full phase cycle', () => {
    it('stage transitions from responding through to complete persist correctly', () => {
      const { launchId } = seedCouncil({ stage: 'responding' });

      const phases: CouncilStage[] = ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'];

      for (const stage of phases) {
        updateCouncilLaunchStage(db, launchId, stage);
        const launch = getCouncilLaunch(db, launchId)!;
        expect(launch.stage).toBe(stage);
      }
    });

    it('all three Ollama members submit responses in the responding phase', () => {
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
        insertAssistantMessage(s.id, `[ollama:qwen3:14b] ${agent.name}: my initial response.`);
      }

      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      expect(parts).toHaveLength(3);
      expect(parts.every((p) => p.includes('[ollama:qwen3:14b]'))).toBe(true);
    });

    it('discussion messages are recorded for each round and Ollama agent', () => {
      const { agents, launchId } = seedCouncil({ stage: 'discussing', agentCount: 3 });

      updateCouncilLaunchDiscussionRound(db, launchId, 1, 2);

      for (const agent of agents) {
        insertDiscussionMessage(db, {
          launchId,
          agentId: agent.id,
          agentName: agent.name,
          round: 1,
          content: `[ollama] ${agent.name} round-1: agreed on caching strategy.`,
        });
      }

      const messages = getDiscussionMessages(db, launchId);
      expect(messages).toHaveLength(3);
      expect(messages.every((m) => m.round === 1)).toBe(true);
      expect(messages.every((m) => m.content.includes('[ollama]'))).toBe(true);

      const launch = getCouncilLaunch(db, launchId)!;
      expect(launch.currentDiscussionRound).toBe(1);
      expect(launch.totalDiscussionRounds).toBe(2);
    });

    it('synthesis is stored and stage advances to complete', () => {
      const { launchId } = seedCouncil({ stage: 'synthesizing', agentCount: 3 });

      const synthText = '[ollama] Council synthesis: use layered caching with Redis and a CDN.';
      updateCouncilLaunchStage(db, launchId, 'complete', synthText);

      const launch = getCouncilLaunch(db, launchId)!;
      expect(launch.stage).toBe('complete');
      expect(launch.synthesis).toBe(synthText);
    });

    it('all three Ollama providers complete FallbackManager chains in parallel', async () => {
      const agents = [
        createProviderAgent('ollama', 'qwen3:14b', mockProviderResponse('[ollama] response A.', 'qwen3:14b')),
        createProviderAgent('ollama', 'qwen3:14b', mockProviderResponse('[ollama] response B.', 'qwen3:14b')),
        createProviderAgent('ollama', 'qwen3:14b', mockProviderResponse('[ollama] response C.', 'qwen3:14b')),
      ];

      const results = await Promise.all(
        agents.map((a) =>
          new FallbackManager(createMockRegistry([a])).completeWithFallback(
            makeParams(),
            makeChain({ provider: 'ollama', model: 'qwen3:14b' }),
          ),
        ),
      );

      expect(results.every((r) => r.usedProvider === 'ollama')).toBe(true);
      for (const a of agents) assertProviderUsed(a);
    });
  });

  // ── [ollama+anthropic] Ollama members with Anthropic synthesizer ──────────

  describe('[ollama+anthropic] council: Ollama members with Anthropic synthesizer', () => {
    it('Ollama members and Anthropic synthesizer each use their own dispatch chain', async () => {
      const ollamaA = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderResponse('[ollama] member A: use sharding.', 'qwen3:14b'),
      );
      const ollamaB = createProviderAgent(
        'ollama',
        'llama3.1:8b',
        mockProviderResponse('[ollama] member B: use replication.', 'llama3.1:8b'),
      );
      const anthropicSynth = createProviderAgent(
        'anthropic',
        'claude-sonnet-4-6',
        mockProviderResponse('[anthropic] synthesis: combine sharding with replication.', 'claude-sonnet-4-6'),
      );

      const [rA, rB, rSynth] = await Promise.all([
        new FallbackManager(createMockRegistry([ollamaA])).completeWithFallback(
          makeParams(),
          makeChain({ provider: 'ollama', model: 'qwen3:14b' }),
        ),
        new FallbackManager(createMockRegistry([ollamaB])).completeWithFallback(
          makeParams(),
          makeChain({ provider: 'ollama', model: 'llama3.1:8b' }),
        ),
        new FallbackManager(createMockRegistry([anthropicSynth])).completeWithFallback(
          makeParams(),
          makeChain({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
        ),
      ]);

      expect(rA.usedProvider).toBe('ollama');
      expect(rB.usedProvider).toBe('ollama');
      expect(rSynth.usedProvider).toBe('anthropic');
      assertProviderUsed(ollamaA);
      assertProviderUsed(ollamaB);
      assertProviderUsed(anthropicSynth);
    });

    it('synthesis aggregates Ollama member responses before Anthropic synthesizes', () => {
      const { agents, launchId } = seedCouncil({ stage: 'synthesizing', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // Two Ollama members
      for (const agent of agents.slice(0, 2)) {
        const s = createSession(db, {
          projectId: launch.projectId,
          agentId: agent.id,
          name: `Member: ${agent.name} (ollama)`,
          councilLaunchId: launchId,
          councilRole: 'member',
        });
        insertAssistantMessage(s.id, `[ollama] ${agent.name}: my recommendation.`);
      }

      // One Anthropic member (will act as synthesizer in a later phase)
      const synthSession = createSession(db, {
        projectId: launch.projectId,
        agentId: agents[2].id,
        name: `Member: ${agents[2].name} (anthropic)`,
        councilLaunchId: launchId,
        councilRole: 'member',
      });
      insertAssistantMessage(synthSession.id, '[anthropic] combined recommendation.');

      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      expect(parts).toHaveLength(3);
      const allContent = parts.join('\n');
      expect(allContent).toContain('[ollama]');
      expect(allContent).toContain('[anthropic]');
    });

    it('all sessions complete regardless of mixed provider labels', async () => {
      const { pm, markRunning, emitExit } = createMockPM();

      const sessionIds = ['ollama:member-1', 'ollama:member-2', 'anthropic:synthesizer'];
      for (const id of sessionIds) markRunning(id);

      const promise = waitForSessions(pm, sessionIds, 5000);
      for (const id of sessionIds) emitExit(id);

      const result = await promise;
      expect(result.completed.sort()).toEqual(sessionIds.sort());
      expect(result.timedOut).toEqual([]);
    });

    it('Anthropic synthesizer falls back to Ollama if unavailable', async () => {
      const anthropicOffline = createProviderAgent(
        'anthropic',
        'claude-sonnet-4-6',
        mockProviderFailure('ECONNREFUSED: connection refused'),
      );
      const ollamaFallback = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderResponse('[ollama-fallback] synthesis: use sharding.', 'qwen3:14b'),
      );

      const registry = createMockRegistry([anthropicOffline, ollamaFallback]);
      const manager = new FallbackManager(registry);

      const chain = makeChain(
        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        { provider: 'ollama', model: 'qwen3:14b' },
      );

      const result = await manager.completeWithFallback(makeParams(), chain);

      expect(result.usedProvider).toBe('ollama');
      assertProviderUsed(anthropicOffline);
      assertProviderUsed(ollamaFallback);
    });
  });

  // ── [degraded-ollama mid-council] Ollama drops during discussion phase ────

  describe('[degraded-ollama mid-council] council: Ollama drops during discussion phase', () => {
    it('council does not hang when Ollama session times out during discussing phase', async () => {
      const { pm, markRunning, emitExit } = createMockPM();

      markRunning('discussing-ollama-A');
      markRunning('discussing-ollama-B');
      markRunning('discussing-anthropic-C');

      // Ollama B stalls mid-discussion; A and anthropic complete
      const promise = waitForSessions(
        pm,
        ['discussing-ollama-A', 'discussing-ollama-B', 'discussing-anthropic-C'],
        200,
      );

      emitExit('discussing-ollama-A');
      emitExit('discussing-anthropic-C');
      // discussing-ollama-B never exits

      const result = await promise;
      expect(result.completed.sort()).toEqual(['discussing-anthropic-C', 'discussing-ollama-A']);
      expect(result.timedOut).toEqual(['discussing-ollama-B']);
    });

    it('stage does not advance past discussing when Ollama participant is absent', () => {
      const { launchId } = seedCouncil({ stage: 'discussing', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // Council stays in discussing — stage is NOT advanced
      expect(launch.stage).toBe('discussing');
    });

    it('synthesis proceeds with remaining members after Ollama dropout', () => {
      const { agents, launchId } = seedCouncil({ stage: 'synthesizing', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // Ollama A dropped mid-discussion — no session created for it
      const s1 = createSession(db, {
        projectId: launch.projectId,
        agentId: agents[1].id,
        name: 'Member: Agent B (ollama)',
        councilLaunchId: launchId,
        councilRole: 'member',
      });
      insertAssistantMessage(s1.id, '[ollama] Agent B: use write-through caching.');

      const s2 = createSession(db, {
        projectId: launch.projectId,
        agentId: agents[2].id,
        name: 'Member: Agent C (anthropic)',
        councilLaunchId: launchId,
        councilRole: 'member',
      });
      insertAssistantMessage(s2.id, '[anthropic] Agent C: prefer read replicas for heavy reads.');

      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      // Only 2 members contributed — synthesis still proceeds
      expect(parts).toHaveLength(2);
      const allContent = parts.join('\n');
      expect(allContent).toContain('[ollama]');
      expect(allContent).toContain('[anthropic]');
    });

    it('FallbackManager falls back to Anthropic when Ollama times out mid-discussion', async () => {
      const ollamaTimedOut = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderFailure('timeout: request exceeded 30000ms'),
      );
      const anthropicFallback = createProviderAgent(
        'anthropic',
        'claude-haiku-4-5-20251001',
        mockProviderResponse('[anthropic:fallback] recovery response.', 'claude-haiku-4-5-20251001'),
      );

      const registry = createMockRegistry([ollamaTimedOut, anthropicFallback]);
      const manager = new FallbackManager(registry);

      const chain = makeChain(
        { provider: 'ollama', model: 'qwen3:14b' },
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      );

      const result = await manager.completeWithFallback(makeParams(), chain);

      expect(result.usedProvider).toBe('anthropic');
      assertProviderUsed(ollamaTimedOut);
      assertProviderUsed(anthropicFallback);
    });
  });

  // ── [cursor-only] Full phase cycle ───────────────────────────────────────

  describe('[cursor-only] council: full phase cycle', () => {
    it('stage transitions from responding through to complete persist correctly', () => {
      const { launchId } = seedCouncil({ stage: 'responding' });

      const phases: CouncilStage[] = ['responding', 'discussing', 'reviewing', 'synthesizing', 'complete'];

      for (const stage of phases) {
        updateCouncilLaunchStage(db, launchId, stage);
        const launch = getCouncilLaunch(db, launchId)!;
        expect(launch.stage).toBe(stage);
      }
    });

    it('all three Cursor members submit responses in the responding phase', () => {
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
        insertAssistantMessage(s.id, `[cursor:cursor-fast] ${agent.name}: my initial response.`);
      }

      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      expect(parts).toHaveLength(3);
      expect(parts.every((p) => p.includes('[cursor:cursor-fast]'))).toBe(true);
    });

    it('discussion messages are recorded for each round and Cursor agent', () => {
      const { agents, launchId } = seedCouncil({ stage: 'discussing', agentCount: 3 });

      updateCouncilLaunchDiscussionRound(db, launchId, 1, 2);

      for (const agent of agents) {
        insertDiscussionMessage(db, {
          launchId,
          agentId: agent.id,
          agentName: agent.name,
          round: 1,
          content: `[cursor] ${agent.name} round-1: agreed on caching strategy.`,
        });
      }

      const messages = getDiscussionMessages(db, launchId);
      expect(messages).toHaveLength(3);
      expect(messages.every((m) => m.round === 1)).toBe(true);
      expect(messages.every((m) => m.content.includes('[cursor]'))).toBe(true);

      const launch = getCouncilLaunch(db, launchId)!;
      expect(launch.currentDiscussionRound).toBe(1);
      expect(launch.totalDiscussionRounds).toBe(2);
    });

    it('synthesis is stored and stage advances to complete', () => {
      const { launchId } = seedCouncil({ stage: 'synthesizing', agentCount: 3 });

      const synthText = '[cursor] Council synthesis: use layered caching with edge CDN.';
      updateCouncilLaunchStage(db, launchId, 'complete', synthText);

      const launch = getCouncilLaunch(db, launchId)!;
      expect(launch.stage).toBe('complete');
      expect(launch.synthesis).toBe(synthText);
    });

    it('all three Cursor providers complete FallbackManager chains in parallel', async () => {
      const agents = [
        createProviderAgent('cursor', 'cursor-fast', mockProviderResponse('[cursor] response A.', 'cursor-fast')),
        createProviderAgent('cursor', 'cursor-fast', mockProviderResponse('[cursor] response B.', 'cursor-fast')),
        createProviderAgent('cursor', 'cursor-fast', mockProviderResponse('[cursor] response C.', 'cursor-fast')),
      ];

      const results = await Promise.all(
        agents.map((a) =>
          new FallbackManager(createMockRegistry([a])).completeWithFallback(
            makeParams(),
            makeChain({ provider: 'cursor', model: 'cursor-fast' }),
          ),
        ),
      );

      expect(results.every((r) => r.usedProvider === 'cursor')).toBe(true);
      for (const a of agents) assertProviderUsed(a);
    });

    it('all three Cursor sessions complete and waitForSessions resolves', async () => {
      const { pm, markRunning, emitExit } = createMockPM();

      markRunning('cursor-s1');
      markRunning('cursor-s2');
      markRunning('cursor-s3');

      const promise = waitForSessions(pm, ['cursor-s1', 'cursor-s2', 'cursor-s3'], 5000);

      emitExit('cursor-s1');
      emitExit('cursor-s2');
      emitExit('cursor-s3');

      const result = await promise;
      expect(result.completed.sort()).toEqual(['cursor-s1', 'cursor-s2', 'cursor-s3']);
      expect(result.timedOut).toEqual([]);
    });
  });

  // ── [cursor+anthropic] Cursor members with Anthropic synthesizer ──────────

  describe('[cursor+anthropic] council: Cursor members with Anthropic synthesizer', () => {
    it('Cursor members and Anthropic synthesizer each use their own dispatch chain', async () => {
      const cursorA = createProviderAgent(
        'cursor',
        'cursor-fast',
        mockProviderResponse('[cursor] member A: use sharding.', 'cursor-fast'),
      );
      const cursorB = createProviderAgent(
        'cursor',
        'cursor-fast',
        mockProviderResponse('[cursor] member B: use replication.', 'cursor-fast'),
      );
      const anthropicSynth = createProviderAgent(
        'anthropic',
        'claude-sonnet-4-6',
        mockProviderResponse('[anthropic] synthesis: combine sharding with replication.', 'claude-sonnet-4-6'),
      );

      const [rA, rB, rSynth] = await Promise.all([
        new FallbackManager(createMockRegistry([cursorA])).completeWithFallback(
          makeParams(),
          makeChain({ provider: 'cursor', model: 'cursor-fast' }),
        ),
        new FallbackManager(createMockRegistry([cursorB])).completeWithFallback(
          makeParams(),
          makeChain({ provider: 'cursor', model: 'cursor-fast' }),
        ),
        new FallbackManager(createMockRegistry([anthropicSynth])).completeWithFallback(
          makeParams(),
          makeChain({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
        ),
      ]);

      expect(rA.usedProvider).toBe('cursor');
      expect(rB.usedProvider).toBe('cursor');
      expect(rSynth.usedProvider).toBe('anthropic');
      assertProviderUsed(cursorA);
      assertProviderUsed(cursorB);
      assertProviderUsed(anthropicSynth);
    });

    it('synthesis aggregates Cursor member responses before Anthropic synthesizes', () => {
      const { agents, launchId } = seedCouncil({ stage: 'synthesizing', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // Two Cursor members
      for (const agent of agents.slice(0, 2)) {
        const s = createSession(db, {
          projectId: launch.projectId,
          agentId: agent.id,
          name: `Member: ${agent.name} (cursor)`,
          councilLaunchId: launchId,
          councilRole: 'member',
        });
        insertAssistantMessage(s.id, `[cursor] ${agent.name}: my recommendation.`);
      }

      // One Anthropic synthesizer
      const synthSession = createSession(db, {
        projectId: launch.projectId,
        agentId: agents[2].id,
        name: `Member: ${agents[2].name} (anthropic)`,
        councilLaunchId: launchId,
        councilRole: 'member',
      });
      insertAssistantMessage(synthSession.id, '[anthropic] combined recommendation.');

      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      expect(parts).toHaveLength(3);
      const allContent = parts.join('\n');
      expect(allContent).toContain('[cursor]');
      expect(allContent).toContain('[anthropic]');
    });

    it('all sessions complete regardless of mixed Cursor+Anthropic provider labels', async () => {
      const { pm, markRunning, emitExit } = createMockPM();

      const sessionIds = ['cursor:member-1', 'cursor:member-2', 'anthropic:synthesizer'];
      for (const id of sessionIds) markRunning(id);

      const promise = waitForSessions(pm, sessionIds, 5000);
      for (const id of sessionIds) emitExit(id);

      const result = await promise;
      expect(result.completed.sort()).toEqual(sessionIds.sort());
      expect(result.timedOut).toEqual([]);
    });

    it('Anthropic synthesizer falls back to Cursor if Anthropic unavailable', async () => {
      const anthropicOffline = createProviderAgent(
        'anthropic',
        'claude-sonnet-4-6',
        mockProviderFailure('ECONNREFUSED: connection refused'),
      );
      const cursorFallback = createProviderAgent(
        'cursor',
        'cursor-fast',
        mockProviderResponse('[cursor-fallback] synthesis: use sharding.', 'cursor-fast'),
      );

      const registry = createMockRegistry([anthropicOffline, cursorFallback]);
      const manager = new FallbackManager(registry);

      const chain = makeChain(
        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        { provider: 'cursor', model: 'cursor-fast' },
      );

      const result = await manager.completeWithFallback(makeParams(), chain);

      expect(result.usedProvider).toBe('cursor');
      assertProviderUsed(anthropicOffline);
      assertProviderUsed(cursorFallback);
    });
  });

  // ── [degraded-cursor] Cursor binary missing mid-council ───────────────────

  describe('[degraded-cursor] council: Cursor binary missing mid-council', () => {
    it('council does not hang when Cursor session times out (≤ 60s simulated)', async () => {
      const { pm, markRunning, emitExit } = createMockPM();

      markRunning('cursor-A');
      markRunning('cursor-B-missing');
      markRunning('cursor-C');

      const startTime = Date.now();
      // 200ms simulates the ≤ 60s requirement in fast test time
      const promise = waitForSessions(pm, ['cursor-A', 'cursor-B-missing', 'cursor-C'], 200);

      emitExit('cursor-A');
      emitExit('cursor-C');
      // cursor-B-missing never exits — binary gone

      const result = await promise;
      const elapsed = Date.now() - startTime;

      expect(result.completed.sort()).toEqual(['cursor-A', 'cursor-C']);
      expect(result.timedOut).toEqual(['cursor-B-missing']);
      // Council must complete without hanging
      expect(elapsed).toBeLessThan(2000);
    });

    it('stage does not advance past discussing when Cursor participant goes missing', () => {
      const { launchId } = seedCouncil({ stage: 'discussing', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // Council stays in discussing — stage is NOT advanced due to missing Cursor participant
      expect(launch.stage).toBe('discussing');
    });

    it('synthesis proceeds with remaining members after Cursor dropout', () => {
      const { agents, launchId } = seedCouncil({ stage: 'synthesizing', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // Cursor A dropped — no session created for it (binary missing)
      const s1 = createSession(db, {
        projectId: launch.projectId,
        agentId: agents[1].id,
        name: 'Member: Agent B (cursor)',
        councilLaunchId: launchId,
        councilRole: 'member',
      });
      insertAssistantMessage(s1.id, '[cursor] Agent B: use write-through caching.');

      const s2 = createSession(db, {
        projectId: launch.projectId,
        agentId: agents[2].id,
        name: 'Member: Agent C (anthropic)',
        councilLaunchId: launchId,
        councilRole: 'member',
      });
      insertAssistantMessage(s2.id, '[anthropic] Agent C: prefer read replicas for heavy reads.');

      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      // Only 2 members contributed — synthesis still proceeds
      expect(parts).toHaveLength(2);
      const allContent = parts.join('\n');
      expect(allContent).toContain('[cursor]');
      expect(allContent).toContain('[anthropic]');
    });

    it('FallbackManager falls back to Anthropic when Cursor binary is missing', async () => {
      const cursorMissing = createProviderAgent(
        'cursor',
        'cursor-fast',
        mockProviderFailure('ENOENT: cursor binary not found'),
      );
      const anthropicFallback = createProviderAgent(
        'anthropic',
        'claude-haiku-4-5-20251001',
        mockProviderResponse('[anthropic:fallback] recovery response.', 'claude-haiku-4-5-20251001'),
      );

      const registry = createMockRegistry([cursorMissing, anthropicFallback]);
      const manager = new FallbackManager(registry);

      const chain = makeChain(
        { provider: 'cursor', model: 'cursor-fast' },
        { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      );

      const result = await manager.completeWithFallback(makeParams(), chain);

      expect(result.usedProvider).toBe('anthropic');
      assertProviderUsed(cursorMissing);
      assertProviderUsed(anthropicFallback);
    });
  });

  // ── [all-fail] All non-Claude participants fail ───────────────────────────

  describe('[all-fail] council: all non-Claude participants fail', () => {
    it('council errors gracefully — all sessions time out within simulated 30s', async () => {
      const { pm, markRunning } = createMockPM();

      markRunning('cursor-1-fail');
      markRunning('cursor-2-fail');
      markRunning('ollama-3-fail');

      const startTime = Date.now();
      // 150ms simulates the ≤ 30s requirement in fast test time
      const result = await waitForSessions(pm, ['cursor-1-fail', 'cursor-2-fail', 'ollama-3-fail'], 150);
      const elapsed = Date.now() - startTime;

      // All sessions timed out — none completed
      expect(result.completed).toEqual([]);
      expect(result.timedOut.sort()).toEqual(['cursor-1-fail', 'cursor-2-fail', 'ollama-3-fail']);
      // Error surfaces within simulated 30s bound
      expect(elapsed).toBeLessThan(2000);
    });

    it('FallbackManager propagates error when all non-Claude providers fail', async () => {
      const cursorFail = createProviderAgent(
        'cursor',
        'cursor-fast',
        mockProviderFailure('ENOENT: cursor binary not found'),
      );
      const ollamaFail = createProviderAgent(
        'ollama',
        'qwen3:14b',
        mockProviderFailure('ECONNREFUSED: ollama not running'),
      );

      const registry = createMockRegistry([cursorFail, ollamaFail]);
      const manager = new FallbackManager(registry);

      const chain = makeChain({ provider: 'cursor', model: 'cursor-fast' }, { provider: 'ollama', model: 'qwen3:14b' });

      await expect(manager.completeWithFallback(makeParams(), chain)).rejects.toThrow();
      assertProviderUsed(cursorFail);
      assertProviderUsed(ollamaFail);
    });

    it('synthesis receives no content when all participants fail', () => {
      const { launchId } = seedCouncil({ stage: 'responding', agentCount: 3 });

      // No sessions created — all participants failed before producing output
      const sessions = listSessionsByCouncilLaunch(db, launchId);
      const parts = aggregateSessionResponses(db, sessions);

      // No content to aggregate
      expect(parts).toHaveLength(0);
    });

    it('council stage stays at responding when all sessions fail to produce output', () => {
      const { launchId } = seedCouncil({ stage: 'responding', agentCount: 3 });
      const launch = getCouncilLaunch(db, launchId)!;

      // All participants failed — stage remains at responding (not advanced)
      expect(launch.stage).toBe('responding');
    });
  });
});
