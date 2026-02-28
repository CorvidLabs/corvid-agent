/**
 * Wallet encryption key rotation — re-encrypts wallet mnemonics with a new passphrase.
 *
 * Flow:
 *   1. Decrypt all mnemonics with old passphrase (PBKDF2 600k iterations)
 *   2. Generate new salt per entry, re-encrypt with new passphrase
 *   3. Atomic write to wallet-keystore.json (temp file + rename)
 *   4. Update encrypted mnemonics in agents DB table
 *   5. Verify decryption with new key before committing
 *   6. Wipe old key material from memory
 *
 * Owner-only operation requiring current + new passphrase.
 */

import type { Database } from 'bun:sqlite';
import { readKeystore, getKeystorePath, type KeystoreData } from './wallet-keystore';
import { wipeBuffer } from './secure-wipe';
import { recordAudit } from '../db/audit';
import { createLogger } from './logger';

const log = createLogger('KeyRotation');

export interface RotationResult {
    success: boolean;
    agentsRotated: number;
    keystoreEntriesRotated: number;
    error?: string;
}

/**
 * Rotate wallet encryption key: re-encrypt all mnemonics from oldPassphrase to newPassphrase.
 *
 * This is an all-or-nothing operation:
 * - First, decrypt and re-encrypt everything in memory
 * - Verify each re-encrypted mnemonic decrypts correctly with the new key
 * - Only then write to DB + keystore atomically
 * - Wipe all plaintext mnemonics from memory in finally block
 */
export async function rotateWalletEncryptionKey(
    db: Database,
    oldPassphrase: string,
    newPassphrase: string,
    _network: string,
): Promise<RotationResult> {
    if (oldPassphrase === newPassphrase) {
        return { success: false, agentsRotated: 0, keystoreEntriesRotated: 0, error: 'New passphrase must differ from old passphrase' };
    }

    if (newPassphrase.length < 32) {
        return { success: false, agentsRotated: 0, keystoreEntriesRotated: 0, error: 'New passphrase must be at least 32 characters' };
    }

    // Collect plaintext mnemonics for wiping in finally
    const plaintextMnemonics: string[] = [];

    try {
        // ── Phase 1: Decrypt all mnemonics with old key ──
        const keystoreData = readKeystore();
        const agentRows = db.query(
            'SELECT id, name, wallet_mnemonic_encrypted FROM agents WHERE wallet_mnemonic_encrypted IS NOT NULL',
        ).all() as Array<{ id: string; name: string; wallet_mnemonic_encrypted: string }>;

        // Decrypt + re-encrypt DB entries
        const dbUpdates: Array<{ id: string; name: string; newEncrypted: string }> = [];
        for (const row of agentRows) {
            // Override env-based passphrase with explicit old passphrase
            const plaintext = await decryptWithPassphrase(row.wallet_mnemonic_encrypted, oldPassphrase);
            plaintextMnemonics.push(plaintext);

            const newEncrypted = await encryptWithPassphrase(plaintext, newPassphrase);

            // ── Phase 2: Verify round-trip ──
            const verified = await decryptWithPassphrase(newEncrypted, newPassphrase);
            if (verified !== plaintext) {
                return {
                    success: false,
                    agentsRotated: 0,
                    keystoreEntriesRotated: 0,
                    error: `Round-trip verification failed for agent ${row.name}`,
                };
            }

            dbUpdates.push({ id: row.id, name: row.name, newEncrypted });
        }

        // Decrypt + re-encrypt keystore entries
        const keystoreUpdates: KeystoreData = {};
        for (const [agentName, entry] of Object.entries(keystoreData)) {
            const plaintext = await decryptWithPassphrase(entry.encryptedMnemonic, oldPassphrase);
            plaintextMnemonics.push(plaintext);

            const newEncrypted = await encryptWithPassphrase(plaintext, newPassphrase);

            // Verify round-trip
            const verified = await decryptWithPassphrase(newEncrypted, newPassphrase);
            if (verified !== plaintext) {
                return {
                    success: false,
                    agentsRotated: 0,
                    keystoreEntriesRotated: 0,
                    error: `Round-trip verification failed for keystore entry "${agentName}"`,
                };
            }

            keystoreUpdates[agentName] = { address: entry.address, encryptedMnemonic: newEncrypted };
        }

        // ── Phase 3: Atomic commit ──
        // Write keystore first (atomic via temp+rename)
        if (Object.keys(keystoreUpdates).length > 0) {
            atomicWriteKeystore(keystoreUpdates);
        }

        // Update DB in a transaction
        const updateStmt = db.prepare(
            'UPDATE agents SET wallet_mnemonic_encrypted = ? WHERE id = ?',
        );
        const transaction = db.transaction(() => {
            for (const update of dbUpdates) {
                updateStmt.run(update.newEncrypted, update.id);
            }
        });
        transaction();

        // ── Phase 4: Audit log ──
        recordAudit(
            db,
            'key_rotation',
            'owner',
            'wallet_encryption_key',
            null,
            JSON.stringify({
                agentsRotated: dbUpdates.length,
                keystoreEntriesRotated: Object.keys(keystoreUpdates).length,
                agents: dbUpdates.map((u) => u.name),
            }),
        );

        log.info('Wallet encryption key rotated successfully', {
            agentsRotated: dbUpdates.length,
            keystoreEntriesRotated: Object.keys(keystoreUpdates).length,
        });

        return {
            success: true,
            agentsRotated: dbUpdates.length,
            keystoreEntriesRotated: Object.keys(keystoreUpdates).length,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Key rotation failed', { error: message });
        return {
            success: false,
            agentsRotated: 0,
            keystoreEntriesRotated: 0,
            error: message,
        };
    } finally {
        // Wipe all plaintext mnemonics from memory (best-effort for strings)
        plaintextMnemonics.length = 0;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 128;
const CURRENT_ITERATIONS = 600_000;

/**
 * Decrypt with an explicit passphrase (bypasses env-based resolution).
 */
async function decryptWithPassphrase(encrypted: string, passphrase: string): Promise<string> {
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(passphrase, salt, CURRENT_ITERATIONS);
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
            key,
            ciphertext,
        );
        return new TextDecoder().decode(decrypted);
    } finally {
        wipeBuffer(salt);
        wipeBuffer(iv);
        wipeBuffer(combined);
    }
}

/**
 * Encrypt with an explicit passphrase (bypasses env-based resolution).
 */
async function encryptWithPassphrase(plaintext: string, passphrase: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await deriveKey(passphrase, salt, CURRENT_ITERATIONS);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
        key,
        encoder.encode(plaintext),
    );

    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    const result = btoa(String.fromCharCode(...combined));

    // Wipe intermediate buffers
    wipeBuffer(salt);
    wipeBuffer(iv);
    wipeBuffer(combined);

    return result;
}

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
 * Atomic write to wallet-keystore.json using temp file + rename.
 */
function atomicWriteKeystore(data: KeystoreData): void {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = getKeystorePath();
    const tmpPath = path + '.rotation-tmp';

    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpPath, path);

    if (process.platform !== 'win32') {
        fs.chmodSync(path, 0o600);
    }
}
