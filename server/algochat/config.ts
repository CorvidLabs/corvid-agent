import type { AlgoChatNetwork } from '../../shared/types';
import { isValidAddress } from 'algosdk';
import { createLogger } from '../lib/logger';

const log = createLogger('AlgoChatConfig');

export interface PSKContactConfig {
    address: string;
    psk: Uint8Array;
    label?: string;
}

export interface AlgoChatConfig {
    mnemonic: string | null;
    network: AlgoChatNetwork;
    agentNetwork: AlgoChatNetwork;
    syncInterval: number;
    defaultAgentId: string | null;
    enabled: boolean;
    pskContact: PSKContactConfig | null;
    /** Algorand addresses authorized to run privileged commands (/stop, /approve, /deny, /mode, /work). */
    ownerAddresses: Set<string>;
}

export function loadAlgoChatConfig(): AlgoChatConfig {
    const mnemonic = process.env.ALGOCHAT_MNEMONIC ?? null;
    const rawNetwork = (process.env.ALGORAND_NETWORK ?? 'testnet') as AlgoChatNetwork;
    const rawAgentNetwork = (process.env.AGENT_NETWORK ?? 'localnet') as AlgoChatNetwork;
    const syncInterval = parseInt(process.env.ALGOCHAT_SYNC_INTERVAL ?? '30000', 10);
    const defaultAgentId = process.env.ALGOCHAT_DEFAULT_AGENT_ID ?? null;
    const hasMnemonic = mnemonic !== null && mnemonic.trim().length > 0;

    // When no mnemonic and not explicitly on mainnet, default to localnet
    const network: AlgoChatNetwork = hasMnemonic ? rawNetwork : (rawNetwork === 'mainnet' ? 'mainnet' : 'localnet');
    const agentNetwork: AlgoChatNetwork = rawAgentNetwork;

    // Parse PSK exchange URI if provided
    const pskContact = parsePSKContactFromEnv();

    // Parse owner addresses (comma-separated Algorand addresses)
    const ownerAddresses = parseOwnerAddresses(network);

    return {
        mnemonic: hasMnemonic ? mnemonic.trim() : null,
        network,
        agentNetwork,
        syncInterval: isNaN(syncInterval) ? 30000 : syncInterval,
        defaultAgentId: defaultAgentId && defaultAgentId.trim().length > 0 ? defaultAgentId.trim() : null,
        // Enabled if mnemonic is provided, or if we can try localnet
        enabled: hasMnemonic || network === 'localnet',
        pskContact,
        ownerAddresses,
    };
}

/** Exported for testing. */
export function parseOwnerAddresses(network: AlgoChatNetwork): Set<string> {
    const raw = process.env.ALGOCHAT_OWNER_ADDRESSES ?? '';
    const addresses = new Set<string>();
    for (const addr of raw.split(',')) {
        const trimmed = addr.trim();
        if (trimmed.length === 0) continue;

        // Normalize to uppercase for case-insensitive matching
        const normalized = trimmed.toUpperCase();

        if (!isValidAddress(normalized)) {
            log.error(`Invalid owner address skipped (failed Algorand address checksum validation): "${trimmed}"`);
            continue;
        }
        addresses.add(normalized);
    }
    if (addresses.size > 0) {
        log.info(`Owner addresses configured: ${addresses.size}`);
    } else if (network === 'mainnet') {
        log.error('FATAL: No valid ALGOCHAT_OWNER_ADDRESSES on mainnet — refusing to start with open privileged commands');
        process.exit(1);
    } else {
        log.warn(`No ALGOCHAT_OWNER_ADDRESSES set on ${network} — privileged commands (/stop, /approve, /deny, /mode, /work, /agent, /council) are disabled`);
    }
    return addresses;
}

function parsePSKContactFromEnv(): PSKContactConfig | null {
    const uri = process.env.ALGOCHAT_PSK_URI;
    if (!uri || uri.trim().length === 0) return null;

    try {
        // Dynamic import not possible in sync context — parse manually.
        // URI format: algochat-psk://v1?addr=ADDRESS&psk=BASE64URL_PSK&label=LABEL
        const url = new URL(uri.trim());
        const address = url.searchParams.get('addr');
        const pskBase64 = url.searchParams.get('psk');
        const label = url.searchParams.get('label') ?? undefined;

        if (!address || !pskBase64) {
            log.warn('ALGOCHAT_PSK_URI missing addr or psk parameter');
            return null;
        }

        // Decode base64url PSK
        const psk = Uint8Array.from(atob(pskBase64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        if (psk.length !== 32) {
            log.warn(`ALGOCHAT_PSK_URI psk must be 32 bytes, got ${psk.length}`);
            return null;
        }

        log.info(`PSK contact configured: ${label ?? address.slice(0, 8)}...`);
        return { address, psk, label };
    } catch (err) {
        log.warn('Failed to parse ALGOCHAT_PSK_URI', { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}
