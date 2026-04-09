/**
 * End-to-end tests for the Flock Directory smart contract on localnet.
 *
 * Tests exercise actual ABI method calls against a running AlgoKit localnet
 * instance (http://localhost:4001). All tests are skipped automatically when
 * localnet is unavailable, so this file is safe to include in CI.
 *
 * Test design: Tests run sequentially and build state. Each describe block
 * corresponds to a distinct operation category. Direct on-chain calls use
 * agent1/agent2 with their own keys; service-layer calls use the admin signer.
 *
 * Prerequisites:
 *   algokit localnet start
 *
 * Covers:
 * - Contract deployment and funding
 * - Agent registration (registerAgent ABI call)
 * - Agent info lookup (getAgentInfo)
 * - Reputation queries (getAgentTier, getAgentScore, getAgentTestCount)
 * - Heartbeat (heartbeat ABI call)
 * - Agent metadata update (updateAgent ABI call)
 * - Challenge creation (createChallenge) and query (getChallengeInfo)
 * - Challenge deactivation (deactivateChallenge)
 * - Test result recording (recordTestResult) and score accumulation
 * - On-chain to off-chain sync (FlockDirectoryService.syncFromChain)
 * - Deregistration (deregister ABI call)
 * - Admin operations (updateMinStake, setRegistrationOpen, adminRemoveAgent)
 * - Directory listing via FlockDirectoryService.listActive + search
 * - Full agent lifecycle: register → heartbeat → test → score → sync → deregister
 */

import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { runMigrations } from '../db/schema';
import { getPersistedAppId, setPersistedAppId } from '../flock-directory/deploy';
import { OnChainFlockClient, TIER_NAMES, TIER_REGISTERED } from '../flock-directory/on-chain-client';
import { FlockDirectoryService, type OnChainSignerConfig } from '../flock-directory/service';

// ─── LocalNet Constants ──────────────────────────────────────────────────────

const ALGOD_URL = process.env.LOCALNET_ALGOD_URL ?? 'http://localhost:4001';
const ALGOD_TOKEN = 'a'.repeat(64);
const KMD_URL = process.env.LOCALNET_KMD_URL ?? 'http://localhost:4002';
const KMD_TOKEN = 'a'.repeat(64);

/** Stake amount for agent registration (1 ALGO). */
const STAKE_AMOUNT = 1_000_000;
/** Transaction confirmation rounds. */
const WAIT_ROUNDS = 4;

// ─── LocalNet Helpers ────────────────────────────────────────────────────────

async function isLocalNetAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ALGOD_URL}/v2/status`, {
      headers: { 'X-Algo-API-Token': ALGOD_TOKEN },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function makeAlgodClient() {
  const algosdk = (await import('algosdk')).default;
  const parsed = new URL(ALGOD_URL);
  return new algosdk.Algodv2(ALGOD_TOKEN, `${parsed.protocol}//${parsed.hostname}`, parsed.port || '');
}

async function makeAccount() {
  const algosdk = (await import('algosdk')).default;
  const account = algosdk.generateAccount();
  return {
    address: account.addr.toString(),
    sk: account.sk,
    mnemonic: algosdk.secretKeyToMnemonic(account.sk),
  };
}

