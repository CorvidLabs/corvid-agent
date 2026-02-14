/**
 * Mnemonic encryption/decryption using AES-256-GCM via Web Crypto API.
 * Key is derived from WALLET_ENCRYPTION_KEY env var, or from the server mnemonic on localnet.
 *
 * Format (v2): base64( salt(16) + iv(12) + ciphertext )
 * Legacy (v1): base64( iv(12) + ciphertext ) — static salt, 100k iterations
 *
 * Security:
 *   - WALLET_ENCRYPTION_KEY is required for testnet/mainnet
 *   - Minimum key length enforced (32 chars) to prevent weak passphrases
 *   - Warns on default key usage (localnet only)
 */

import { createLogger } from './logger';

const log = createLogger('Crypto');

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 128;

const CURRENT_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 100_000;
const LEGACY_SALT = 'corvid-agent-wallet-encryption';

const DEFAULT_LOCALNET_KEY = 'corvid-agent-localnet-default-key';

/** Minimum length for WALLET_ENCRYPTION_KEY on non-localnet. */
const MIN_KEY_LENGTH = 32;

/** Track whether we've already warned about using the default key, to avoid spam. */
let warnedDefaultKey = false;

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey'],
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt'],
    );
}

/**
 * Resolve the encryption passphrase from environment / config.
 * Exported for testing only — not part of the public API.
 */
export function getEncryptionPassphrase(network?: string, serverMnemonic?: string | null): string {
    const envKey = process.env.WALLET_ENCRYPTION_KEY;
    if (envKey && envKey.trim().length > 0) {
        const trimmed = envKey.trim();

        // Warn if the key is suspiciously short on non-localnet
        if (network && network !== 'localnet' && trimmed.length < MIN_KEY_LENGTH) {
            log.warn(`WALLET_ENCRYPTION_KEY is only ${trimmed.length} chars — recommend at least ${MIN_KEY_LENGTH}. Generate with: openssl rand -hex 32`);
        }

        return trimmed;
    }

    // On non-localnet, require an explicit encryption key
    if (network && network !== 'localnet') {
        throw new Error(
            `WALLET_ENCRYPTION_KEY must be set for ${network}. ` +
            'This key encrypts wallet mnemonics at rest. Generate one with: openssl rand -hex 32',
        );
    }

    if (serverMnemonic && serverMnemonic.trim().length > 0) return serverMnemonic.trim();

    // Default key: only acceptable on localnet for dev convenience
    if (!warnedDefaultKey) {
        log.warn('Using default encryption key — only acceptable for localnet development');
        warnedDefaultKey = true;
    }
    return DEFAULT_LOCALNET_KEY;
}

export async function encryptMnemonic(
    plaintext: string,
    serverMnemonic?: string | null,
    network?: string,
): Promise<string> {
    const passphrase = getEncryptionPassphrase(network, serverMnemonic);

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await deriveKey(passphrase, salt, CURRENT_ITERATIONS);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        encoder.encode(plaintext),
    );

    // v2 format: salt(16) + iv(12) + ciphertext
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
}

export async function decryptMnemonic(
    encrypted: string,
    serverMnemonic?: string | null,
    network?: string,
): Promise<string> {
    const passphrase = getEncryptionPassphrase(network, serverMnemonic);
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Try v2 format first: salt(16) + iv(12) + ciphertext
    if (combined.length >= SALT_LENGTH + IV_LENGTH + 1) {
        try {
            const salt = combined.slice(0, SALT_LENGTH);
            const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

            const key = await deriveKey(passphrase, salt, CURRENT_ITERATIONS);
            const decrypted = await crypto.subtle.decrypt(
                { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
                key,
                ciphertext,
            );
            return new TextDecoder().decode(decrypted);
        } catch {
            // Fall through to legacy format
        }
    }

    // Legacy v1 format: iv(12) + ciphertext, static salt, 100k iterations
    const legacySalt = new TextEncoder().encode(LEGACY_SALT);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const key = await deriveKey(passphrase, legacySalt, LEGACY_ITERATIONS);
    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        ciphertext,
    );

    return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt arbitrary content for on-chain storage (e.g. agent memories).
 * Uses the same AES-256-GCM scheme with the agent's encryption passphrase.
 */
export async function encryptMemoryContent(
    plaintext: string,
    serverMnemonic?: string | null,
    network?: string,
): Promise<string> {
    // Reuse the same encryption path — output is base64
    return encryptMnemonic(plaintext, serverMnemonic, network);
}

/**
 * Decrypt content that was encrypted with encryptMemoryContent.
 */
export async function decryptMemoryContent(
    encrypted: string,
    serverMnemonic?: string | null,
    network?: string,
): Promise<string> {
    return decryptMnemonic(encrypted, serverMnemonic, network);
}
