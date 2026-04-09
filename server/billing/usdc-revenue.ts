/**
 * UsdcRevenueService — watches agent wallets for incoming USDC,
 * records revenue, and auto-forwards to the owner wallet.
 *
 * Initialized when OWNER_WALLET_ADDRESS is set in env.
 * Uses the same indexer polling pattern as UsdcWatcher but tracks
 * per-agent revenue with full txid audit trail.
 */

import type { Database } from 'bun:sqlite';
import type { AgentWalletService } from '../algochat/agent-wallet';
import { listAgents } from '../db/agents';
import {
  getAgentRevenueSummary,
  getPendingRevenue,
  markForwarded,
  markForwardFailed,
  recordRevenue,
  type UsdcRevenueSummary,
} from '../db/usdc-revenue';
import { createLogger } from '../lib/logger';

const log = createLogger('UsdcRevenue');

const FORWARD_INTERVAL_MS = 60_000; // Process forwards every 60s
const POLL_INTERVAL_MS = 30_000; // Poll for new USDC every 30s

export interface UsdcRevenueConfig {
  db: Database;
  ownerWalletAddress: string;
  agentWalletService: AgentWalletService;
  /** USDC ASA ID. */
  asaId: number;
  /** Indexer base URL. */
  indexerBaseUrl: string;
  /** Indexer auth token (optional). */
  indexerToken?: string;
}

interface IndexerTransaction {
  id: string;
  'confirmed-round': number;
  'asset-transfer-transaction'?: {
    amount: number;
    'asset-id': number;
    receiver: string;
    sender: string;
  };
}

interface IndexerResponse {
  transactions: IndexerTransaction[];
}

export class UsdcRevenueService {
  private config: UsdcRevenueConfig;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private forwardTimer: ReturnType<typeof setInterval> | null = null;
  private lastRounds: Map<string, number> = new Map();
  private running = false;

