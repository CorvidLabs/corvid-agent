/**
 * OnChainFlockClient — Typed client facade for the FlockDirectory smart contract.
 *
 * Wraps the AlgoKit-generated typed client (FlockDirectoryClient) with a
 * purpose-built API for corvid-agent's flock directory operations.
 *
 * Contract spec: server/flock-directory/contract/FlockDirectory.arc56.json
 * Generated client: server/flock-directory/contract/FlockDirectoryClient.generated.ts
 */
import { createLogger } from '../lib/logger';
import { wipeBuffer } from '../lib/secure-wipe';

const log = createLogger('OnChainFlock');

// ─── On-Chain Types ──────────────────────────────────────────────────────────

export interface OnChainAgentRecord {
  name: string;
  endpoint: string;
  metadata: string;
  tier: number;
  totalScore: number;
  totalMaxScore: number;
  testCount: number;
  lastHeartbeatRound: number;
  registrationRound: number;
  stake: number;
}

export interface OnChainChallenge {
  category: string;
  description: string;
  maxScore: number;
  active: boolean;
}

export const TIER_REGISTERED = 1;
export const TIER_TESTED = 2;
export const TIER_ESTABLISHED = 3;
export const TIER_TRUSTED = 4;

export const TIER_NAMES: Record<number, string> = {
  [TIER_REGISTERED]: 'Registered',
  [TIER_TESTED]: 'Tested',
  [TIER_ESTABLISHED]: 'Established',
  [TIER_TRUSTED]: 'Trusted',
};

// ─── Config ──────────────────────────────────────────────────────────────────

export interface OnChainFlockConfig {
  /** The application ID of the deployed FlockDirectory contract. 0 = not yet deployed. */
  appId: number;
  /** Algod client for submitting transactions */
  algodClient: import('algosdk').default.Algodv2;
  /** Number of rounds to wait for transaction confirmation */
  waitRounds?: number;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class OnChainFlockClient {
  private appId: number;
  private algodClient: import('algosdk').default.Algodv2;
  private waitRounds: number;

  constructor(config: OnChainFlockConfig) {
    this.appId = config.appId;
    this.algodClient = config.algodClient;
    this.waitRounds = config.waitRounds ?? 4;
  }

  /** Current app ID (may change after deploy). */
  getAppId(): number {
    return this.appId;
  }

  // ─── AlgoKit Client Helpers ─────────────────────────────────────────────

  /**
   * Build an AlgorandClient + signer + typed FlockDirectoryClient for a given account.
   */
  private async buildTypedClient(senderAddress: string, sk: Uint8Array) {
    const algosdk = (await import('algosdk')).default;
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils/types/algorand-client');
    const { FlockDirectoryClient } = await import('./contract/FlockDirectoryClient.generated');

    const algorand = AlgorandClient.fromClients({ algod: this.algodClient });

    // Reconstruct account from secret key to get a TransactionSigner
    const mnemonic = algosdk.secretKeyToMnemonic(sk);
    const account = algosdk.mnemonicToSecretKey(mnemonic);
    const signer = algosdk.makeBasicAccountTransactionSigner(account);
    algorand.setDefaultSigner(signer);

    const client = new FlockDirectoryClient({
      algorand,
      appId: BigInt(this.appId),
      defaultSender: senderAddress,
    });

    return { algorand, client, signer, algosdk };
  }

  // ─── Contract Deployment ─────────────────────────────────────────────────

  /**
   * Deploy the FlockDirectory contract to the network.
   * Uses the AlgoKit AppFactory for idempotent deployment.
   * Returns the new app ID.
   */
  async deploy(senderAddress: string, sk: Uint8Array): Promise<number> {
    const algosdk = (await import('algosdk')).default;
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils/types/algorand-client');
    const { FlockDirectoryFactory } = await import('./contract/FlockDirectoryClient.generated');

    const algorand = AlgorandClient.fromClients({ algod: this.algodClient });
    const mnemonic = algosdk.secretKeyToMnemonic(sk);
    const account = algosdk.mnemonicToSecretKey(mnemonic);
    algorand.setDefaultSigner(algosdk.makeBasicAccountTransactionSigner(account));

    const factory = new FlockDirectoryFactory({
      algorand,
      defaultSender: senderAddress,
    });

    const { appClient } = await factory.send.create.createApplication({
      args: [],
      schema: {
        globalInts: 4,
        globalByteSlices: 1,
        localInts: 0,
        localByteSlices: 0,
      },
      extraProgramPages: 3,
    });

    const newAppId = Number(appClient.appId);
    if (newAppId === 0) {
      throw new Error('Deploy failed: no application ID returned');
    }

    this.appId = newAppId;
    log.info('Deployed FlockDirectory contract', { appId: newAppId });
    return newAppId;
  }

  /**
   * Fund the contract's account so it can hold boxes and return stakes.
   */
  async fundContract(senderAddress: string, sk: Uint8Array, microAlgos: number): Promise<string> {
    const algosdk = (await import('algosdk')).default;
    const params = await this.algodClient.getTransactionParams().do();
    const appAddr = algosdk.getApplicationAddress(this.appId);

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: senderAddress,
      receiver: appAddr.toString(),
      amount: microAlgos,
      suggestedParams: params,
    });