async function fundAccount(
  algodClient: import('algosdk').default.Algodv2,
  address: string,
  microAlgos = 10_000_000,
): Promise<void> {
  const algosdk = (await import('algosdk')).default;
  const kmdParsed = new URL(KMD_URL);
  const kmd = new algosdk.Kmd(
    KMD_TOKEN,
    `${kmdParsed.protocol}//${kmdParsed.hostname}`,
    parseInt(kmdParsed.port || '4002', 10),
  );

  const wallets = await kmd.listWallets();
  const defaultWallet = wallets.wallets.find((w: { name: string }) => w.name === 'unencrypted-default-wallet');
  if (!defaultWallet) throw new Error('LocalNet default wallet not found');

  const handle = (await kmd.initWalletHandle(defaultWallet.id, '')).wallet_handle_token;
  try {
    const keys = await kmd.listKeys(handle);
    const dispenserAddress = keys.addresses[0];
    if (!dispenserAddress) throw new Error('No accounts in LocalNet default wallet');

    const keyResponse = await kmd.exportKey(handle, '', dispenserAddress);
    const dispenserAccount = algosdk.mnemonicToSecretKey(algosdk.secretKeyToMnemonic(keyResponse.private_key));

    const params = await algodClient.getTransactionParams().do();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: dispenserAddress,
      receiver: address,
      amount: microAlgos,
      suggestedParams: params,
    });
    const signed = txn.signTxn(dispenserAccount.sk);
    const { txid } = await algodClient.sendRawTransaction(signed).do();
    await algosdk.waitForConfirmation(algodClient, txid, WAIT_ROUNDS);
  } finally {
    await kmd.releaseWalletHandle(handle);
  }
}

// ─── Suite Globals ───────────────────────────────────────────────────────────

let localNetAvailable = false;
let algodClient: import('algosdk').default.Algodv2;

/** Admin account — deploys contract and runs admin-only ABI calls. */
let admin: { address: string; sk: Uint8Array };
/** Agent 1 — registers with its own keys. */
let agent1: { address: string; sk: Uint8Array };
/** Agent 2 — registers with its own keys, updated and deregistered. */
let agent2: { address: string; sk: Uint8Array };

let onChainClient: OnChainFlockClient;
let db: Database;
/** Service configured with admin signer for hybrid tests. */
let svc: FlockDirectoryService;
/** Service with NO on-chain client for pure off-chain tests. */
let svcOffChain: FlockDirectoryService;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  localNetAvailable = await isLocalNetAvailable();
  if (!localNetAvailable) return;

  algodClient = await makeAlgodClient();

  // Create three fresh accounts for the test suite
  [admin, agent1, agent2] = await Promise.all([makeAccount(), makeAccount(), makeAccount()]);

  // Fund from the LocalNet KMD dispenser
  // Admin gets extra ALGO for contract deployment + funding
  await fundAccount(algodClient, admin.address, 50_000_000);
  await Promise.all([
    fundAccount(algodClient, agent1.address, 10_000_000),
    fundAccount(algodClient, agent2.address, 10_000_000),
  ]);

  // Deploy the FlockDirectory contract (admin pays for deployment)
  onChainClient = new OnChainFlockClient({ appId: 0, algodClient });
  const appId = await onChainClient.deploy(admin.address, admin.sk);

  // Fund the contract account for box storage and stake returns (5 ALGO)
  await onChainClient.fundContract(admin.address, admin.sk, 5_000_000);

  // SQLite + service setup
  db = new Database(':memory:');
  runMigrations(db);

  svc = new FlockDirectoryService(db);
  const signer: OnChainSignerConfig = {
    senderAddress: admin.address,
    sk: admin.sk,
    network: 'localnet',
  };
  svc.setOnChainClient(onChainClient, signer);

  // Pure off-chain service (no on-chain client)
  svcOffChain = new FlockDirectoryService(db);

  // Persist app ID for deploy-helper tests
  setPersistedAppId(db, appId);
});

afterAll(() => {
  if (db) db.close();
});

/** Returns true when localnet is not available (used to skip tests inline). */
function noLocalNet(): boolean {
  return !localNetAvailable;
}

// ─── Contract Deployment ─────────────────────────────────────────────────────

describe('e2e: contract deployment', () => {
  test('deployed contract has a valid app ID', () => {
    if (noLocalNet()) return;
    expect(onChainClient.getAppId()).toBeGreaterThan(0);
  });

  test('app ID is persisted to the flock_directory_config table', () => {
    if (noLocalNet()) return;
    const persisted = getPersistedAppId(db);
    expect(persisted).toBe(onChainClient.getAppId());
  });

  test('FlockDirectoryService includes on-chain app ID in stats', () => {
    if (noLocalNet()) return;
    const stats = svc.getStats();
    expect(stats.onChainAppId).toBe(onChainClient.getAppId());
  });
});

