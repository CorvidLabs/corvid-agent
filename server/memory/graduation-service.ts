/**
 * MemoryGraduationService — periodically evaluates short-term observations
 * and graduates high-value ones to long-term ARC-69 memories.
 *
 * Runs alongside MemorySyncService. Graduation criteria:
 *   - relevance_score >= 3.0 (boosted by repeated access/reference)
 *   - access_count >= 2 (observation was recalled at least twice)
 *
 * Also handles:
 *   - Expiring stale observations (default TTL: 7 days)
 *   - Purging old expired/dismissed observations (30 days)
 */

import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentWalletService } from '../algochat/agent-wallet';
import { saveMemory, updateMemoryAsaId, updateMemoryTxid } from '../db/agent-memories';
import {
  countObservations,
  expireObservations,
  getGraduationCandidates,
  markGraduated,
  purgeOldObservations,
} from '../db/observations';
import { createLogger } from '../lib/logger';

const log = createLogger('MemoryGraduation');

const GRADUATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SCORE_THRESHOLD = 3.0;
const MIN_ACCESS_COUNT = 2;
const BATCH_SIZE = 5;

export class MemoryGraduationService {
  private db: Database;
  private walletService: AgentWalletService | null = null;
  private network: string | undefined = undefined;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(db: Database) {
    this.db = db;
  }

  setServices(
    _agentMessenger: AgentMessenger,
    _serverMnemonic: string | null | undefined,
    network: string | undefined,
  ): void {
    this.network = network;
  }

  setWalletService(walletService: AgentWalletService): void {
    this.walletService = walletService;
  }

  start(): void {
    if (this.timer) {
      log.warn('MemoryGraduationService already running');
      return;
    }

    // Initial tick after a short delay to avoid startup contention
    setTimeout(() => {
      this.tick().catch((err) => {
        log.error('Initial graduation tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 30_000); // 30s delay after startup

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        log.error('Graduation tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, GRADUATION_INTERVAL_MS);

    log.info('MemoryGraduationService started', { intervalMs: GRADUATION_INTERVAL_MS });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info('MemoryGraduationService stopped');
    }
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // 1. Expire stale observations
      const expired = expireObservations(this.db);
      if (expired > 0) {
        log.info('Expired stale observations', { count: expired });
      }

      // 2. Purge old expired/dismissed observations
      const purged = purgeOldObservations(this.db);
      if (purged > 0) {
        log.info('Purged old observations', { count: purged });
      }

      // 3. Find all agents with active observations and process each
      const agentRows = this.db
        .query(`SELECT DISTINCT agent_id FROM memory_observations WHERE status = 'active'`)
        .all() as { agent_id: string }[];

      let totalGraduated = 0;

      for (const { agent_id: agentId } of agentRows) {
        const graduated = await this.graduateForAgent(agentId);
        totalGraduated += graduated;
      }

      if (totalGraduated > 0) {
        log.info('Graduation tick complete', { graduated: totalGraduated });
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Graduate qualifying observations for a single agent.
   * Returns the number of observations graduated.
   */
  private async graduateForAgent(agentId: string): Promise<number> {
    const candidates = getGraduationCandidates(this.db, agentId, {
      scoreThreshold: SCORE_THRESHOLD,
      minAccess: MIN_ACCESS_COUNT,
      limit: BATCH_SIZE,
    });

    if (candidates.length === 0) return 0;

    let graduated = 0;
    const isLocalnet = this.network === 'localnet' || !this.network;

    for (const obs of candidates) {
      try {
        // Determine memory key
        const memKey = obs.suggestedKey ?? `obs:${obs.source}:${obs.id.slice(0, 8)}`;

        // Save to agent_memories (which triggers ARC-69 via MemorySyncService)
        const memory = saveMemory(this.db, {
          agentId,
          key: memKey,
          content: obs.content,
        });

        // If localnet and wallet available, try immediate ARC-69 graduation
        if (isLocalnet && this.walletService) {
          try {
            await this.graduateViaArc69(agentId, memory.id, memKey, obs.content);
          } catch (err) {
            log.debug('Immediate ARC-69 graduation failed, will retry via MemorySyncService', {
              key: memKey,
              error: err instanceof Error ? err.message : String(err),
            });
            // Memory was saved to SQLite with 'pending' status —
            // MemorySyncService will pick it up on its next tick
          }
        }

        // Mark observation as graduated
        markGraduated(this.db, obs.id, memKey);
        graduated++;

        log.info('Observation graduated to long-term memory', {
          observationId: obs.id,
          memoryKey: memKey,
          source: obs.source,
          relevanceScore: obs.relevanceScore,
          accessCount: obs.accessCount,
        });
      } catch (err) {
        log.error('Failed to graduate observation', {
          observationId: obs.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return graduated;
  }

  /**
   * Attempt immediate ARC-69 ASA creation for a graduated memory.
   */
  private async graduateViaArc69(agentId: string, memoryId: string, key: string, content: string): Promise<void> {
    if (!this.walletService) return;

    const service = this.walletService.getAlgoChatService();
    if (!service.indexerClient) return;

    const chatAccountResult = await this.walletService.getAgentChatAccount(agentId);
    if (!chatAccountResult) return;

    await this.walletService.checkAndRefill(agentId);

    const { createMemoryAsa } = await import('./arc69-store');

    const ctx = {
      db: this.db,
      agentId,
      algodClient: service.algodClient,
      indexerClient: service.indexerClient,
      chatAccount: chatAccountResult.account,
    };

    const { asaId, txid } = await createMemoryAsa(ctx, key, content);
    updateMemoryTxid(this.db, memoryId, txid);
    updateMemoryAsaId(this.db, memoryId, asaId);
  }

  getStats(): {
    isRunning: boolean;
    agentStats: Array<{ agentId: string; active: number; graduated: number; expired: number; dismissed: number }>;
  } {
    const agentRows = this.db.query(`SELECT DISTINCT agent_id FROM memory_observations`).all() as {
      agent_id: string;
    }[];

    const agentStats = agentRows.map(({ agent_id }) => ({
      agentId: agent_id,
      ...countObservations(this.db, agent_id),
    }));

    return {
      isRunning: this.timer !== null,
      agentStats,
    };
  }
}
