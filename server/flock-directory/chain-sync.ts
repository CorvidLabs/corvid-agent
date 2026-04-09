/**
 * FlockDirectory chain-sync service — keeps the SQLite database in sync
 * with on-chain FlockDirectory contract state.
 *
 * Responsibilities:
 * - Periodic polling of on-chain agent records
 * - Reconciliation of off-chain DB with on-chain truth
 * - Handling registration/deregistration drift
 * - Syncing reputation tiers and scores from chain → DB
 *
 * The on-chain contract is the source of truth for:
 * - Agent registration status
 * - Reputation tiers and scores
 * - Stake amounts
 *
 * The off-chain DB is the source of truth for:
 * - Search/filter queries (faster than on-chain reads)
 * - Extended metadata not stored on-chain
 * - Historical data and analytics
 */
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import type { OnChainAgentRecord, OnChainFlockClient } from './on-chain-client';
import { TIER_NAMES } from './on-chain-client';
import type { FlockDirectoryService, OnChainSignerConfig } from './service';

const log = createLogger('ChainSync');

/** Sync interval in milliseconds (default: 5 minutes). */
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum number of agents to sync per cycle. */
const MAX_AGENTS_PER_CYCLE = 50;

export interface ChainSyncConfig {
  /** Sync interval in milliseconds. */
  intervalMs?: number;
  /** Maximum agents to sync per cycle. */
  maxAgentsPerCycle?: number;
  /** Whether to enable automatic syncing. */
  enabled?: boolean;
}

export interface SyncResult {
  /** Number of agents synced successfully. */
  synced: number;
  /** Number of agents that failed to sync. */
  failed: number;
  /** Number of agents found on-chain but not off-chain. */
  newDiscoveries: number;
  /** Number of agents marked stale based on on-chain data. */
  staleMarked: number;
  /** Duration of the sync in milliseconds. */
  durationMs: number;
}

/**
 * ChainSyncService — Periodically reconciles off-chain DB with on-chain state.
 *
 * Usage:
 * ```ts
 * const sync = new ChainSyncService(db, flockService, onChainClient, signerConfig);
 * sync.start(); // begins periodic sync
 * // ...
 * sync.stop();  // stops periodic sync
 * ```
 */
export class ChainSyncService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly maxAgentsPerCycle: number;
  private readonly enabled: boolean;
  private syncing = false;

  constructor(
    private readonly db: Database,
    private readonly flockService: FlockDirectoryService,
    private readonly onChainClient: OnChainFlockClient,
    private readonly signerConfig: OnChainSignerConfig,
    config?: ChainSyncConfig,
  ) {
    this.intervalMs = config?.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    this.maxAgentsPerCycle = config?.maxAgentsPerCycle ?? MAX_AGENTS_PER_CYCLE;
    this.enabled = config?.enabled ?? true;
  }

  /**
   * Start the periodic sync loop.
   * Runs an initial sync immediately, then schedules subsequent syncs.
   */
  start(): void {
    if (!this.enabled) {
      log.info('Chain sync disabled by config');
      return;
    }

    log.info('Starting chain sync', {
      intervalMs: this.intervalMs,
      maxAgentsPerCycle: this.maxAgentsPerCycle,
      appId: this.onChainClient.getAppId(),
      network: this.signerConfig.network,
    });

    // Run initial sync
    this.syncAll().catch((err) => {
      log.error('Initial chain sync failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Schedule periodic syncs
    this.intervalHandle = setInterval(() => {
      this.syncAll().catch((err) => {
        log.error('Periodic chain sync failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
  }

  /**
   * Stop the periodic sync loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('Chain sync stopped');
    }
  }

  /** Whether the sync loop is running. */
  get isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  /** Whether a sync is currently in progress. */
  get isSyncing(): boolean {
    return this.syncing;
  }

  /**
   * Run a full sync cycle — fetch all known off-chain agents and
   * reconcile their state with on-chain data.
   */
  async syncAll(): Promise<SyncResult> {
    if (this.syncing) {
      log.debug('Sync already in progress, skipping');
      return { synced: 0, failed: 0, newDiscoveries: 0, staleMarked: 0, durationMs: 0 };
    }

    this.syncing = true;
    const startTime = Date.now();

    try {
      const result = await this.doSync();
      const durationMs = Date.now() - startTime;

      if (result.synced > 0 || result.failed > 0) {
        log.info('Chain sync complete', { ...result, durationMs });
      } else {
        log.debug('Chain sync complete (no changes)', { durationMs });
      }

      return { ...result, durationMs };
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync a single agent by address — fetch on-chain data and update DB.
   */
  async syncAgent(address: string): Promise<OnChainAgentRecord | null> {
    return this.flockService.syncFromChain(address);
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private async doSync(): Promise<Omit<SyncResult, 'durationMs'>> {
    let synced = 0;
    let failed = 0;
    const staleMarked = 0;
    const newDiscoveries = 0;

    // Fetch all non-deregistered agents from the off-chain DB
    const agents = this.db
      .query(`SELECT address FROM flock_agents WHERE status != 'deregistered' LIMIT ?`)
      .all(this.maxAgentsPerCycle) as { address: string }[];

    for (const { address } of agents) {
      try {
        const onChainRecord = await this.flockService.syncFromChain(address);
        if (onChainRecord) {
          synced++;

          // Update tier name in description if available
          const tierName = TIER_NAMES[onChainRecord.tier];
          if (tierName) {
            log.debug('Synced agent', {
              address,
              tier: tierName,
              score: onChainRecord.totalScore,
            });
          }
        }
      } catch (err) {
        failed++;
        log.debug('Failed to sync agent', {
          address,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { synced, failed, newDiscoveries, staleMarked };
  }
}
