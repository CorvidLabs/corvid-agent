/**
 * FlockDirectory contract deployment helpers.
 *
 * Handles deploying the FlockDirectory smart contract to localnet/testnet,
 * persisting the app ID, and creating a ready-to-use OnChainFlockClient.
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatService } from '../algochat/service';
import { createLogger } from '../lib/logger';
import { OnChainFlockClient, type OnChainFlockConfig } from './on-chain-client';

const log = createLogger('FlockDeploy');

/** Minimum balance to fund the contract for box storage + stake returns (10 ALGO). */
const CONTRACT_FUND_MICRO_ALGOS = 10_000_000;

/**
 * Get the persisted FlockDirectory app ID from the config table.
 */
export function getPersistedAppId(db: Database): number {
  try {
    const row = db.query(`SELECT value FROM flock_directory_config WHERE key = 'app_id'`).get() as {
      value: string;
    } | null;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0; // Table doesn't exist yet (migration not run)
  }
}

/**
 * Persist the FlockDirectory app ID.
 */
export function setPersistedAppId(db: Database, appId: number): void {
  db.query(
    `INSERT OR REPLACE INTO flock_directory_config (key, value, updated_at) VALUES ('app_id', ?, datetime('now'))`,
  ).run(String(appId));
  log.info('Persisted FlockDirectory app ID', { appId });
}

/**
 * Create an OnChainFlockClient, deploying the contract if needed.
 *
 * On localnet: auto-deploys if no app ID is persisted.
 * On testnet/mainnet: requires a pre-deployed app ID.
 *
 * Returns null if AlgoChat is not available or deployment fails.
 */
export async function createFlockClient(
  db: Database,
  algoChatService: AlgoChatService | null,
  network: string,
): Promise<OnChainFlockClient | null> {
  if (!algoChatService) {
    log.info('AlgoChat not available — on-chain Flock Directory disabled');
    return null;
  }

  let appId = getPersistedAppId(db);

  if (appId > 0) {
    // Verify the app still exists on-chain
    try {
      await algoChatService.algodClient.getApplicationByID(appId).do();
      log.info('Using existing FlockDirectory contract', { appId });
    } catch {
      log.warn('Persisted app ID no longer exists on-chain', { appId });
      appId = 0;
    }
  }

  if (appId === 0) {
    if (network === 'mainnet') {
      log.info('No FlockDirectory app ID configured for mainnet');
      return null;
    }

    // Auto-deploy on localnet/testnet
    log.info(`Deploying FlockDirectory contract to ${network}...`);
    try {
      appId = await deployFlockDirectory(algoChatService);
      setPersistedAppId(db, appId);
    } catch (err) {
      log.error('Failed to deploy FlockDirectory', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  const config: OnChainFlockConfig = {
    appId,
    algodClient: algoChatService.algodClient,
  };

  return new OnChainFlockClient(config);
}

/**
 * Deploy the FlockDirectory contract using the master AlgoChat account.
 * The master account becomes the contract admin.
 */
async function deployFlockDirectory(service: AlgoChatService): Promise<number> {
  const senderAddress = service.chatAccount.address;
  const sk = service.chatAccount.account.sk;

  // Create a temporary client with appId=0 for deployment
  const client = new OnChainFlockClient({
    appId: 0,
    algodClient: service.algodClient,
  });

  const appId = await client.deploy(senderAddress, sk);

  // Fund the contract so it can hold boxes and pay out stakes
  await client.fundContract(senderAddress, sk, CONTRACT_FUND_MICRO_ALGOS);

  log.info('FlockDirectory deployed and funded', { appId, fundedMicroAlgos: CONTRACT_FUND_MICRO_ALGOS });
  return appId;
}
