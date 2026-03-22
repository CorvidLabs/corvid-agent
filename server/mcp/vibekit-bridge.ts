/**
 * VibeKit MCP Bridge.
 *
 * Provides a pre-configured bridge to the VibeKit MCP server for Algorand
 * smart contract operations. This module builds an McpServerConfig that
 * can be passed to ExternalMcpClientManager.connectAll() alongside other
 * external MCP servers.
 *
 * VibeKit is optional — if not installed, the bridge returns null and the
 * agent operates without blockchain tools.
 */

import type { McpServerConfig } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('VibeKitBridge');

/** Environment variables relevant to VibeKit configuration. */
export interface VibeKitEnvConfig {
    /** Algorand network: localnet, testnet, or mainnet. Defaults to testnet. */
    network?: 'localnet' | 'testnet' | 'mainnet';
    /** Custom Algod URL (overrides the default for the selected network). */
    algodUrl?: string;
    /** Custom Algod token. */
    algodToken?: string;
    /** Custom Indexer URL. */
    indexerUrl?: string;
    /** Custom Indexer token. */
    indexerToken?: string;
}

/**
 * Build an McpServerConfig for the VibeKit MCP server.
 *
 * Returns null if VibeKit is not available (command not found).
 * The returned config can be merged into the externalMcpConfigs array
 * passed to DirectProcess or ExternalMcpClientManager.
 */
export function buildVibeKitConfig(
    agentId: string | null,
    envConfig?: VibeKitEnvConfig,
): McpServerConfig {
    const network = envConfig?.network
        ?? (process.env.VIBEKIT_NETWORK as 'localnet' | 'testnet' | 'mainnet' | undefined)
        ?? (process.env.ALGORAND_NETWORK as 'localnet' | 'testnet' | 'mainnet' | undefined)
        ?? 'testnet';

    const envVars: Record<string, string> = {
        ALGORAND_NETWORK: network,
    };

    if (envConfig?.algodUrl ?? process.env.VIBEKIT_ALGOD_URL) {
        envVars.ALGOD_SERVER = envConfig?.algodUrl ?? process.env.VIBEKIT_ALGOD_URL!;
    }
    if (envConfig?.algodToken ?? process.env.VIBEKIT_ALGOD_TOKEN) {
        envVars.ALGOD_TOKEN = envConfig?.algodToken ?? process.env.VIBEKIT_ALGOD_TOKEN!;
    }
    if (envConfig?.indexerUrl ?? process.env.VIBEKIT_INDEXER_URL) {
        envVars.INDEXER_SERVER = envConfig?.indexerUrl ?? process.env.VIBEKIT_INDEXER_URL!;
    }
    if (envConfig?.indexerToken ?? process.env.VIBEKIT_INDEXER_TOKEN) {
        envVars.INDEXER_TOKEN = envConfig?.indexerToken ?? process.env.VIBEKIT_INDEXER_TOKEN!;
    }

    return {
        id: `vibekit-${agentId ?? 'global'}`,
        agentId,
        name: 'vibekit',
        command: 'vibekit',
        args: ['mcp'],
        envVars,
        cwd: null,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Check whether the VibeKit CLI is available on the system.
 * Returns the version string if found, or null if not installed.
 */
export async function detectVibeKit(): Promise<string | null> {
    try {
        const proc = Bun.spawn(['vibekit', '--version'], {
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const exitCode = await proc.exited;
        if (exitCode !== 0) return null;

        const version = (await new Response(proc.stdout).text()).trim();
        log.info('VibeKit detected', { version });
        return version;
    } catch {
        return null;
    }
}

/**
 * Build the VibeKit MCP config only if VibeKit is installed.
 * Returns null when VibeKit is not available, allowing graceful degradation.
 */
export async function buildVibeKitConfigIfAvailable(
    agentId: string | null,
    envConfig?: VibeKitEnvConfig,
): Promise<McpServerConfig | null> {
    const version = await detectVibeKit();
    if (!version) {
        log.info('VibeKit not installed — smart contract tools unavailable');
        return null;
    }

    return buildVibeKitConfig(agentId, envConfig);
}

/**
 * Well-known VibeKit tool categories for documentation and filtering.
 * These match the tools exposed by `vibekit mcp`.
 */
export const VIBEKIT_TOOL_CATEGORIES = {
    contracts: ['appDeploy', 'appCall', 'appListMethods', 'appGetInfo', 'appOptIn', 'appCloseOut', 'appDelete'],
    assets: ['createAsset', 'getAssetInfo', 'assetOptIn', 'assetTransfer', 'assetOptOut', 'assetFreeze', 'assetConfig', 'assetDestroy'],
    accounts: ['listAccounts', 'getAccountInfo', 'createAccount', 'fundAccount', 'sendPayment'],
    state: ['readGlobalState', 'readLocalState', 'readBox'],
    indexer: ['lookupTransaction', 'searchTransactions', 'lookupApplication', 'lookupApplicationLogs', 'lookupAsset'],
    transactions: ['sendGroupTransactions', 'simulateTransactions'],
    utilities: ['getApplicationAddress', 'validateAddress', 'algoToMicroalgo', 'microalgoToAlgo', 'calculateMinBalance', 'switchNetwork', 'getNetwork'],
} as const;

/** Flat list of all known VibeKit tool names (before namespace prefixing). */
export const ALL_VIBEKIT_TOOLS: readonly string[] = Object.values(VIBEKIT_TOOL_CATEGORIES).flat();
