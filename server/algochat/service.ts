import type { AlgoChatConfig } from './config';

// Re-export types used by other modules
export interface AlgoChatService {
    algorandService: import('@corvidlabs/ts-algochat').AlgorandService;
    chatAccount: import('@corvidlabs/ts-algochat').ChatAccount;
    syncManager: import('@corvidlabs/ts-algochat').SyncManager;
}

/**
 * Convert a URL-based network preset (BlockchainConfig) to the server/port
 * format that AlgorandService expects (AlgorandConfig).
 */
function parseNetworkPreset(preset: { algodUrl: string; algodToken: string; indexerUrl?: string; indexerToken?: string }) {
    const algodUrl = new URL(preset.algodUrl);
    const indexerUrl = preset.indexerUrl ? new URL(preset.indexerUrl) : null;

    // algosdk expects the base URL without port as "server", and port separately.
    // When no explicit port in the URL, pass '' so algosdk doesn't default to 8080.
    const algodPort = algodUrl.port ? parseInt(algodUrl.port, 10) : undefined;
    const indexerPort = indexerUrl?.port ? parseInt(indexerUrl.port, 10) : undefined;

    return {
        algodToken: preset.algodToken,
        algodServer: `${algodUrl.protocol}//${algodUrl.hostname}`,
        algodPort,
        indexerToken: preset.indexerToken ?? '',
        indexerServer: indexerUrl ? `${indexerUrl.protocol}//${indexerUrl.hostname}` : '',
        indexerPort,
    };
}

/** Fund a new account from LocalNet's default dispenser via KMD. */
async function fundFromLocalNetDispenser(
    algodClient: unknown,
    address: string,
): Promise<void> {
    // LocalNet KMD defaults
    const kmdToken = 'a'.repeat(64);
    const kmdServer = 'http://localhost';
    const kmdPort = 4002;

    const algosdk = (await import('algosdk')).default;

    const kmd = new algosdk.Kmd(kmdToken, kmdServer, kmdPort);

    // Get the default wallet (unencrypted-default-wallet)
    const wallets = await kmd.listWallets();
    const defaultWallet = wallets.wallets.find(
        (w: { name: string }) => w.name === 'unencrypted-default-wallet',
    );

    if (!defaultWallet) {
        throw new Error('LocalNet default wallet not found — is AlgoKit LocalNet running?');
    }

    const walletHandle = (await kmd.initWalletHandle(defaultWallet.id, '')).wallet_handle_token;

    try {
        const keys = await kmd.listKeys(walletHandle);
        const dispenserAddress = keys.addresses[0];

        if (!dispenserAddress) {
            throw new Error('No accounts in LocalNet default wallet');
        }

        // Export dispenser's private key to sign the funding transaction
        const keyResponse = await kmd.exportKey(walletHandle, '', dispenserAddress);
        const dispenserAccount = algosdk.mnemonicToSecretKey(
            algosdk.secretKeyToMnemonic(keyResponse.private_key),
        );

        // Fund with 100 ALGO (100_000_000 microAlgos)
        const params = await (algodClient as InstanceType<typeof algosdk.Algodv2>).getTransactionParams().do();
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: dispenserAddress,
            receiver: address,
            amount: 100_000_000,
            suggestedParams: params,
        });

        const signedTxn = txn.signTxn(dispenserAccount.sk);
        await (algodClient as InstanceType<typeof algosdk.Algodv2>).sendRawTransaction(signedTxn).do();

        console.log(`[AlgoChat] Funded ${address} with 100 ALGO from LocalNet dispenser`);
    } finally {
        await kmd.releaseWalletHandle(walletHandle);
    }
}

/** Check if LocalNet is reachable by hitting the algod health endpoint. */
async function isLocalNetAvailable(): Promise<boolean> {
    try {
        const response = await fetch('http://localhost:4001/v2/status', {
            headers: { 'X-Algo-API-Token': 'a'.repeat(64) },
            signal: AbortSignal.timeout(2000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function initAlgoChatService(config: AlgoChatConfig): Promise<AlgoChatService | null> {
    if (!config.enabled) {
        console.log('[AlgoChat] Disabled');
        return null;
    }

    try {
        const algochat = await import('@corvidlabs/ts-algochat');

        // Determine network config
        let networkPreset: { algodUrl: string; algodToken: string; indexerUrl?: string; indexerToken?: string };

        switch (config.network) {
            case 'localnet':
                networkPreset = algochat.localnet();
                break;
            case 'testnet':
                networkPreset = algochat.testnet();
                break;
            case 'mainnet':
                networkPreset = algochat.mainnet();
                break;
        }

        // For localnet, verify it's actually running
        if (config.network === 'localnet') {
            const available = await isLocalNetAvailable();
            if (!available) {
                console.log('[AlgoChat] LocalNet not available — run `algokit localnet start`');
                return null;
            }
        }

        const serviceConfig = parseNetworkPreset(networkPreset);
        const algorandService = new algochat.AlgorandService(serviceConfig);

        // Create or restore chat account
        let chatAccount: import('@corvidlabs/ts-algochat').ChatAccount;

        if (config.mnemonic) {
            chatAccount = algochat.createChatAccountFromMnemonic(config.mnemonic);
            console.log(`[AlgoChat] Restored account from mnemonic: ${chatAccount.address}`);
        } else if (config.network === 'localnet') {
            const generated = algochat.createRandomChatAccount();
            chatAccount = generated.account;
            console.log(`[AlgoChat] Generated new account: ${chatAccount.address}`);
            console.log(`[AlgoChat] Mnemonic (save to persist): ${generated.mnemonic}`);

            // Fund from LocalNet dispenser
            const algosdk = (await import('algosdk')).default;
            const algodClient = new algosdk.Algodv2(
                serviceConfig.algodToken,
                serviceConfig.algodServer,
                serviceConfig.algodPort ?? '',
            );

            await fundFromLocalNetDispenser(algodClient, chatAccount.address);
        } else {
            console.log('[AlgoChat] No mnemonic and not on localnet — cannot initialize');
            return null;
        }

        // Publish encryption key so other accounts can discover us
        try {
            const txid = await algorandService.publishKey(chatAccount);
            console.log(`[AlgoChat] Published encryption key, txid: ${txid}`);
        } catch (err) {
            console.warn('[AlgoChat] Failed to publish key (may already exist):', err);
        }

        // Create SyncManager
        const queue = new algochat.SendQueue();
        const syncManager = new algochat.SyncManager(algorandService, chatAccount, queue, {
            syncInterval: config.syncInterval,
            processQueue: true,
        });

        console.log(`[AlgoChat] Initialized on ${config.network} — address: ${chatAccount.address}`);

        return { algorandService, chatAccount, syncManager };
    } catch (err) {
        console.error('[AlgoChat] Failed to initialize:', err);
        return null;
    }
}
