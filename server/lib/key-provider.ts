/**
 * KeyProvider — abstraction layer for wallet encryption key management.
 *
 * Decouples key retrieval from the env var, enabling future integrations
 * with AWS Secrets Manager, HashiCorp Vault, or similar KMS backends.
 *
 * Phase 1: EnvKeyProvider (wraps existing WALLET_ENCRYPTION_KEY env var logic).
 * Phase 2: VaultKeyProvider, AwsSecretsKeyProvider, etc.
 *
 * Production enforcement (#923, #924):
 * On mainnet, WALLET_ENCRYPTION_KEY must be explicitly configured with a
 * strong passphrase (>= 32 chars). The ALLOW_PLAINTEXT_KEYS escape hatch
 * has been removed — all mainnet deployments must use explicit key config.
 *
 * assertProductionReady() validates the KeyProvider is configured
 * with a strong passphrase (>= 32 chars) on testnet/mainnet, and rejects
 * plaintext key sources (default localnet key, server mnemonic fallback)
 * on non-localnet networks.
 *
 * detectPlaintextKeyConfig() scans environment for plaintext wallet keys
 * or mnemonics and emits warnings/errors on startup.
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
 * On mainnet, requires WALLET_ENCRYPTION_KEY to be explicitly set.
 * Future implementations will check for KMS configuration and return
 * the appropriate provider (e.g., VaultKeyProvider, AwsSecretsKeyProvider).
 */
export function createKeyProvider(network?: string, serverMnemonic?: string | null): KeyProvider {
  // Future: check for KMS config here
  // if (process.env.VAULT_ADDR) return new VaultKeyProvider(...)
  // if (process.env.AWS_SECRET_ARN) return new AwsSecretsKeyProvider(...)

  // Enforce: on mainnet, require explicit WALLET_ENCRYPTION_KEY
  if (network === 'mainnet') {
    const envKey = process.env.WALLET_ENCRYPTION_KEY;
    if (!envKey || envKey.trim().length === 0) {
      throw new Error(
        'Refusing to start on mainnet without WALLET_ENCRYPTION_KEY. ' +
          'Wallet encryption keys must be explicitly configured for mainnet. ' +
          'Generate one with: openssl rand -hex 32',
      );
    }

    // Warn about deprecated ALLOW_PLAINTEXT_KEYS if still set
    if (process.env.ALLOW_PLAINTEXT_KEYS) {
      log.warn(
        'ALLOW_PLAINTEXT_KEYS is deprecated and ignored (#924). ' +
          'Mainnet now requires WALLET_ENCRYPTION_KEY to be set. ' +
          'Remove ALLOW_PLAINTEXT_KEYS from your environment.',
      );
    }
  }

  log.debug('Using EnvKeyProvider for wallet encryption', { network });
  return new EnvKeyProvider(network, serverMnemonic);
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
export async function assertProductionReady(keyProvider: KeyProvider | null, network: string): Promise<void> {
  if (network === 'localnet') return;

  if (!keyProvider) {
    throw new Error(
      `KeyProvider is required on ${network}. Configure WALLET_ENCRYPTION_KEY or a KMS backend before starting.`,
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

/**
 * Scan environment variables for plaintext wallet keys or mnemonics
 * that should not be present in production configurations.
 *
 * Returns an array of warning messages. On mainnet, any finding is fatal.
 * On testnet, warnings are emitted. On localnet, this is a no-op.
 */
export function detectPlaintextKeyConfig(network: string): string[] {
  if (network === 'localnet') return [];

  const warnings: string[] = [];

  // Check for deprecated ALLOW_PLAINTEXT_KEYS
  if (process.env.ALLOW_PLAINTEXT_KEYS) {
    warnings.push(
      'ALLOW_PLAINTEXT_KEYS is set but deprecated (#924). ' +
        'Remove it from your environment — it is no longer honored.',
    );
  }

  // Detect if ALGOCHAT_MNEMONIC looks like a raw 25-word mnemonic in a non-localnet env.
  // This is expected (it's how the server identifies itself), but we warn operators
  // to ensure they're aware and using proper secret management (Docker secrets, Vault, etc.)
  const mnemonic = process.env.ALGOCHAT_MNEMONIC;
  if (mnemonic && mnemonic.trim().split(/\s+/).length >= 25) {
    if (network === 'mainnet') {
      warnings.push(
        'ALGOCHAT_MNEMONIC contains a raw 25-word mnemonic in a mainnet environment. ' +
          'Consider using Docker secrets, a secrets manager, or file-based injection ' +
          'to avoid plaintext mnemonics in process environment variables.',
      );
    }
  }

  // Check for WALLET_ENCRYPTION_KEY that is suspiciously weak
  const encKey = process.env.WALLET_ENCRYPTION_KEY;
  if (encKey && encKey.trim().length < MIN_PRODUCTION_KEY_LENGTH) {
    warnings.push(
      `WALLET_ENCRYPTION_KEY is only ${encKey.trim().length} chars on ${network} ` +
        `(minimum ${MIN_PRODUCTION_KEY_LENGTH}). Generate a stronger key with: openssl rand -hex 32`,
    );
  }

  // Log all warnings
  for (const w of warnings) {
    if (network === 'mainnet') {
      log.error(`[SECURITY] ${w}`);
    } else {
      log.warn(`[SECURITY] ${w}`);
    }
  }

  return warnings;
}