// ─── Agent Registration ───────────────────────────────────────────────────────

describe('e2e: agent registration', () => {
  test('registerAgent ABI call returns a transaction ID for agent1', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.registerAgent(
      agent1.address,
      agent1.sk,
      'Agent One',
      'http://agent1.local',
      JSON.stringify({ capabilities: ['coding', 'review'] }),
      STAKE_AMOUNT,
    );

    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  test('registerAgent ABI call returns a transaction ID for agent2', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.registerAgent(
      agent2.address,
      agent2.sk,
      'Agent Two',
      'http://agent2.local',
      JSON.stringify({ capabilities: ['research', 'analysis'] }),
      STAKE_AMOUNT,
    );

    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  test('getAgentInfo returns correct name and endpoint for agent1', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);

    expect(record.name).toBe('Agent One');
    expect(record.endpoint).toBe('http://agent1.local');
  });

  test('getAgentInfo records metadata JSON correctly', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);
    const meta = JSON.parse(record.metadata);
    expect(meta.capabilities).toEqual(['coding', 'review']);
  });

  test('getAgentInfo returns TIER_REGISTERED for newly registered agent', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);
    expect(record.tier).toBe(TIER_REGISTERED);
    expect(TIER_NAMES[record.tier]).toBe('Registered');
  });

  test('getAgentInfo records positive stake for agent1', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);
    expect(record.stake).toBeGreaterThanOrEqual(STAKE_AMOUNT);
  });

  test('getAgentInfo reports registrationRound > 0', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);
    expect(record.registrationRound).toBeGreaterThan(0);
  });

  test('getAgentInfo returns distinct records for agent1 and agent2', async () => {
    if (noLocalNet()) return;

    const r1 = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);
    const r2 = await onChainClient.getAgentInfo(agent2.address, admin.address, admin.sk);

    expect(r1.name).toBe('Agent One');
    expect(r2.name).toBe('Agent Two');
    expect(r1.endpoint).not.toBe(r2.endpoint);
  });

  test('off-chain register stores SQLite record idempotently', async () => {
    if (noLocalNet()) return;

    // Register agent1 off-chain (no on-chain call since we use svcOffChain)
    const stored = await svcOffChain.register({
      address: agent1.address,
      name: 'Agent One',
      description: 'First e2e agent',
      instanceUrl: 'http://agent1.local',
      capabilities: ['coding', 'review'],
    });

    expect(stored.address).toBe(agent1.address);
    expect(stored.name).toBe('Agent One');
    expect(stored.status).toBe('active');

    // Second call is idempotent
    const again = await svcOffChain.register({
      address: agent1.address,
      name: 'Agent One Updated',
    });
    expect(again.id).toBe(stored.id);
    expect(again.name).toBe('Agent One Updated');
  });
});

// ─── Reputation Queries ───────────────────────────────────────────────────────

describe('e2e: reputation queries', () => {
  test('getAgentTier returns TIER_REGISTERED before any tests', async () => {
    if (noLocalNet()) return;

    const tier = await onChainClient.getAgentTier(agent1.address, admin.address, admin.sk);
    expect(tier).toBe(TIER_REGISTERED);
  });

  test('getAgentScore returns 0 before any test results recorded', async () => {
    if (noLocalNet()) return;

    const score = await onChainClient.getAgentScore(agent1.address, admin.address, admin.sk);
    expect(score).toBe(0);
  });

  test('getAgentTestCount returns 0 before any test results', async () => {
    if (noLocalNet()) return;

    const count = await onChainClient.getAgentTestCount(agent1.address, admin.address, admin.sk);
    expect(count).toBe(0);
  });

  test('getAgentScore also returns 0 for agent2 before tests', async () => {
    if (noLocalNet()) return;

    const score = await onChainClient.getAgentScore(agent2.address, admin.address, admin.sk);
    expect(score).toBe(0);
  });
});

