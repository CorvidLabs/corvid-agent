/**
 * Environment variable encryption at rest using AES-256-GCM.
 *
 * Encrypts the entire env_vars JSON blob before writing to SQLite and
 * decrypts transparently on read. Uses the same key material as wallet
 * encryption (WALLET_ENCRYPTION_KEY) but with a distinct PBKDF2 salt
 * purpose so the derived keys are independent.
 *
 * Encrypted values are prefixed with "enc:" to distinguish from legacy
 * plaintext JSON, allowing graceful migration.
 *
 * Uses node:crypto (synchronous) to avoid async cascades in DB accessors.
 *
 * Format: "enc:" + base64( salt(16) + iv(12) + authTag(16) + ciphertext )
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { getEncryptionPassphrase } from './crypto';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 600_000;
const DIGEST = 'sha256';

/** Prefix that marks an encrypted env_vars blob. */
export const ENCRYPTED_PREFIX = 'enc:';

function deriveKey(passphrase: string, salt: Buffer): Buffer {
    return pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

/**
 * Encrypt a JSON env_vars string for storage.
 * Returns a prefixed base64 string: "enc:<base64(salt + iv + authTag + ciphertext)>"
 */
export function encryptEnvVars(jsonStr: string): string {
    // Skip encryption for empty objects — no secrets to protect
    if (jsonStr === '{}') return jsonStr;

    const passphrase = getEncryptionPassphrase();
    const salt = randomBytes(SALT_LENGTH);
    const key = deriveKey(passphrase, salt);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: salt(16) + iv(12) + authTag(16) + ciphertext
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);
    return ENCRYPTED_PREFIX + combined.toString('base64');
}

/**
 * Decrypt an env_vars string from storage.
 * Handles both encrypted ("enc:...") and legacy plaintext JSON.
 */
export function decryptEnvVars(stored: string): string {
    // Legacy plaintext JSON — pass through
    if (!stored.startsWith(ENCRYPTED_PREFIX)) {
        return stored;
    }

    const passphrase = getEncryptionPassphrase();
    const combined = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64');

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = deriveKey(passphrase, salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
}

/**
 * Check whether a stored value is already encrypted.
 */
export function isEncrypted(stored: string): boolean {
    return stored.startsWith(ENCRYPTED_PREFIX);
}
