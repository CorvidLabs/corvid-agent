import type { AlgoChatNetwork } from '../../shared/types';

export interface AlgoChatConfig {
    mnemonic: string | null;
    network: AlgoChatNetwork;
    syncInterval: number;
    defaultAgentId: string | null;
    enabled: boolean;
}

export function loadAlgoChatConfig(): AlgoChatConfig {
    const mnemonic = process.env.ALGOCHAT_MNEMONIC ?? null;
    const rawNetwork = (process.env.ALGORAND_NETWORK ?? 'testnet') as AlgoChatNetwork;
    const syncInterval = parseInt(process.env.ALGOCHAT_SYNC_INTERVAL ?? '30000', 10);
    const defaultAgentId = process.env.ALGOCHAT_DEFAULT_AGENT_ID ?? null;
    const hasMnemonic = mnemonic !== null && mnemonic.trim().length > 0;

    // When no mnemonic and not explicitly on mainnet, default to localnet
    const network: AlgoChatNetwork = hasMnemonic ? rawNetwork : (rawNetwork === 'mainnet' ? 'mainnet' : 'localnet');

    return {
        mnemonic: hasMnemonic ? mnemonic.trim() : null,
        network,
        syncInterval: isNaN(syncInterval) ? 30000 : syncInterval,
        defaultAgentId: defaultAgentId && defaultAgentId.trim().length > 0 ? defaultAgentId.trim() : null,
        // Enabled if mnemonic is provided, or if we can try localnet
        enabled: hasMnemonic || network === 'localnet',
    };
}
