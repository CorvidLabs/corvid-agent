import type { Database } from 'bun:sqlite';
import type { AlgoChatConfig } from './config';
import type { AlgoChatService } from './service';
import type { KeyProvider } from '../lib/key-provider';
import { fundFromTestnetFaucet } from './service';
import { getAgent, setAgentWallet, getAgentWalletMnemonic, addAgentFunding, listAgents } from '../db/agents';
import { encryptMnemonic, decryptMnemonic, encryptMnemonicWithPassphrase, decryptMnemonicWithPassphrase } from '../lib/crypto';
import { getKeystoreEntry, saveKeystoreEntry } from '../lib/wallet-keystore';
import { wipeBuffer } from '../lib/secure-wipe';
import { createLogger } from '../lib/logger';
import { NotFoundError } from '../lib/errors';

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
    private keyProvider: KeyProvider | null;

    constructor(db: Database, config: AlgoChatConfig, service: AlgoChatService, keyProvider?: KeyProvider) {
        this.db = db;
        this.config = config;
        this.service = service;
        this.keyProvider = keyProvider ?? null;
    }

    /**
     * Encrypt a mnemonic using the KeyProvider if available, otherwise fall back
     * to the legacy config-based passphrase resolution.
     */
    private async encryptMnemonicInternal(plaintext: string): Promise<string> {
        if (this.keyProvider) {
            const passphrase = await this.keyProvider.getEncryptionPassphrase();
            return encryptMnemonicWithPassphrase(plaintext, passphrase);
        }
        return encryptMnemonic(plaintext, this.config.mnemonic, this.config.network);
    }

    /**
     * Decrypt a mnemonic using the KeyProvider if available, otherwise fall back
     * to the legacy config-based passphrase resolution.
     */
    private async decryptMnemonicInternal(encrypted: string): Promise<string> {
        if (this.keyProvider) {
            const passphrase = await this.keyProvider.getEncryptionPassphrase();
            return decryptMnemonicWithPassphrase(encrypted, passphrase);
        }
        return decryptMnemonic(encrypted, this.config.mnemonic, this.config.network);
    }

    /**
     * Ensure the agent has a wallet. On localnet/testnet with no existing wallet,
     * check the persistent keystore first (survives DB rebuilds), then
     * auto-create and fund. On mainnet this is a no-op (wallets must be funded manually).
     */
    async ensureWallet(agentId: string): Promise<void> {
        if (this.config.network === 'mainnet') return;

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
                    await this.fundWallet(saved.address, DEFAULT_FUND_ALGO * 1_000_000);
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
            const encrypted = await this.encryptMnemonicInternal(generated.mnemonic);

            setAgentWallet(this.db, agentId, generated.account.address, encrypted);
            saveKeystoreEntry(agent.name, generated.account.address, encrypted);
            log.info(`Created wallet for agent ${agent.name}`, { address: generated.account.address });

            // Fund from appropriate dispenser (KMD on localnet, faucet on testnet)
            await this.fundWallet(generated.account.address, DEFAULT_FUND_ALGO * 1_000_000);
            addAgentFunding(this.db, agentId, DEFAULT_FUND_ALGO);
            log.info(`Funded agent ${agent.name} with ${DEFAULT_FUND_ALGO} ALGO`);

            // Publish encryption key on-chain so other agents can discover us
            await this.publishKeyForAccount(generated.account, agent.name);

            // Opt into USDC ASA if configured
            await this.ensureUsdcOptIn(agentId);
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
            const mnemonic = await this.decryptMnemonicInternal(encrypted);
            const algochat = await import('@corvidlabs/ts-algochat');
            const account = algochat.createChatAccountFromMnemonic(mnemonic);

            return { address: agent.walletAddress, account };
        } catch (err) {
            log.error('Failed to decrypt agent mnemonic', {
                agentId,
                error: err instanceof Error ? err.message : String(err),
            });

            // On localnet/testnet, re-create the wallet if decryption fails
            // (wallet was encrypted with a different key)
            if (this.config.network !== 'mainnet') {
                log.info(`Re-creating wallet for agent ${agentId} on ${this.config.network}`);
                try {
                    return await this.recreateWallet(agentId);
                } catch (recreateErr) {
                    log.error('Failed to re-create agent wallet', {
                        agentId,
                        error: recreateErr instanceof Error ? recreateErr.message : String(recreateErr),
                    });
                }
            }
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
     * Check if agent balance is below threshold and auto-refill (localnet/testnet).
     */
    async checkAndRefill(agentId: string): Promise<void> {
        if (this.config.network === 'mainnet') return;

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
        if (this.config.network === 'mainnet') return;

        const agents = listAgents(this.db);
        for (const agent of agents) {
            if (!agent.walletAddress) continue;
            await this.checkAndRefill(agent.id);
            const chatAccount = await this.getAgentChatAccount(agent.id);
            if (chatAccount) {
                await this.publishKeyForAccount(chatAccount.account, agent.name);
            }
        }
    }

    /**
     * Ensure an agent's wallet is opted into the USDC ASA.
     * Required for receiving USDC on Algorand (ASAs require opt-in).
     * No-op if USDC_ASA_ID is not configured.
     */
    async ensureUsdcOptIn(agentId: string): Promise<void> {
        const asaId = parseInt(process.env.USDC_ASA_ID ?? '', 10);
        if (!Number.isFinite(asaId) || asaId <= 0) {
            // On mainnet, use the well-known USDC ASA ID
            const network = process.env.ALGORAND_NETWORK ?? 'localnet';
            if (network !== 'mainnet') return;
            return this.optInToAsa(agentId, 31566704);
        }
        return this.optInToAsa(agentId, asaId);
    }

    /**
     * Opt an agent's wallet into a specific ASA.
     * An ASA opt-in is a zero-amount asset transfer to oneself.
     */
    private async optInToAsa(agentId: string, asaId: number): Promise<void> {
        const chatAccount = await this.getAgentChatAccount(agentId);
        if (!chatAccount) return;

        try {
            // Check if already opted in by querying account assets
            const info = await this.service.algodClient.accountInformation(chatAccount.address).do();
            const assets = (info as unknown as { assets?: { 'asset-id': number }[] }).assets ?? [];
            if (assets.some((a) => a['asset-id'] === asaId)) {
                return; // Already opted in
            }

            const algosdk = (await import('algosdk')).default;
            const params = await this.service.algodClient.getTransactionParams().do();
            const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                sender: chatAccount.address,
                receiver: chatAccount.address,
                amount: 0,
                assetIndex: asaId,
                suggestedParams: params,
            });

            const signedTxn = txn.signTxn(chatAccount.account.account.sk);
            await this.service.algodClient.sendRawTransaction(signedTxn).do();

            const agent = getAgent(this.db, agentId);
            log.info(`Agent ${agent?.name ?? agentId} opted into ASA ${asaId}`);
        } catch (err) {
            log.warn(`Failed to opt agent into ASA ${asaId}`, {
                agentId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Ensure all existing agents with wallets are opted into USDC.
     * Called at startup alongside publishAllKeys.
     */
    async ensureAllUsdcOptIns(): Promise<void> {
        const asaId = parseInt(process.env.USDC_ASA_ID ?? '', 10);
        const network = process.env.ALGORAND_NETWORK ?? 'localnet';
        if (!Number.isFinite(asaId) && network !== 'mainnet') return;

        const agents = listAgents(this.db);
        for (const agent of agents) {
            if (!agent.walletAddress) continue;
            await this.ensureUsdcOptIn(agent.id);
        }
    }

    /**
     * Re-create an agent wallet on localnet/testnet when the existing encrypted
     * mnemonic can't be decrypted (encrypted with a different key).
     * Generates a new wallet, funds it, publishes the key, and returns the account.
     */
    private async recreateWallet(agentId: string): Promise<AgentChatAccount | null> {
        const agent = getAgent(this.db, agentId);
        if (!agent) return null;

        const algochat = await import('@corvidlabs/ts-algochat');
        const generated = algochat.createRandomChatAccount();
        const encrypted = await this.encryptMnemonicInternal(generated.mnemonic);

        setAgentWallet(this.db, agentId, generated.account.address, encrypted);
        saveKeystoreEntry(agent.name, generated.account.address, encrypted);
        log.info(`Re-created wallet for agent ${agent.name}`, { address: generated.account.address });

        await this.fundWallet(generated.account.address, DEFAULT_FUND_ALGO * 1_000_000);
        addAgentFunding(this.db, agentId, DEFAULT_FUND_ALGO);
        log.info(`Funded agent ${agent.name} with ${DEFAULT_FUND_ALGO} ALGO`);

        await this.publishKeyForAccount(generated.account, agent.name);

        return { address: generated.account.address, account: generated.account };
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
        try {
            await this.service.algodClient.sendRawTransaction(signedTxn).do();
        } finally {
            // Wipe signed transaction bytes
            wipeBuffer(signedTxn);
        }
    }

    /**
     * Fund a wallet using the appropriate mechanism for the current network.
     * LocalNet uses KMD dispenser; testnet uses the public faucet API.
     */
    private async fundWallet(address: string, microAlgos: number): Promise<void> {
        if (this.config.network === 'testnet') {
            await fundFromTestnetFaucet(address);
            return;
        }
        await this.fundFromLocalNetDispenser(address, microAlgos);
    }

    private async fundFromLocalNetDispenser(address: string, microAlgos: number): Promise<void> {
        const algosdk = (await import('algosdk')).default;
        const kmdToken = 'a'.repeat(64);
        const kmdUrl = process.env.LOCALNET_KMD_URL ?? 'http://localhost:4002';
        const parsed = new URL(kmdUrl);

        const kmd = new algosdk.Kmd(kmdToken, `${parsed.protocol}//${parsed.hostname}`, parseInt(parsed.port || '4002'));
        const wallets = await kmd.listWallets();
        const defaultWallet = wallets.wallets.find(
            (w: { name: string }) => w.name === 'unencrypted-default-wallet',
        );

        if (!defaultWallet) {
            throw new NotFoundError('LocalNet default wallet');
        }

        const walletHandle = (await kmd.initWalletHandle(defaultWallet.id, '')).wallet_handle_token;

        try {
            const keys = await kmd.listKeys(walletHandle);
            const dispenserAddress = keys.addresses[0];
            if (!dispenserAddress) throw new NotFoundError('LocalNet default wallet accounts');

            const keyResponse = await kmd.exportKey(walletHandle, '', dispenserAddress);
            const dispenserAccount = algosdk.mnemonicToSecretKey(
                algosdk.secretKeyToMnemonic(keyResponse.private_key),
            );

            try {
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
                // Wipe dispenser secret key after signing
                wipeBuffer(dispenserAccount.sk);
                if (keyResponse.private_key instanceof Uint8Array) {
                    wipeBuffer(keyResponse.private_key);
                }
            }
        } finally {
            await kmd.releaseWalletHandle(walletHandle);
        }
    }
}