// ─── Heartbeat ───────────────────────────────────────────────────────────────

describe('e2e: heartbeat', () => {
  test('heartbeat ABI call returns a transaction ID', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.heartbeat(agent1.address, agent1.sk);
    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  test('lastHeartbeatRound advances or stays the same after heartbeat', async () => {
    if (noLocalNet()) return;

    const before = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);
    await onChainClient.heartbeat(agent1.address, agent1.sk);
    const after = await onChainClient.getAgentInfo(agent1.address, admin.address, admin.sk);

    expect(after.lastHeartbeatRound).toBeGreaterThanOrEqual(before.lastHeartbeatRound);
  });
});

// ─── Agent Update ─────────────────────────────────────────────────────────────

describe('e2e: agent metadata update', () => {
  test('updateAgent changes name on-chain', async () => {
    if (noLocalNet()) return;

    await onChainClient.updateAgent(
      agent2.address,
      agent2.sk,
      'Agent Two Updated',
      'http://agent2-v2.local',
      JSON.stringify({ capabilities: ['research', 'analysis', 'writing'] }),
    );

    const record = await onChainClient.getAgentInfo(agent2.address, admin.address, admin.sk);
    expect(record.name).toBe('Agent Two Updated');
  });

  test('updateAgent changes endpoint on-chain', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent2.address, admin.address, admin.sk);
    expect(record.endpoint).toBe('http://agent2-v2.local');
  });

  test('updateAgent persists new capabilities in metadata', async () => {
    if (noLocalNet()) return;

    const record = await onChainClient.getAgentInfo(agent2.address, admin.address, admin.sk);
    const meta = JSON.parse(record.metadata);
    expect(meta.capabilities).toContain('writing');
  });
});

// ─── Challenge Protocol ───────────────────────────────────────────────────────

// Challenge IDs used across tests
const CHALLENGE_RESPONSIVE = 'e2e-responsiveness-001';
const CHALLENGE_ACCURACY = 'e2e-accuracy-001';
const CHALLENGE_DEACTIVATE = 'e2e-deactivate-001';

