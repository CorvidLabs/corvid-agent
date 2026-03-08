/**
 * KeyProvider — abstraction layer for wallet encryption key management.
 *
 * Decouples key retrieval from the env var, enabling future integrations
 * with AWS Secrets Manager, HashiCorp Vault, or similar KMS backends.
 *
 * Phase 1: EnvKeyProvider (wraps existing WALLET_ENCRYPTION_KEY env var logic).
 * Phase 2: VaultKeyProvider, AwsSecretsKeyProvider, etc.
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
 * Currently always returns EnvKeyProvider. Future implementations will
 * check for KMS configuration (e.g., VAULT_ADDR, AWS_SECRET_ARN) and
 * return the appropriate provider.
 */
export function createKeyProvider(
    network?: string,
    serverMnemonic?: string | null,
): KeyProvider {
    // Future: check for KMS config here
    // if (process.env.VAULT_ADDR) return new VaultKeyProvider(...)
    // if (process.env.AWS_SECRET_ARN) return new AwsSecretsKeyProvider(...)

    log.debug('Using EnvKeyProvider for wallet encryption');
    return new EnvKeyProvider(network, serverMnemonic);
}
