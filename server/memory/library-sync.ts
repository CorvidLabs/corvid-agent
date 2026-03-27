/**
 * CRVLIB Library Sync Service
 *
 * Periodically indexes all CRVLIB ASAs from localnet into the local
 * `agent_library` table, similar to the existing MemorySyncService pattern.
 *
 * This allows any agent to discover library entries published by other agents
 * without querying the chain on every read.
 */
import type { Database } from 'bun:sqlite';
import type { AgentWalletService } from '../algochat/agent-wallet';
import { upsertLibraryEntryFromChain } from '../db/agent-library';
import { createLogger } from '../lib/logger';

const log = createLogger('LibrarySync');

const SYNC_INTERVAL_MS = 120_000; // 2 minutes
const CRVLIB_UNIT_NAME = 'CRVLIB';

export class LibrarySyncService {
  private db: Database;
  private walletService: AgentWalletService | null = null;
  private network: string | undefined = undefined;
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(db: Database) {
    this.db = db;
  }

  setServices(walletService: AgentWalletService, network: string | undefined): void {
    this.walletService = walletService;
    this.network = network;
  }

  start(): void {
    if (this.timer) {
      log.warn('LibrarySyncService already running');
      return;
    }

    // Run immediately, then on interval
    this.tick().catch((err) => {
      log.error('Initial library sync tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        log.error('Library sync tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, SYNC_INTERVAL_MS);

    log.info('LibrarySyncService started', { intervalMs: SYNC_INTERVAL_MS });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info('LibrarySyncService stopped');
    }
  }

  async tick(): Promise<void> {
    if (this.syncing) return;
    if (!this.walletService) return;

    // CRVLIB is localnet-only
    const isLocalnet = this.network === 'localnet' || !this.network;
    if (!isLocalnet) return;

    this.syncing = true;
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const service = this.walletService.getAlgoChatService();
      if (!service.indexerClient) {
        log.debug('LibrarySync: no indexer client, skipping');
        return;
      }

      const { parseNotePayload } = await import('./arc69-library');

      // Discover all CRVLIB ASAs from any agent via unit name filter
      const response = await service.indexerClient.searchForAssets().unit(CRVLIB_UNIT_NAME).do();

      const assets = (response.assets ?? []) as unknown as Array<Record<string, unknown>>;

      for (const asset of assets) {
        if (asset.deleted) continue;

        const asaId = (asset.index ?? asset['asset-id']) as number | undefined;
        if (!asaId) continue;

        try {
          // Fetch the latest acfg transaction to get current note
          const txnResponse = await service.indexerClient.searchForTransactions().assetID(asaId).txType('acfg').do();

          const txns = (txnResponse.transactions ?? []) as unknown as Array<Record<string, unknown>>;
          if (txns.length === 0) {
            skipped++;
            continue;
          }

          const tx = txns[txns.length - 1] as Record<string, unknown>;
          const noteRaw = tx.note;
          if (!noteRaw) {
            skipped++;
            continue;
          }

          // Decode note field (may be base64 string or Uint8Array)
          let noteBytes: Uint8Array;
          if (noteRaw instanceof Uint8Array) {
            noteBytes = noteRaw;
          } else if (typeof noteRaw === 'string') {
            try {
              const raw = atob(noteRaw);
              noteBytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) noteBytes[i] = raw.charCodeAt(i);
            } catch {
              skipped++;
              continue;
            }
          } else {
            skipped++;
            continue;
          }

          if (noteBytes.length === 0) {
            // Soft-deleted entry — skip
            skipped++;
            continue;
          }

          const payload = parseNotePayload(noteBytes);
          if (!payload) {
            skipped++;
            continue;
          }

          const p = payload.properties;
          const txid = tx.id as string;

          upsertLibraryEntryFromChain(this.db, {
            asaId: Number(asaId),
            key: p.key,
            authorId: p.author_id,
            authorName: p.author_name,
            category: p.category,
            tags: p.tags ?? [],
            content: p.content,
            book: p.book ?? null,
            page: p.page ?? null,
            txid,
          });

          indexed++;
        } catch (err) {
          log.debug('LibrarySync: failed to index ASA', {
            asaId,
            error: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
      }

      log.info('Library sync tick', { indexed, skipped, failed, total: assets.length });
    } finally {
      this.syncing = false;
    }
  }

  getStats(): { isRunning: boolean } {
    return { isRunning: this.timer !== null };
  }
}
