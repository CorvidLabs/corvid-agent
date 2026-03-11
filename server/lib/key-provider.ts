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
 */

import { getEncryptionPassphrase } from './crypto';
import { createLogger } from './logger';

const log = createLogger('KeyProvider');

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