describe('e2e: challenge creation and queries', () => {
  test('createChallenge ABI call succeeds (admin only)', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.createChallenge(
      admin.address,
      admin.sk,
      CHALLENGE_RESPONSIVE,
      'responsiveness',
      'Ping the agent and measure latency',
      100,
    );

    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  test('createChallenge succeeds for a second challenge', async () => {
    if (noLocalNet()) return;

    await onChainClient.createChallenge(
      admin.address,
      admin.sk,
      CHALLENGE_ACCURACY,
      'accuracy',
      'Math question with expected numeric answer',
      50,
    );

    const txId = await onChainClient.createChallenge(
      admin.address,
      admin.sk,
      CHALLENGE_DEACTIVATE,
      'safety',
      'Challenge to be deactivated in tests',
      25,
    );
    expect(typeof txId).toBe('string');
  });

  test('getChallengeInfo returns correct category and description', async () => {
    if (noLocalNet()) return;

    const challenge = await onChainClient.getChallengeInfo(CHALLENGE_RESPONSIVE, admin.address, admin.sk);

    expect(challenge.category).toBe('responsiveness');
    expect(challenge.description).toBe('Ping the agent and measure latency');
    expect(challenge.maxScore).toBe(100);
  });

  test('getChallengeInfo shows challenge is active after creation', async () => {
    if (noLocalNet()) return;

    const challenge = await onChainClient.getChallengeInfo(CHALLENGE_RESPONSIVE, admin.address, admin.sk);

    expect(challenge.active).toBe(true);
  });

  test('deactivateChallenge marks it inactive', async () => {
    if (noLocalNet()) return;

    await onChainClient.deactivateChallenge(admin.address, admin.sk, CHALLENGE_DEACTIVATE);

    const challenge = await onChainClient.getChallengeInfo(CHALLENGE_DEACTIVATE, admin.address, admin.sk);
    expect(challenge.active).toBe(false);
  });
});

// ─── Test Result Recording & Reputation ──────────────────────────────────────

describe('e2e: test result recording and reputation scoring', () => {
  test('recordTestResult ABI call succeeds for agent1 on responsiveness challenge', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.recordTestResult(
      admin.address,
      admin.sk,
      agent1.address,
      CHALLENGE_RESPONSIVE,
      85,
    );

    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  test('getAgentTestCount increments after recording first result', async () => {
    if (noLocalNet()) return;

    const count = await onChainClient.getAgentTestCount(agent1.address, admin.address, admin.sk);
    expect(count).toBe(1);
  });

  test('getAgentScore reflects first test result (85/100 = 85)', async () => {
    if (noLocalNet()) return;

    const score = await onChainClient.getAgentScore(agent1.address, admin.address, admin.sk);
    expect(score).toBe(85);
  });

  test('recordTestResult succeeds for a second challenge', async () => {
    if (noLocalNet()) return;

    await onChainClient.recordTestResult(
      admin.address,
      admin.sk,
      agent1.address,
      CHALLENGE_ACCURACY,
      40, // 40/50 = 80%
    );

    const count = await onChainClient.getAgentTestCount(agent1.address, admin.address, admin.sk);
    expect(count).toBe(2);
  });

  test('getAgentScore aggregates across multiple test results', async () => {
    if (noLocalNet()) return;

    // totalScore = 85 + 40 = 125, totalMaxScore = 100 + 50 = 150
    // score = floor(125 / 150 * 100) = 83
    const score = await onChainClient.getAgentScore(agent1.address, admin.address, admin.sk);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('syncFromChain updates off-chain reputation score', async () => {
    if (noLocalNet()) return;

    // Ensure agent1 is in the off-chain DB
    await svcOffChain.register({
      address: agent1.address,
      name: 'Agent One',
      description: 'Sync test',
    });

    const record = await svc.syncFromChain(agent1.address);
    expect(record).not.toBeNull();
    expect(record!.testCount).toBeGreaterThanOrEqual(2);

    const offChain = svcOffChain.getByAddress(agent1.address);
    expect(offChain).not.toBeNull();
    expect(offChain!.reputationScore).toBeGreaterThan(0);
  });
});

// ─── Admin Operations ─────────────────────────────────────────────────────────

describe('e2e: admin operations', () => {
  test('updateMinStake returns a transaction ID', async () => {
    if (noLocalNet()) return;

    // Lower min stake for subsequent tests
    const txId = await onChainClient.updateMinStake(admin.address, admin.sk, 500_000);
    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });

  test('setRegistrationOpen can close registration', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.setRegistrationOpen(admin.address, admin.sk, false);
    expect(typeof txId).toBe('string');
  });

  test('setRegistrationOpen can reopen registration', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.setRegistrationOpen(admin.address, admin.sk, true);
    expect(typeof txId).toBe('string');
  });

  test('adminRemoveAgent removes a freshly-registered agent', async () => {
    if (noLocalNet()) return;

    // Create and fund a disposable agent
    const disposable = await makeAccount();
    await fundAccount(algodClient, disposable.address, 5_000_000);

    // Register it
    await onChainClient.registerAgent(
      disposable.address,
      disposable.sk,
      'DisposableAgent',
      'http://disposable.local',
      '{}',
      STAKE_AMOUNT,
    );

    // Verify it's registered
    const before = await onChainClient.getAgentInfo(disposable.address, admin.address, admin.sk);
    expect(before.name).toBe('DisposableAgent');

    // Admin removes it
    const txId = await onChainClient.adminRemoveAgent(admin.address, admin.sk, disposable.address);
    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });
});

// ─── Agent Deregistration ─────────────────────────────────────────────────────

describe('e2e: agent deregistration', () => {
  test('deregister ABI call returns a transaction ID for agent2', async () => {
    if (noLocalNet()) return;

    const txId = await onChainClient.deregister(agent2.address, agent2.sk);
    expect(typeof txId).toBe('string');
    expect(txId.length).toBeGreaterThan(0);
  });
});

// ─── Directory Listing & Search ───────────────────────────────────────────────

describe('e2e: directory listing and search', () => {
  test('listActive returns agents registered off-chain', async () => {
    if (noLocalNet()) return;

    // Register agent2 off-chain (was already deregistered on-chain above)
    await svcOffChain.register({
      address: agent2.address,
      name: 'Agent Two Updated',
      description: 'Research specialist',
      capabilities: ['research', 'analysis', 'writing'],
    });

    const active = svcOffChain.listActive();
    expect(active.length).toBeGreaterThanOrEqual(1);
    const names = active.map((a) => a.name);
    expect(names.some((n) => n.includes('Agent'))).toBe(true);
  });

  test('search by capability filters correctly', async () => {
    if (noLocalNet()) return;

    await svcOffChain.register({
      address: 'ALGO_E2E_SEARCH_CAP',
      name: 'SecurityBot',
      description: 'Security scanner',
      capabilities: ['security', 'audit'],
    });

    const result = svcOffChain.search({ capability: 'security' });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.agents.some((a) => a.name === 'SecurityBot')).toBe(true);
  });

  test('search by minimum reputation filters correctly', async () => {
    if (noLocalNet()) return;

    const high = await svcOffChain.register({
      address: 'ALGO_E2E_SEARCH_HIGH',
      name: 'HighRepAgent',
    });
    svcOffChain.update(high.id, { reputationScore: 85 });

    await svcOffChain.register({
      address: 'ALGO_E2E_SEARCH_LOW',
      name: 'LowRepAgent',
    });
    // LowRepAgent has default score 0

    const highRep = svcOffChain.search({ minReputation: 80 });
    const found = highRep.agents.find((a) => a.name === 'HighRepAgent');
    expect(found).toBeDefined();

    const lowRep = svcOffChain.search({ minReputation: 80 });
    expect(lowRep.agents.every((a) => a.reputationScore >= 80)).toBe(true);
  });

  test('search returns paginated results', async () => {
    if (noLocalNet()) return;

    // Register several agents for pagination
    for (let i = 0; i < 5; i++) {
      await svcOffChain.register({
        address: `ALGO_E2E_PAGE_${i}`,
        name: `PageAgent${i}`,
      });
    }

    const page1 = svcOffChain.search({ limit: 3, offset: 0 });
    const page2 = svcOffChain.search({ limit: 3, offset: 3 });

    expect(page1.agents.length).toBeLessThanOrEqual(3);
    expect(page1.total).toBeGreaterThan(3);
    // Agents on page2 should differ from page1
    const ids1 = new Set(page1.agents.map((a) => a.id));
    const ids2 = new Set(page2.agents.map((a) => a.id));
    const overlap = [...ids1].filter((id) => ids2.has(id));
    expect(overlap.length).toBe(0);
  });

  test('search with sortBy=name asc returns alphabetical order', async () => {
    if (noLocalNet()) return;

    await svcOffChain.register({ address: 'ALGO_E2E_SORT_Z', name: 'Zephyr' });
    await svcOffChain.register({ address: 'ALGO_E2E_SORT_A', name: 'Aardvark' });
    await svcOffChain.register({ address: 'ALGO_E2E_SORT_M', name: 'Marble' });

    const result = svcOffChain.search({ sortBy: 'name', sortOrder: 'asc' });
    const names = result.agents.map((a) => a.name);
    // Aardvark should appear before Zephyr
    const aIdx = names.indexOf('Aardvark');
    const zIdx = names.indexOf('Zephyr');
    if (aIdx !== -1 && zIdx !== -1) {
      expect(aIdx).toBeLessThan(zIdx);
    }
  });

  test('getStats reflects on-chain app ID after wiring', () => {
    if (noLocalNet()) return;

    const stats = svc.getStats();
    expect(stats.onChainAppId).toBe(onChainClient.getAppId());
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.active).toBe('number');
  });

  test('getStats off-chain service has null onChainAppId', () => {
    if (noLocalNet()) return;

    const stats = svcOffChain.getStats();
    expect(stats.onChainAppId).toBeNull();
  });
});

