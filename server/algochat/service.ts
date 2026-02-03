import type { AlgoChatConfig } from './config';
import { createLogger } from '../lib/logger';

const log = createLogger('AlgoChat');

// Re-export types used by other modules
export interface AlgoChatService {
    algorandService: import('@corvidlabs/ts-algochat').AlgorandService;
    chatAccount: import('@corvidlabs/ts-algochat').ChatAccount;
    syncManager: import('@corvidlabs/ts-algochat').SyncManager;
    /** Raw algod client for submitting transactions */
    algodClient: import('algosdk').default.Algodv2;
    /** Raw indexer client for querying transactions (null if no indexer configured) */
    indexerClient: import('algosdk').default.Indexer | null;
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

        log.info(`Funded ${address} with 100 ALGO from LocalNet dispenser`);
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
        log.info('Disabled');
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
                log.info('LocalNet not available — run `algokit localnet start`');
                return null;
            }
        }

        const serviceConfig = parseNetworkPreset(networkPreset);
        const algorandService = new algochat.AlgorandService(serviceConfig);

        // Create raw SDK clients for PSK manager direct access
        const algosdk = (await import('algosdk')).default;
        const algodClient = new algosdk.Algodv2(
            serviceConfig.algodToken,
            serviceConfig.algodServer,
            serviceConfig.algodPort ?? '',
        );
        const indexerClient = serviceConfig.indexerServer
            ? new algosdk.Indexer(
                  serviceConfig.indexerToken,
                  serviceConfig.indexerServer,
                  serviceConfig.indexerPort ?? '',
              )
            : null;

        // Create or restore chat account
        let chatAccount: import('@corvidlabs/ts-algochat').ChatAccount;

        if (config.mnemonic) {
            chatAccount = algochat.createChatAccountFromMnemonic(config.mnemonic);
            log.info(`Restored account from mnemonic`, { address: chatAccount.address });

            // On localnet, ensure the restored account is funded
            if (config.network === 'localnet') {
                try {
                    const info = await algodClient.accountInformation(chatAccount.address).do();
                    if (Number(info.amount ?? 0) === 0) {
                        await fundFromLocalNetDispenser(algodClient, chatAccount.address);
                    }
                } catch {
                    // Best-effort funding; key publish will fail if unfunded
                }
            }
        } else if (config.network === 'localnet') {
            const generated = algochat.createRandomChatAccount();
            chatAccount = generated.account;
            log.info(`Generated new account`, { address: chatAccount.address });
            log.info(`Mnemonic (save to persist): ${generated.mnemonic}`);

            // Fund from LocalNet dispenser
            await fundFromLocalNetDispenser(algodClient, chatAccount.address);
        } else {
            log.info('No mnemonic and not on localnet — cannot initialize');
            return null;
        }

        // Publish encryption key so other accounts can discover us
        try {
            const txid = await algorandService.publishKey(chatAccount);
            log.info(`Published encryption key`, { txid });
        } catch (err) {
            log.warn('Failed to publish key (may already exist)', { error: err instanceof Error ? err.message : String(err) });
        }

        // Create SyncManager
        const queue = new algochat.SendQueue();
        const syncManager = new algochat.SyncManager(algorandService, chatAccount, queue, {
            syncInterval: config.syncInterval,
            processQueue: true,
        });

        log.info(`Initialized on ${config.network}`, { address: chatAccount.address });

        return { algorandService, chatAccount, syncManager, algodClient, indexerClient };
    } catch (err) {
        log.error('Failed to initialize', { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}