  constructor(config: UsdcRevenueConfig) {
    this.config = config;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    log.info('USDC revenue service started', {
      ownerWallet: `${this.config.ownerWalletAddress.slice(0, 8)}...`,
      asaId: this.config.asaId,
    });

    // Initial poll + forward
    this.pollAllAgents().catch((err) => {
      log.error('Initial USDC revenue poll failed', { error: err instanceof Error ? err.message : String(err) });
    });

    this.pollTimer = setInterval(() => {
      this.pollAllAgents().catch((err) => {
        log.error('USDC revenue poll failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }, POLL_INTERVAL_MS);

    this.forwardTimer = setInterval(() => {
      this.processForwards().catch((err) => {
        log.error('USDC forward processing failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }, FORWARD_INTERVAL_MS);

    // Unref timers so they don't keep the process alive
    if (this.pollTimer && typeof this.pollTimer === 'object' && 'unref' in this.pollTimer) {
      (this.pollTimer as NodeJS.Timeout).unref();
    }
    if (this.forwardTimer && typeof this.forwardTimer === 'object' && 'unref' in this.forwardTimer) {
      (this.forwardTimer as NodeJS.Timeout).unref();
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.forwardTimer) {
      clearInterval(this.forwardTimer);
      this.forwardTimer = null;
    }
    this.running = false;
    log.info('USDC revenue service stopped');
  }

  /** Get revenue summary for a specific agent. */
  getAgentRevenue(agentId: string): UsdcRevenueSummary {
    return getAgentRevenueSummary(this.config.db, agentId);
  }

  /** Poll all agent wallets for incoming USDC. */
  private async pollAllAgents(): Promise<void> {
    const agents = listAgents(this.config.db);
    let totalProcessed = 0;

    for (const agent of agents) {
      if (!agent.walletAddress) continue;
      const processed = await this.pollAgentWallet(agent.id, agent.walletAddress);
      totalProcessed += processed;
    }

    if (totalProcessed > 0) {
      log.info('USDC revenue detected', { count: totalProcessed });
    }
  }

  /** Poll a specific agent wallet for incoming USDC transfers. */
  private async pollAgentWallet(agentId: string, walletAddress: string): Promise<number> {
    const { asaId, indexerBaseUrl, indexerToken } = this.config;
    const lastRound = this.lastRounds.get(agentId) ?? 0;

    let url = `${indexerBaseUrl}/v2/accounts/${walletAddress}/transactions?asset-id=${asaId}&tx-type=axfer&limit=50`;
    if (lastRound > 0) {
      url += `&min-round=${lastRound + 1}`;
    }

    const headers: Record<string, string> = {};
    if (indexerToken) headers['X-Indexer-API-Token'] = indexerToken;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      log.debug('Indexer request failed for agent wallet', { agentId, status: response.status });
      return 0;
    }

    const data = (await response.json()) as IndexerResponse;
    const transactions = data.transactions ?? [];

    let processed = 0;
    for (const tx of transactions) {
      const transfer = tx['asset-transfer-transaction'];
      if (!transfer) continue;
      if (transfer.receiver !== walletAddress) continue;
      if (transfer['asset-id'] !== asaId) continue;
      if (transfer.amount <= 0) continue;

      // Skip transfers from the owner wallet (these are fundings, not revenue)
      if (transfer.sender === this.config.ownerWalletAddress) continue;

      const recorded = recordRevenue(this.config.db, agentId, transfer.amount, transfer.sender, tx.id);

      if (recorded) {
        processed++;
        log.info('USDC revenue recorded', {
          agentId,
          txid: tx.id,
          from: `${transfer.sender.slice(0, 8)}...`,
          amount: transfer.amount / 1_000_000,
        });
      }

      if (tx['confirmed-round'] > (this.lastRounds.get(agentId) ?? 0)) {
        this.lastRounds.set(agentId, tx['confirmed-round']);
      }
    }

    return processed;
  }

  /** Process pending forwards — batch-forward USDC to owner wallet. */
  async processForwards(): Promise<number> {
    const pending = getPendingRevenue(this.config.db);
    if (pending.length === 0) return 0;

    let forwarded = 0;
    for (const entry of pending) {
      try {
        const txid = await this.forwardUsdc(entry.agent_id, entry.amount_micro);
        if (txid) {
          markForwarded(this.config.db, entry.id, txid);
          forwarded++;
          log.info('USDC forwarded to owner', {
            revenueId: entry.id,
            agentId: entry.agent_id,
            amount: entry.amount_micro / 1_000_000,
            txid,
          });
        } else {
          markForwardFailed(this.config.db, entry.id);
        }
      } catch (err) {
        log.error('USDC forward failed', {
          revenueId: entry.id,
          agentId: entry.agent_id,
          error: err instanceof Error ? err.message : String(err),
        });
        markForwardFailed(this.config.db, entry.id);
      }
    }

    if (forwarded > 0) {
      log.info('USDC forwards processed', { forwarded, total: pending.length });
    }

    return forwarded;
  }

  /** Forward USDC from an agent wallet to the owner wallet. */
  private async forwardUsdc(agentId: string, amountMicro: number): Promise<string | null> {
    const chatAccount = await this.config.agentWalletService.getAgentChatAccount(agentId);
    if (!chatAccount) {
      log.warn('Cannot forward USDC — agent has no chat account', { agentId });
      return null;
    }

    try {
      const algosdk = (await import('algosdk')).default;
      const algodClient = (
        this.config.agentWalletService as unknown as { service: { algodClient: import('algosdk').Algodv2 } }
      ).service?.algodClient;
      if (!algodClient) {
        log.warn('Cannot forward USDC — no algod client available');
        return null;
      }

      const params = await algodClient.getTransactionParams().do();
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: chatAccount.address,
        receiver: this.config.ownerWalletAddress,
        amount: amountMicro,
        assetIndex: this.config.asaId,
        suggestedParams: params,
      });

      const signedTxn = txn.signTxn(chatAccount.account.account.sk);
      const { txid } = await algodClient.sendRawTransaction(signedTxn).do();
      return txid as string;
    } catch (err) {
      log.error('ASA transfer failed', {
        agentId,
        amount: amountMicro,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

/**
 * Create a USDC revenue service from environment configuration.
 * Returns null if required configuration is missing.
 */
export function createUsdcRevenueService(
  db: Database,
  agentWalletService: AgentWalletService,
): UsdcRevenueService | null {
  const ownerWalletAddress = process.env.OWNER_WALLET_ADDRESS;
  if (!ownerWalletAddress) {
    log.debug('USDC revenue service not configured: no OWNER_WALLET_ADDRESS');
    return null;
  }

  const network = process.env.ALGORAND_NETWORK ?? 'localnet';
  const asaIdEnv = parseInt(process.env.USDC_ASA_ID ?? '', 10);

  let asaId: number;
  if (Number.isFinite(asaIdEnv) && asaIdEnv > 0) {
    asaId = asaIdEnv;
  } else if (network === 'mainnet') {
    asaId = 31566704; // Mainnet USDC
  } else {
    log.debug('USDC revenue service not configured: no USDC_ASA_ID for non-mainnet');
    return null;
  }

  const indexerBaseUrl =
    process.env.USDC_INDEXER_URL ??
    process.env.LOCALNET_INDEXER_URL ??
    (network === 'testnet' ? 'https://testnet-idx.4160.nodely.dev' : null) ??
    (network === 'mainnet' ? 'https://mainnet-idx.4160.nodely.dev' : null);

  if (!indexerBaseUrl) {
    log.debug('USDC revenue service not configured: no indexer URL');
    return null;
  }

  return new UsdcRevenueService({
    db,
    ownerWalletAddress,
    agentWalletService,
    asaId,
    indexerBaseUrl,
    indexerToken: process.env.USDC_INDEXER_TOKEN,
  });
}
