import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import { getAgent, setAgentWallet, getAgentWalletMnemonic, addAgentFunding, listAgents } from '../db/agents';
import { encryptMnemonic, decryptMnemonic } from '../lib/crypto';
import { getKeystoreEntry, saveKeystoreEntry } from '../lib/wallet-keystore';
import { createLogger } from '../lib/logger';

const log = createLogger('AgentWallet');

const DEFAULT_FUND_ALGO = 10;
const REFILL_THRESHOLD_MICRO = 1_000_000; // 1 ALGO
const REFILL_AMOUNT_MICRO = 5_000_000; // 5 ALGO

export interface AgentChatAccount {
    address: string;
    account: import('@corvidlabs/ts-algochat').ChatAccount;
}

export class AgentWalletService {
    private db: Database;
    private config: AlgoChatConfig;
    private service: AlgoChatService;

    constructor(db: Database, config: AlgoChatConfig, service: AlgoChatService) {
        this.db = db;
        this.config = config;
        this.service = service;
    }

    /**
     * Ensure the agent has a wallet. On localnet with no existing wallet,
     * check the persistent keystore first (survives DB rebuilds), then
     * auto-create and fund from the master account if not found.
     * On testnet/mainnet this is a no-op.
     */
    async ensureWallet(agentId: string): Promise<void> {
        if (this.config.network !== 'localnet') return;

        const agent = getAgent(this.db, agentId);
        if (!agent) return;
        if (agent.walletAddress) return; // Already has wallet

        // Check persistent keystore for a saved wallet (survives DB rebuilds)
        const saved = getKeystoreEntry(agent.name);
        if (saved) {
            setAgentWallet(this.db, agentId, saved.address, saved.encryptedMnemonic);
            log.info(`Restored wallet from keystore for agent ${agent.name}`, { address: saved.address });

            // Check if the on-chain account still has funds
            try {
                const balance = await this.getBalance(saved.address);
                const fundedAlgo = balance / 1_000_000;
                if (fundedAlgo > 0) {
                    addAgentFunding(this.db, agentId, fundedAlgo);
                    log.info(`Agent ${agent.name} has existing balance: ${fundedAlgo} ALGO`);
                } else {
                    // Re-fund if the account has zero balance
                    await this.fundFromDispenser(saved.address, DEFAULT_FUND_ALGO * 1_000_000);
                    addAgentFunding(this.db, agentId, DEFAULT_FUND_ALGO);
                    log.info(`Re-funded agent ${agent.name} with ${DEFAULT_FUND_ALGO} ALGO`);
                }
                // Ensure key is published on-chain (may already exist)
                const chatAccount = await this.getAgentChatAccount(agentId);
                if (chatAccount) {
                    await this.publishKeyForAccount(chatAccount.account, agent.name);
                }
            } catch (err) {
                log.warn('Could not check/refill restored wallet balance', {
                    agentId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return;
        }

        try {
            const algochat = await import('@corvidlabs/ts-algochat');
            const generated = algochat.createRandomChatAccount();
            const encrypted = await encryptMnemonic(generated.mnemonic, this.config.mnemonic);

            setAgentWallet(this.db, agentId, generated.account.address, encrypted);
            saveKeystoreEntry(agent.name, generated.account.address, encrypted);
            log.info(`Created wallet for agent ${agent.name}`, { address: generated.account.address });

            // Fund from master via KMD dispenser
            await this.fundFromDispenser(generated.account.address, DEFAULT_FUND_ALGO * 1_000_000);
            addAgentFunding(this.db, agentId, DEFAULT_FUND_ALGO);
            log.info(`Funded agent ${agent.name} with ${DEFAULT_FUND_ALGO} ALGO`);

            // Publish encryption key on-chain so other agents can discover us
            await this.publishKeyForAccount(generated.account, agent.name);
        } catch (err) {
            log.error('Failed to create agent wallet', {
                agentId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Fund an agent's wallet with a specific amount of microAlgos from the master account.
     */
    async fundAgent(agentId: string, microAlgos: number): Promise<void> {
        const agent = getAgent(this.db, agentId);
        if (!agent?.walletAddress) return;

        try {
            await this.sendPayment(agent.walletAddress, microAlgos);
            addAgentFunding(this.db, agentId, microAlgos / 1_000_000);
            log.debug(`Funded agent ${agent.name}`, { microAlgos });
        } catch (err) {
            log.error('Failed to fund agent', {
                agentId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Retrieve the agent's ChatAccount by decrypting its stored mnemonic.
     */
    async getAgentChatAccount(agentId: string): Promise<AgentChatAccount | null> {
        const agent = getAgent(this.db, agentId);
        if (!agent?.walletAddress) return null;

        const encrypted = getAgentWalletMnemonic(this.db, agentId);
        if (!encrypted) return null;

        try {
            const mnemonic = await decryptMnemonic(encrypted, this.config.mnemonic);
            const algochat = await import('@corvidlabs/ts-algochat');
            const account = algochat.createChatAccountFromMnemonic(mnemonic);

            return { address: agent.walletAddress, account };
        } catch (err) {
            log.error('Failed to decrypt agent mnemonic', {
                agentId,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    /**
     * Query the agent wallet's current ALGO balance in microAlgos.
     */
    async getBalance(address: string): Promise<number> {
        try {
            const info = await this.service.algodClient.accountInformation(address).do();
            return Number(info.amount ?? 0);
        } catch (err) {
            log.error('Failed to get balance', {
                address,
                error: err instanceof Error ? err.message : String(err),
            });
            return 0;
        }
    }

    /**
     * Check if agent balance is below threshold and auto-refill (localnet only).
     */
    async checkAndRefill(agentId: string): Promise<void> {
        if (this.config.network !== 'localnet') return;

        const agent = getAgent(this.db, agentId);
        if (!agent?.walletAddress) return;

        const balance = await this.getBalance(agent.walletAddress);
        if (balance < REFILL_THRESHOLD_MICRO) {
            log.info(`Auto-refilling agent ${agent.name}`, { balance, threshold: REFILL_THRESHOLD_MICRO });
            await this.fundAgent(agentId, REFILL_AMOUNT_MICRO);
        }
    }

    /**
     * Publish encryption keys for all existing agents that have wallets.
     * Called at startup to ensure keys are discoverable on localnet.
     */
    async publishAllKeys(): Promise<void> {
        if (this.config.network !== 'localnet') return;

        const agents = listAgents(this.db);
        for (const agent of agents) {
            if (!agent.walletAddress) continue;
            const chatAccount = await this.getAgentChatAccount(agent.id);
            if (chatAccount) {
                await this.publishKeyForAccount(chatAccount.account, agent.name);
            }
        }
    }

    /** Publish an agent's encryption key on-chain so other agents can discover it. */
    private async publishKeyForAccount(
        chatAccount: import('@corvidlabs/ts-algochat').ChatAccount,
        agentName: string,
    ): Promise<void> {
        try {
            const txid = await this.service.algorandService.publishKey(chatAccount);
            log.info(`Published encryption key for ${agentName}`, { txid, address: chatAccount.address });
        } catch (err) {
            log.warn(`Failed to publish key for ${agentName} (may already exist)`, {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private async sendPayment(toAddress: string, microAlgos: number): Promise<void> {
        const algosdk = (await import('algosdk')).default;
        const params = await this.service.algodClient.getTransactionParams().do();

        // Use the master chat account to sign the payment
        const masterAddress = this.service.chatAccount.address;
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: masterAddress,
            receiver: toAddress,
            amount: microAlgos,
            suggestedParams: params,
        });

        // Sign with master account's secret key
        const signedTxn = txn.signTxn(this.service.chatAccount.account.sk);
        await this.service.algodClient.sendRawTransaction(signedTxn).do();
    }

    private async fundFromDispenser(address: string, microAlgos: number): Promise<void> {
        const algosdk = (await import('algosdk')).default;
        const kmdToken = 'a'.repeat(64);
        const kmdServer = 'http://localhost';
        const kmdPort = 4002;

        const kmd = new algosdk.Kmd(kmdToken, kmdServer, kmdPort);
        const wallets = await kmd.listWallets();
        const defaultWallet = wallets.wallets.find(
            (w: { name: string }) => w.name === 'unencrypted-default-wallet',
        );

        if (!defaultWallet) {
            throw new Error('LocalNet default wallet not found');
        }

        const walletHandle = (await kmd.initWalletHandle(defaultWallet.id, '')).wallet_handle_token;

        try {
            const keys = await kmd.listKeys(walletHandle);
            const dispenserAddress = keys.addresses[0];
            if (!dispenserAddress) throw new Error('No accounts in LocalNet default wallet');

            const keyResponse = await kmd.exportKey(walletHandle, '', dispenserAddress);
            const dispenserAccount = algosdk.mnemonicToSecretKey(
                algosdk.secretKeyToMnemonic(keyResponse.private_key),
            );

            const params = await this.service.algodClient.getTransactionParams().do();
            const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                sender: dispenserAddress,
                receiver: address,
                amount: microAlgos,
                suggestedParams: params,
            });

            const signedTxn = txn.signTxn(dispenserAccount.sk);
            await this.service.algodClient.sendRawTransaction(signedTxn).do();
        } finally {
            await kmd.releaseWalletHandle(walletHandle);
        }
    }
}