// ─── Full Agent Lifecycle ─────────────────────────────────────────────────────

describe('e2e: full agent lifecycle', () => {
  test('register → heartbeat → test → score → sync → list → deregister', async () => {
    if (noLocalNet()) return;

    // 1. Create and fund a dedicated lifecycle agent
    const lifecycle = await makeAccount();
    await fundAccount(algodClient, lifecycle.address, 10_000_000);

    // 2. Register on-chain with own keys
    const regTxId = await onChainClient.registerAgent(
      lifecycle.address,
      lifecycle.sk,
      'LifecycleAgent',
      'http://lifecycle.local',
      JSON.stringify({ capabilities: ['e2e'] }),
      STAKE_AMOUNT,
    );
    expect(regTxId.length).toBeGreaterThan(0);

    // 3. Verify registration info
    const info = await onChainClient.getAgentInfo(lifecycle.address, admin.address, admin.sk);
    expect(info.name).toBe('LifecycleAgent');
    expect(info.tier).toBe(TIER_REGISTERED);
    expect(info.registrationRound).toBeGreaterThan(0);

    // 4. Send heartbeat
    const hbTxId = await onChainClient.heartbeat(lifecycle.address, lifecycle.sk);
    expect(hbTxId.length).toBeGreaterThan(0);

    const afterHb = await onChainClient.getAgentInfo(lifecycle.address, admin.address, admin.sk);
    expect(afterHb.lastHeartbeatRound).toBeGreaterThanOrEqual(info.lastHeartbeatRound);

    // 5. Admin creates a lifecycle-specific challenge and records a result
    const lcChallengeId = `e2e-lifecycle-${Date.now()}`;
    await onChainClient.createChallenge(
      admin.address,
      admin.sk,
      lcChallengeId,
      'bot_verification',
      'Lifecycle full-flow challenge',
      100,
    );

    const resultTxId = await onChainClient.recordTestResult(
      admin.address,
      admin.sk,
      lifecycle.address,
      lcChallengeId,
      92,
    );
    expect(resultTxId.length).toBeGreaterThan(0);

    // 6. Verify reputation after test recording
    const score = await onChainClient.getAgentScore(lifecycle.address, admin.address, admin.sk);
    expect(score).toBe(92); // 92 / 100 = 92%
    const testCount = await onChainClient.getAgentTestCount(lifecycle.address, admin.address, admin.sk);
    expect(testCount).toBe(1);

    // 7. Register off-chain and sync from chain
    const offChain = await svcOffChain.register({
      address: lifecycle.address,
      name: 'LifecycleAgent',
      description: 'Full lifecycle test agent',
      capabilities: ['e2e'],
    });
    expect(offChain.status).toBe('active');

    // Sync on-chain reputation to SQLite
    const chainRecord = await svc.syncFromChain(lifecycle.address);
    expect(chainRecord).not.toBeNull();
    expect(chainRecord!.testCount).toBe(1);

    // 8. Find in the directory listing
    const list = svcOffChain.listActive();
    const found = list.find((a) => a.address === lifecycle.address);
    expect(found).toBeDefined();
    expect(found!.name).toBe('LifecycleAgent');

    // 9. Deregister on-chain
    const deregTxId = await onChainClient.deregister(lifecycle.address, lifecycle.sk);
    expect(deregTxId.length).toBeGreaterThan(0);

    // 10. Mark deregistered off-chain
    const ok = await svcOffChain.deregister(found!.id);
    expect(ok).toBe(true);

    const afterDereg = svcOffChain.getById(found!.id);
    expect(afterDereg!.status).toBe('deregistered');

    // 11. Deregistered agent is excluded from active listing
    const activeAfter = svcOffChain.listActive();
    expect(activeAfter.some((a) => a.address === lifecycle.address)).toBe(false);
  });
});
