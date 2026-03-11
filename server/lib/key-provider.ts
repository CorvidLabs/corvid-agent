/**
 * KeyProvider — abstraction layer for wallet encryption key management.
 *
 * Decouples key retrieval from the env var, enabling future integrations
 * with AWS Secrets Manager, HashiCorp Vault, or similar KMS backends.
 *
 * Phase 1: EnvKeyProvider (wraps existing WALLET_ENCRYPTION_KEY env var logic).
 * Phase 2: VaultKeyProvider, AwsSecretsKeyProvider, etc.
 *
 * Production enforcement (#923):
 * On mainnet, EnvKeyProvider (plaintext env-var source) is rejected by default.
 * Set ALLOW_PLAINTEXT_KEYS=true to explicitly opt in. This ensures operators
 * acknowledge the risk of keeping the encryption passphrase in a process
 * environment variable on production infrastructure.
 *
 * assertProductionReady() validates the KeyProvider is configured
 * with a strong passphrase (>= 32 chars) on testnet/mainnet, and rejects
 * plaintext key sources (default localnet key, server mnemonic fallback)
 * on non-localnet networks.
 */

import { getEncryptionPassphrase } from './crypto';
import { createLogger } from './logger';

const log = createLogger('KeyProvider');

/** Minimum passphrase length for production networks (testnet/mainnet). */
const MIN_PRODUCTION_KEY_LENGTH = 32;

/**
 * Interface for resolving the wallet encryption passphrase.
 *
 * Implementations must return the passphrase used to encrypt/decrypt
 * wallet mnemonics (AES-256-GCM via PBKDF2). The passphrase is the
 * single secret protecting all agent wallet keys at rest.
 */
export interface KeyProvider {
    /** Retrieve the encryption passphrase for wallet mnemonic encryption/decryption. */
    getEncryptionPassphrase(): Promise<string>;

    /** Clean up any cached key material or connections. */
    dispose(): void;

    /** Human-readable name of this provider type (for audit logging). */
    readonly providerType: string;
}

/**
 * Default KeyProvider that resolves the passphrase from environment variables.
 *
 * Delegates to the existing getEncryptionPassphrase() logic in crypto.ts:
 * - Uses WALLET_ENCRYPTION_KEY env var if set
 * - Falls back to server mnemonic on localnet
 * - Falls back to default key on localnet (with warning)
 * - Throws on testnet/mainnet if no key is configured
 */
export class EnvKeyProvider implements KeyProvider {
    readonly providerType = 'env';
    private network: string;
    private serverMnemonic: string | null;

    constructor(network?: string, serverMnemonic?: string | null) {
        this.network = network ?? 'localnet';
        this.serverMnemonic = serverMnemonic ?? null;
    }

    async getEncryptionPassphrase(): Promise<string> {
        return getEncryptionPassphrase(this.network, this.serverMnemonic);
    }

    getNetwork(): string {
        return this.network;
    }

    dispose(): void {
        // No-op for env-based provider — no cached secrets to clean up
    }
}

/**
 * Create a KeyProvider based on configuration.
 *
 * On mainnet, EnvKeyProvider is rejected unless ALLOW_PLAINTEXT_KEYS=true.
 * Future implementations will check for KMS configuration and return
 * the appropriate provider (e.g., VaultKeyProvider, AwsSecretsKeyProvider).
 */
export function createKeyProvider(
    network?: string,
    serverMnemonic?: string | null,
): KeyProvider {
    // Future: check for KMS config here
    // if (process.env.VAULT_ADDR) return new VaultKeyProvider(...)
    // if (process.env.AWS_SECRET_ARN) return new AwsSecretsKeyProvider(...)

    // Enforce: on mainnet, reject plaintext env-based key provider unless explicitly allowed
    if (network === 'mainnet' && !isPlaintextKeysAllowed()) {
        throw new Error(
            'Refusing to start on mainnet with plaintext key provider (EnvKeyProvider). ' +
            'Wallet encryption keys stored in environment variables are vulnerable to ' +
            'process memory dumps and log leaks. ' +
            'Set ALLOW_PLAINTEXT_KEYS=true to explicitly accept this risk, ' +
            'or configure a KMS-backed key provider (VAULT_ADDR or AWS_SECRET_ARN).',
        );
    }

    if (network === 'mainnet') {
        log.warn(
            'Using EnvKeyProvider on mainnet with ALLOW_PLAINTEXT_KEYS=true — ' +
            'migrate to a KMS-backed provider for production hardening. ' +
            'See: bun run migrate:keys --help',
        );
    }

    log.debug('Using EnvKeyProvider for wallet encryption', { network });
    return new EnvKeyProvider(network, serverMnemonic);
}

/** Check whether the operator has explicitly opted into plaintext key storage. */
function isPlaintextKeysAllowed(): boolean {
    const value = process.env.ALLOW_PLAINTEXT_KEYS;
    return value === 'true' || value === '1';
}

/**
 * Validate that the given KeyProvider is configured for production use.
 *
 * On testnet/mainnet this asserts:
 *   1. A KeyProvider is available (not null)
 *   2. WALLET_ENCRYPTION_KEY env var is explicitly set (no mnemonic/default fallback)
 *   3. The passphrase meets minimum length requirements (>= 32 chars)
 *
 * Throws on violation with a descriptive message. No-op on localnet.
 */
export async function assertProductionReady(
    keyProvider: KeyProvider | null,
    network: string,
): Promise<void> {
    if (network === 'localnet') return;

    if (!keyProvider) {
        throw new Error(
            `KeyProvider is required on ${network}. ` +
            'Configure WALLET_ENCRYPTION_KEY or a KMS backend before starting.',
        );
    }

    // Verify WALLET_ENCRYPTION_KEY is explicitly set (not a fallback)
    const envKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!envKey || envKey.trim().length === 0) {
        throw new Error(
            `WALLET_ENCRYPTION_KEY must be explicitly set on ${network}. ` +
            'Server mnemonic fallback is not allowed in production. ' +
            'Generate a key with: openssl rand -hex 32',
        );
    }

    if (envKey.trim().length < MIN_PRODUCTION_KEY_LENGTH) {
        throw new Error(
            `WALLET_ENCRYPTION_KEY is too short for ${network} (${envKey.trim().length} chars, need >= ${MIN_PRODUCTION_KEY_LENGTH}). ` +
            'Generate a stronger key with: openssl rand -hex 32',
        );
    }

    // Verify the provider actually resolves (sanity check)
    try {
        const passphrase = await keyProvider.getEncryptionPassphrase();
        if (passphrase.length < MIN_PRODUCTION_KEY_LENGTH) {
            throw new Error(
                `KeyProvider returned a passphrase shorter than ${MIN_PRODUCTION_KEY_LENGTH} chars on ${network}`,
            );
        }
    } catch (err) {
        if (err instanceof Error && err.message.includes('KeyProvider returned')) {
            throw err;
        }
        throw new Error(
            `KeyProvider failed to resolve passphrase on ${network}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    log.info(`KeyProvider production readiness validated for ${network}`);
}
