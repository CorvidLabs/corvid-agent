/**
 * Mnemonic encryption/decryption using AES-256-GCM via Web Crypto API.
 * Key is derived from WALLET_ENCRYPTION_KEY env var, or from the server mnemonic on localnet.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

async function deriveKey(passphrase: string): Promise<CryptoKey> {
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
            salt: encoder.encode('corvid-agent-wallet-encryption'),
            iterations: 100_000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt'],
    );
}

function getEncryptionPassphrase(serverMnemonic?: string | null): string {
    const envKey = process.env.WALLET_ENCRYPTION_KEY;
    if (envKey && envKey.trim().length > 0) return envKey.trim();
    if (serverMnemonic && serverMnemonic.trim().length > 0) return serverMnemonic.trim();
    return 'corvid-agent-localnet-default-key';
}

export async function encryptMnemonic(
    plaintext: string,
    serverMnemonic?: string | null,
): Promise<string> {
    const passphrase = getEncryptionPassphrase(serverMnemonic);
    const key = await deriveKey(passphrase);

    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        encoder.encode(plaintext),
    );

    // Concatenate iv + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

export async function decryptMnemonic(
    encrypted: string,
    serverMnemonic?: string | null,
): Promise<string> {
    const passphrase = getEncryptionPassphrase(serverMnemonic);
    const key = await deriveKey(passphrase);

    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        ciphertext,
    );

    return new TextDecoder().decode(decrypted);
}
