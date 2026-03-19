import type { Database } from 'bun:sqlite';
import type { AgentMessenger } from '../algochat/agent-messenger';
import type { AgentWalletService } from '../algochat/agent-wallet';
import { getPendingMemories, updateMemoryTxid, updateMemoryStatus, updateMemoryAsaId, countPendingMemories } from './agent-memories';
import { encryptMemoryContent } from '../lib/crypto';
import { createLogger } from '../lib/logger';

const log = createLogger('MemorySync');

const SYNC_INTERVAL_MS = 60_000; // 60 seconds
const BATCH_SIZE = 10;
const FAILED_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

export class MemorySyncService {
    private db: Database;
    private agentMessenger: AgentMessenger | null = null;
    private walletService: AgentWalletService | null = null;
    private serverMnemonic: string | undefined = undefined;
    private network: string | undefined = undefined;
    private timer: ReturnType<typeof setInterval> | null = null;
    private syncing = false;

    constructor(db: Database) {
        this.db = db;
    }

    setServices(
        agentMessenger: AgentMessenger,
        serverMnemonic: string | null | undefined,
        network: string | undefined,
    ): void {
        this.agentMessenger = agentMessenger;
        this.serverMnemonic = serverMnemonic ?? undefined;
        this.network = network;
    }

    setWalletService(walletService: AgentWalletService): void {
        this.walletService = walletService;
    }

    start(): void {
        if (this.timer) {
            log.warn('MemorySyncService already running');
            return;
        }

        // Run immediately, then on interval
        this.tick().catch((err) => {
            log.error('Initial memory sync tick failed', { error: err instanceof Error ? err.message : String(err) });
        });

        this.timer = setInterval(() => {
            this.tick().catch((err) => {
                log.error('Memory sync tick failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, SYNC_INTERVAL_MS);

        log.info('MemorySyncService started', { intervalMs: SYNC_INTERVAL_MS });
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            log.info('MemorySyncService stopped');
        }
    }

    async tick(): Promise<void> {
        if (this.syncing) return;
        if (!this.agentMessenger) return;

        this.syncing = true;
        try {
            const memories = getPendingMemories(this.db, BATCH_SIZE);
            if (memories.length === 0) return;

            const isLocalnet = this.network === 'localnet' || !this.network;
            const now = Date.now();
            let synced = 0;
            let skipped = 0;
            let failed = 0;

            for (const memory of memories) {
                // Backoff for failed memories: skip if updated less than 5 minutes ago
                if (memory.status === 'failed') {
                    const updatedAt = new Date(memory.updatedAt + 'Z').getTime();
                    if (now - updatedAt < FAILED_BACKOFF_MS) {
                        skipped++;
                        continue;
                    }
                }

                try {
                    // Ensure agent wallet has sufficient balance before on-chain send
                    if (this.walletService) {
                        await this.walletService.checkAndRefill(memory.agentId);
                    }

                    // On localnet: try ARC-69 ASA path first
                    if (isLocalnet && this.walletService) {
                        try {
                            const synced = await this.syncViaArc69(memory);
                            if (synced) continue;
                        } catch (err) {
                            log.debug('ARC-69 sync failed, falling back to plain txn', {
                                key: memory.key,
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }

                    // Fallback: plain transaction path
                    const encrypted = await encryptMemoryContent(
                        memory.content,
                        this.serverMnemonic,
                        this.network,
                    );
                    const txid = await this.agentMessenger.sendOnChainToSelf(
                        memory.agentId,
                        `[MEMORY:${memory.key}] ${encrypted}`,
                    );

                    if (txid) {
                        updateMemoryTxid(this.db, memory.id, txid);
                        synced++;
                    } else {
                        // sendOnChainToSelf returned null — no wallet, stay pending
                        skipped++;
                    }
                } catch (err) {
                    log.debug('Memory sync failed for key', {
                        key: memory.key,
                        agentId: memory.agentId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                    updateMemoryStatus(this.db, memory.id, 'failed');
                    failed++;
                }
            }

            log.info('Memory sync tick', { synced, failed, skipped, total: memories.length });
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Attempt to sync a pending memory via ARC-69 ASA.
     * Returns true if successful, false if ARC-69 path is unavailable.
     */
    private async syncViaArc69(memory: { id: string; agentId: string; key: string; content: string; asaId: number | null }): Promise<boolean> {
        if (!this.walletService) return false;

        const service = this.walletService.getAlgoChatService();
        if (!service.indexerClient) return false;

        const chatAccountResult = await this.walletService.getAgentChatAccount(memory.agentId);
        if (!chatAccountResult) return false;

        const { createMemoryAsa, updateMemoryAsa, resolveAsaForKey } = await import('../memory/arc69-store');

        const ctx = {
            db: this.db,
            agentId: memory.agentId,
            algodClient: service.algodClient,
            indexerClient: service.indexerClient,
            chatAccount: chatAccountResult.account,
        };

        const existingAsaId = memory.asaId ?? resolveAsaForKey(this.db, memory.agentId, memory.key);

        if (existingAsaId) {
            const { txid } = await updateMemoryAsa(ctx, existingAsaId, memory.key, memory.content);
            updateMemoryTxid(this.db, memory.id, txid);
        } else {
            const { asaId, txid } = await createMemoryAsa(ctx, memory.key, memory.content);
            updateMemoryTxid(this.db, memory.id, txid);
            updateMemoryAsaId(this.db, memory.id, asaId);
        }

        return true;
    }

    getStats(): { pendingCount: number; isRunning: boolean } {
        return {
            pendingCount: countPendingMemories(this.db),
            isRunning: this.timer !== null,
        };
    }
}
