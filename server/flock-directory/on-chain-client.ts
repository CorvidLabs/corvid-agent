/**
 * OnChainFlockClient — TypeScript client for the FlockDirectory smart contract.
 *
 * Uses algosdk's AtomicTransactionComposer + ABI methods to interact
 * with the on-chain Flock Directory contract on Algorand.
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
    private abiMethods: Map<string, import('algosdk').default.ABIMethod> = new Map();

    constructor(config: OnChainFlockConfig) {
        this.appId = config.appId;
        this.algodClient = config.algodClient;
        this.waitRounds = config.waitRounds ?? 4;
    }

    /** Current app ID (may change after deploy). */
    getAppId(): number {
        return this.appId;
    }

    // ─── ABI Method Resolution ───────────────────────────────────────────────

    /**
     * Load ABI methods from the ARC56 spec bundled with the contract.
     * Lazy-loaded on first use.
     */
    private async getMethod(name: string): Promise<import('algosdk').default.ABIMethod> {
        if (this.abiMethods.size === 0) {
            await this.loadAbiMethods();
        }
        const method = this.abiMethods.get(name);
        if (!method) throw new Error(`Unknown ABI method: ${name}`);
        return method;
    }

    private async loadAbiMethods(): Promise<void> {
        const algosdk = (await import('algosdk')).default;
        // Load ARC56 spec from bundled artifact
        const spec = await import('./contract/FlockDirectory.arc56.json');
        for (const m of spec.methods) {
            const abiMethod = new algosdk.ABIMethod({
                name: m.name,
                args: m.args.map((a: { name: string; type: string }) => ({
                    name: a.name,
                    type: a.type === 'pay' ? 'pay' : a.type,
                })),
                returns: { type: m.returns.type },
            });
            this.abiMethods.set(m.name, abiMethod);
        }
        log.info(`Loaded ${this.abiMethods.size} ABI methods from FlockDirectory spec`);
    }

    // ─── Transaction Helpers ─────────────────────────────────────────────────

    /**
     * Create a TransactionSigner from a secret key.
     * Uses algosdk's makeBasicAccountTransactionSigner for compatibility.
     */
    private async makeSigner(sk: Uint8Array): Promise<import('algosdk').TransactionSigner> {
        const algosdk = (await import('algosdk')).default;
        // Reconstruct an Account object from the secret key
        const mnemonic = algosdk.secretKeyToMnemonic(sk);
        const account = algosdk.mnemonicToSecretKey(mnemonic);
        return algosdk.makeBasicAccountTransactionSigner(account);
    }

    /**
     * Execute a simple ABI method call (no payment transaction argument).
     */
    private async callMethod(
        methodName: string,
        args: import('algosdk').ABIValue[],
        senderAddress: string,
        sk: Uint8Array,
        opts?: { boxes?: import('algosdk').BoxReference[]; appAccounts?: string[] },
    ): Promise<import('algosdk').ABIResult> {
        const algosdk = (await import('algosdk')).default;
        const method = await this.getMethod(methodName);
        const params = await this.algodClient.getTransactionParams().do();
        const signer = await this.makeSigner(sk);

        const composer = new algosdk.AtomicTransactionComposer();
        composer.addMethodCall({
            appID: this.appId,
            method,
            methodArgs: args,
            sender: senderAddress,
            suggestedParams: params,
            signer,
            boxes: opts?.boxes,
            appAccounts: opts?.appAccounts?.map((a) => algosdk.Address.fromString(a)),
        });

        const result = await composer.execute(this.algodClient, this.waitRounds);
        return result.methodResults[0];
    }

    /**
     * Compute the box reference for an agent address.
     * Box key = prefix 'a' + 32-byte address.
     */
    private async agentBoxRef(address: string): Promise<import('algosdk').BoxReference> {
        const algosdk = (await import('algosdk')).default;
        const addr = algosdk.Address.fromString(address);
        const key = new Uint8Array(1 + 32);
        key[0] = 0x61; // 'a'
        key.set(addr.publicKey, 1);
        return { appIndex: this.appId, name: key };
    }

    /**
     * Compute the box reference for a challenge ID.
     * Box key = prefix 'c' + encoded challenge ID string.
     */
    private challengeBoxRef(challengeId: string): import('algosdk').BoxReference {
        const encoder = new TextEncoder();
        const idBytes = encoder.encode(challengeId);
        // Dynamic-size box: prefix 'c' + 2-byte length + id bytes
        const key = new Uint8Array(1 + 2 + idBytes.length);
        key[0] = 0x63; // 'c'
        key[1] = (idBytes.length >> 8) & 0xff;
        key[2] = idBytes.length & 0xff;
        key.set(idBytes, 3);
        return { appIndex: this.appId, name: key };
    }

    // ─── Contract Deployment ─────────────────────────────────────────────────

    /**
     * Deploy the FlockDirectory contract to the network.
     * Returns the new app ID.
     */
    async deploy(
        senderAddress: string,
        sk: Uint8Array,
    ): Promise<number> {
        const algosdk = (await import('algosdk')).default;
        const fs = await import('fs');
        const path = await import('path');

        const artifactDir = path.join(import.meta.dir, 'contract');
        const approvalTeal = fs.readFileSync(path.join(artifactDir, 'FlockDirectory.approval.teal'), 'utf-8');
        const clearTeal = fs.readFileSync(path.join(artifactDir, 'FlockDirectory.clear.teal'), 'utf-8');

        // Compile TEAL programs
        const approvalResult = await this.algodClient.compile(approvalTeal).do();
        const clearResult = await this.algodClient.compile(clearTeal).do();

        const approvalProgram = new Uint8Array(Buffer.from(approvalResult.result, 'base64'));
        const clearProgram = new Uint8Array(Buffer.from(clearResult.result, 'base64'));

        const method = await this.getMethod('createApplication');
        const params = await this.algodClient.getTransactionParams().do();
        const signer = await this.makeSigner(sk);

        const composer = new algosdk.AtomicTransactionComposer();
        composer.addMethodCall({
            appID: 0, // 0 = create
            method,
            methodArgs: [],
            sender: senderAddress,
            suggestedParams: params,
            signer,
            approvalProgram,
            clearProgram,
            numGlobalInts: 4,
            numGlobalByteSlices: 1,
            numLocalInts: 0,
            numLocalByteSlices: 0,
            extraPages: 3, // Large approval program needs extra pages
        });

        const result = await composer.execute(this.algodClient, this.waitRounds);
        const txInfo = result.methodResults[0].txInfo;
        const newAppId = Number(txInfo?.applicationIndex ?? 0);

        if (newAppId === 0) {
            throw new Error('Deploy failed: no application ID returned');
        }

        this.appId = newAppId;
        log.info('Deployed FlockDirectory contract', { appId: newAppId, txId: result.txIDs[0] });
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
        const algosdk = (await import('algosdk')).default;
        const method = await this.getMethod('registerAgent');
        const params = await this.algodClient.getTransactionParams().do();
        const signer = await this.makeSigner(sk);
        const appAddr = algosdk.getApplicationAddress(this.appId);

        // Create the stake payment transaction
        const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: senderAddress,
            receiver: appAddr.toString(),
            amount: stakeMicroAlgos,
            suggestedParams: params,
        });

        const agentBox = await this.agentBoxRef(senderAddress);

        const composer = new algosdk.AtomicTransactionComposer();
        composer.addMethodCall({
            appID: this.appId,
            method,
            methodArgs: [name, endpoint, metadata, { txn: payTxn, signer }],
            sender: senderAddress,
            suggestedParams: params,
            signer,
            boxes: [agentBox],
        });

        const result = await composer.execute(this.algodClient, this.waitRounds);
        const txId = result.txIDs[result.txIDs.length - 1];
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
        const agentBox = await this.agentBoxRef(senderAddress);
        const result = await this.callMethod(
            'updateAgent',
            [name, endpoint, metadata],
            senderAddress,
            sk,
            { boxes: [agentBox] },
        );
        log.info('Updated agent on-chain', { address: senderAddress, txId: result.txID });
        return result.txID;
    }

    /**
     * Send a heartbeat to keep the agent's status active.
     */
    async heartbeat(senderAddress: string, sk: Uint8Array): Promise<string> {
        const agentBox = await this.agentBoxRef(senderAddress);
        const result = await this.callMethod('heartbeat', [], senderAddress, sk, {
            boxes: [agentBox],
        });
        log.debug('Agent heartbeat sent', { address: senderAddress });
        return result.txID;
    }

    /**
     * Deregister an agent and return its stake.
     */
    async deregister(senderAddress: string, sk: Uint8Array): Promise<string> {
        const agentBox = await this.agentBoxRef(senderAddress);
        const result = await this.callMethod('deregister', [], senderAddress, sk, {
            boxes: [agentBox],
        });
        log.info('Deregistered agent on-chain', { address: senderAddress, txId: result.txID });
        return result.txID;
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
        const challengeBox = this.challengeBoxRef(challengeId);
        const result = await this.callMethod(
            'createChallenge',
            [challengeId, category, description, BigInt(maxScore)],
            adminAddress,
            sk,
            { boxes: [challengeBox] },
        );
        log.info('Created challenge', { challengeId, category, txId: result.txID });
        return result.txID;
    }

    /**
     * Deactivate a challenge (admin only).
     */
    async deactivateChallenge(
        adminAddress: string,
        sk: Uint8Array,
        challengeId: string,
    ): Promise<string> {
        const challengeBox = this.challengeBoxRef(challengeId);
        const result = await this.callMethod(
            'deactivateChallenge',
            [challengeId],
            adminAddress,
            sk,
            { boxes: [challengeBox] },
        );
        log.info('Deactivated challenge', { challengeId, txId: result.txID });
        return result.txID;
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
        const algosdk = (await import('algosdk')).default;
        const agentBox = await this.agentBoxRef(agentAddress);
        const challengeBox = this.challengeBoxRef(challengeId);

        // Test result box: prefix 't' + 2-byte len + (32-byte addr + 2-byte len + challengeId)
        const challengeIdBytes = new TextEncoder().encode(challengeId);
        const addr = algosdk.Address.fromString(agentAddress);
        const testKey = new Uint8Array(1 + 2 + 32 + 2 + challengeIdBytes.length);
        testKey[0] = 0x74; // 't'
        const innerLen = 32 + 2 + challengeIdBytes.length;
        testKey[1] = (innerLen >> 8) & 0xff;
        testKey[2] = innerLen & 0xff;
        testKey.set(addr.publicKey, 3);
        testKey[35] = (challengeIdBytes.length >> 8) & 0xff;
        testKey[36] = challengeIdBytes.length & 0xff;
        testKey.set(challengeIdBytes, 37);
        const testBox: import('algosdk').BoxReference = { appIndex: this.appId, name: testKey };

        const result = await this.callMethod(
            'recordTestResult',
            [algosdk.Address.fromString(agentAddress), challengeId, BigInt(score)],
            adminAddress,
            sk,
            {
                boxes: [agentBox, challengeBox, testBox],
                appAccounts: [agentAddress],
            },
        );
        log.info('Recorded test result', { agentAddress, challengeId, score, txId: result.txID });
        return result.txID;
    }

    // ─── Read Methods ────────────────────────────────────────────────────────

    /**
     * Get an agent's on-chain record.
     */
    async getAgentInfo(
        agentAddress: string,
        readerAddress: string,
        sk: Uint8Array,
    ): Promise<OnChainAgentRecord> {
        const algosdk = (await import('algosdk')).default;
        const agentBox = await this.agentBoxRef(agentAddress);
        const result = await this.callMethod(
            'getAgentInfo',
            [algosdk.Address.fromString(agentAddress)],
            readerAddress,
            sk,
            { boxes: [agentBox], appAccounts: [agentAddress] },
        );

        // Result is a tuple: (string, string, string, uint64, uint64, uint64, uint64, uint64, uint64, uint64)
        const tuple = result.returnValue as unknown as [string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
        return {
            name: tuple[0],
            endpoint: tuple[1],
            metadata: tuple[2],
            tier: Number(tuple[3]),
            totalScore: Number(tuple[4]),
            totalMaxScore: Number(tuple[5]),
            testCount: Number(tuple[6]),
            lastHeartbeatRound: Number(tuple[7]),
            registrationRound: Number(tuple[8]),
            stake: Number(tuple[9]),
        };
    }

    /**
     * Get an agent's reputation tier.
     */
    async getAgentTier(
        agentAddress: string,
        readerAddress: string,
        sk: Uint8Array,
    ): Promise<number> {
        const algosdk = (await import('algosdk')).default;
        const agentBox = await this.agentBoxRef(agentAddress);
        const result = await this.callMethod(
            'getAgentTier',
            [algosdk.Address.fromString(agentAddress)],
            readerAddress,
            sk,
            { boxes: [agentBox], appAccounts: [agentAddress] },
        );
        return Number(result.returnValue as bigint);
    }

    /**
     * Get an agent's reputation score (0-100).
     */
    async getAgentScore(
        agentAddress: string,
        readerAddress: string,
        sk: Uint8Array,
    ): Promise<number> {
        const algosdk = (await import('algosdk')).default;
        const agentBox = await this.agentBoxRef(agentAddress);
        const result = await this.callMethod(
            'getAgentScore',
            [algosdk.Address.fromString(agentAddress)],
            readerAddress,
            sk,
            { boxes: [agentBox], appAccounts: [agentAddress] },
        );
        return Number(result.returnValue as bigint);
    }

    /**
     * Get an agent's test count.
     */
    async getAgentTestCount(
        agentAddress: string,
        readerAddress: string,
        sk: Uint8Array,
    ): Promise<number> {
        const algosdk = (await import('algosdk')).default;
        const agentBox = await this.agentBoxRef(agentAddress);
        const result = await this.callMethod(
            'getAgentTestCount',
            [algosdk.Address.fromString(agentAddress)],
            readerAddress,
            sk,
            { boxes: [agentBox], appAccounts: [agentAddress] },
        );
        return Number(result.returnValue as bigint);
    }

    /**
     * Get challenge info.
     */
    async getChallengeInfo(
        challengeId: string,
        readerAddress: string,
        sk: Uint8Array,
    ): Promise<OnChainChallenge> {
        const challengeBox = this.challengeBoxRef(challengeId);
        const result = await this.callMethod(
            'getChallengeInfo',
            [challengeId],
            readerAddress,
            sk,
            { boxes: [challengeBox] },
        );

        // Result is a tuple: (string, string, uint64, uint64)
        const tuple = result.returnValue as unknown as [string, string, bigint, bigint];
        return {
            category: tuple[0],
            description: tuple[1],
            maxScore: Number(tuple[2]),
            active: tuple[3] === 1n,
        };
    }

    // ─── Admin Methods ───────────────────────────────────────────────────────

    /**
     * Update the minimum stake (admin only).
     */
    async updateMinStake(
        adminAddress: string,
        sk: Uint8Array,
        newMinStakeMicroAlgos: number,
    ): Promise<string> {
        const result = await this.callMethod(
            'updateMinStake',
            [BigInt(newMinStakeMicroAlgos)],
            adminAddress,
            sk,
        );
        return result.txID;
    }

    /**
     * Transfer admin role (admin only).
     */
    async transferAdmin(
        adminAddress: string,
        sk: Uint8Array,
        newAdminAddress: string,
    ): Promise<string> {
        const algosdk = (await import('algosdk')).default;
        const result = await this.callMethod(
            'transferAdmin',
            [algosdk.Address.fromString(newAdminAddress)],
            adminAddress,
            sk,
        );
        return result.txID;
    }

    /**
     * Set registration open/closed (admin only).
     */
    async setRegistrationOpen(
        adminAddress: string,
        sk: Uint8Array,
        open: boolean,
    ): Promise<string> {
        const result = await this.callMethod(
            'setRegistrationOpen',
            [BigInt(open ? 1 : 0)],
            adminAddress,
            sk,
        );
        return result.txID;
    }

    /**
     * Admin remove an agent (returns stake, admin only).
     */
    async adminRemoveAgent(
        adminAddress: string,
        sk: Uint8Array,
        agentAddress: string,
    ): Promise<string> {
        const algosdk = (await import('algosdk')).default;
        const agentBox = await this.agentBoxRef(agentAddress);
        const result = await this.callMethod(
            'adminRemoveAgent',
            [algosdk.Address.fromString(agentAddress)],
            adminAddress,
            sk,
            { boxes: [agentBox], appAccounts: [agentAddress] },
        );
        return result.txID;
    }
}