    const signedTxn = txn.signTxn(sk);
    try {
      const { txid } = await this.algodClient.sendRawTransaction(signedTxn).do();
      await algosdk.waitForConfirmation(this.algodClient, txid, this.waitRounds);
      log.info('Funded contract', { appId: this.appId, microAlgos });
      return txid;
    } finally {
      wipeBuffer(signedTxn);
    }
  }

  // ─── Agent Registration ──────────────────────────────────────────────────

  /**
   * Register an agent on the FlockDirectory contract.
   * Requires a payment transaction for the stake (min 1 ALGO by default).
   */
  async registerAgent(
    senderAddress: string,
    sk: Uint8Array,
    name: string,
    endpoint: string,
    metadata: string,
    stakeMicroAlgos: number,
  ): Promise<string> {
    const { algorand, client, algosdk } = await this.buildTypedClient(senderAddress, sk);

    // Create the stake payment transaction
    const { AlgoAmount } = await import('@algorandfoundation/algokit-utils/types/amount');
    const appAddr = algosdk.getApplicationAddress(this.appId);
    const payTxn = await algorand.createTransaction.payment({
      sender: senderAddress,
      receiver: appAddr.toString(),
      amount: AlgoAmount.MicroAlgo(stakeMicroAlgos),
    });

    const result = await client.send.registerAgent({
      args: { name, endpoint, metadata, payment: payTxn },
    });

    const txId = result.transaction.txID();
    log.info('Registered agent on-chain', { address: senderAddress, name, txId });
    return txId;
  }

  /**
   * Update an agent's metadata on-chain.
   */
  async updateAgent(
    senderAddress: string,
    sk: Uint8Array,
    name: string,
    endpoint: string,
    metadata: string,
  ): Promise<string> {
    const { client } = await this.buildTypedClient(senderAddress, sk);
    const result = await client.send.updateAgent({
      args: { name, endpoint, metadata },
    });
    const txId = result.transaction.txID();
    log.info('Updated agent on-chain', { address: senderAddress, txId });
    return txId;
  }

  /**
   * Send a heartbeat to keep the agent's status active.
   */
  async heartbeat(senderAddress: string, sk: Uint8Array): Promise<string> {
    const { client } = await this.buildTypedClient(senderAddress, sk);
    const result = await client.send.heartbeat({
      args: [],
    });
    const txId = result.transaction.txID();
    log.debug('Agent heartbeat sent', { address: senderAddress });
    return txId;
  }

  /**
   * Deregister an agent and return its stake.
   *
   * The contract issues an inner payment transaction to return the stake.
   * Per the AVM fee-pooling model, the outer transaction must cover both
   * the outer and inner transaction fees (extraFee = 1 × minFee = 1000).
   */
  async deregister(senderAddress: string, sk: Uint8Array): Promise<string> {
    const { client } = await this.buildTypedClient(senderAddress, sk);
    const { AlgoAmount } = await import('@algorandfoundation/algokit-utils/types/amount');
    const result = await client.send.deregister({
      args: [],
      extraFee: AlgoAmount.MicroAlgo(1000),
    });
    const txId = result.transaction.txID();
    log.info('Deregistered agent on-chain', { address: senderAddress, txId });
    return txId;
  }

  // ─── Challenge Protocol ──────────────────────────────────────────────────

  /**
   * Create a new challenge (admin only).
   */
  async createChallenge(
    adminAddress: string,
    sk: Uint8Array,
    challengeId: string,
    category: string,
    description: string,
    maxScore: number,
  ): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const result = await client.send.createChallenge({
      args: { challengeId, category, description, maxScore: BigInt(maxScore) },
    });
    const txId = result.transaction.txID();
    log.info('Created challenge', { challengeId, category, txId });
    return txId;
  }

  /**
   * Deactivate a challenge (admin only).
   */
  async deactivateChallenge(adminAddress: string, sk: Uint8Array, challengeId: string): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const result = await client.send.deactivateChallenge({
      args: { challengeId },
    });
    const txId = result.transaction.txID();
    log.info('Deactivated challenge', { challengeId, txId });
    return txId;
  }

  /**
   * Record a test result for an agent (admin only).
   */
  async recordTestResult(
    adminAddress: string,
    sk: Uint8Array,
    agentAddress: string,
    challengeId: string,
    score: number,
  ): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const result = await client.send.recordTestResult({
      args: {
        agentAddress,
        challengeId,
        score: BigInt(score),
      },
    });
    const txId = result.transaction.txID();
    log.info('Recorded test result', { agentAddress, challengeId, score, txId });
    return txId;
  }

  // ─── Read Methods ────────────────────────────────────────────────────────

  /**
   * Get an agent's on-chain record.
   */
  async getAgentInfo(agentAddress: string, readerAddress: string, sk: Uint8Array): Promise<OnChainAgentRecord> {
    const { client } = await this.buildTypedClient(readerAddress, sk);
    const result = await client.send.getAgentInfo({
      args: { agentAddress },
    });

    const record = result.return!;
    return {
      name: record.name,
      endpoint: record.endpoint,
      metadata: record.metadata,
      tier: Number(record.tier),
      totalScore: Number(record.totalScore),
      totalMaxScore: Number(record.totalMaxScore),
      testCount: Number(record.testCount),
      lastHeartbeatRound: Number(record.lastHeartbeatRound),
      registrationRound: Number(record.registrationRound),
      stake: Number(record.stake),
    };
  }

  /**
   * Get an agent's reputation tier.
   */
  async getAgentTier(agentAddress: string, readerAddress: string, sk: Uint8Array): Promise<number> {
    const { client } = await this.buildTypedClient(readerAddress, sk);
    const result = await client.send.getAgentTier({
      args: { agentAddress },
    });
    return Number(result.return!);
  }

  /**
   * Get an agent's reputation score (0-100).
   */
  async getAgentScore(agentAddress: string, readerAddress: string, sk: Uint8Array): Promise<number> {
    const { client } = await this.buildTypedClient(readerAddress, sk);
    const result = await client.send.getAgentScore({
      args: { agentAddress },
    });
    return Number(result.return!);
  }

  /**
   * Get an agent's test count.
   */
  async getAgentTestCount(agentAddress: string, readerAddress: string, sk: Uint8Array): Promise<number> {
    const { client } = await this.buildTypedClient(readerAddress, sk);
    const result = await client.send.getAgentTestCount({
      args: { agentAddress },
    });
    return Number(result.return!);
  }

  /**
   * Get challenge info.
   */
  async getChallengeInfo(challengeId: string, readerAddress: string, sk: Uint8Array): Promise<OnChainChallenge> {
    const { client } = await this.buildTypedClient(readerAddress, sk);
    const result = await client.send.getChallengeInfo({
      args: { challengeId },
    });

    const challenge = result.return!;
    return {
      category: challenge.category,
      description: challenge.description,
      maxScore: Number(challenge.maxScore),
      active: challenge.active === 1n,
    };
  }

  // ─── Admin Methods ───────────────────────────────────────────────────────

  /**
   * Update the minimum stake (admin only).
   */
  async updateMinStake(adminAddress: string, sk: Uint8Array, newMinStakeMicroAlgos: number): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const result = await client.send.updateMinStake({
      args: { newMinStake: BigInt(newMinStakeMicroAlgos) },
    });
    return result.transaction.txID();
  }

  /**
   * Transfer admin role (admin only).
   */
  async transferAdmin(adminAddress: string, sk: Uint8Array, newAdminAddress: string): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const result = await client.send.transferAdmin({
      args: { newAdmin: newAdminAddress },
    });
    return result.transaction.txID();
  }

  /**
   * Set registration open/closed (admin only).
   */
  async setRegistrationOpen(adminAddress: string, sk: Uint8Array, open: boolean): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const result = await client.send.setRegistrationOpen({
      args: { open: BigInt(open ? 1 : 0) },
    });
    return result.transaction.txID();
  }

  /**
   * Admin remove an agent (returns stake, admin only).
   *
   * The contract issues an inner payment transaction to return the stake.
   * Per the AVM fee-pooling model, the outer transaction must cover both
   * the outer and inner transaction fees (extraFee = 1 × minFee = 1000).
   */
  async adminRemoveAgent(adminAddress: string, sk: Uint8Array, agentAddress: string): Promise<string> {
    const { client } = await this.buildTypedClient(adminAddress, sk);
    const { AlgoAmount } = await import('@algorandfoundation/algokit-utils/types/amount');
    const result = await client.send.adminRemoveAgent({
      args: { agentAddress },
      extraFee: AlgoAmount.MicroAlgo(1000),
    });
    return result.transaction.txID();
  }
}
