/**
 * Wallet keystore — persists encrypted mnemonics to a JSON file outside the DB.
 * This survives DB rebuilds so agents don't need re-funding on localnet.
 *
 * Security hardening:
 *   - File is created with mode 0o600 (owner read/write only)
 *   - File permissions are verified on every read; warns if too permissive
 *   - Writes use atomic rename (write to .tmp then rename) to prevent corruption
 *   - Only encrypted mnemonics are stored (AES-256-GCM, same as DB column)
 *
 * Keyed by agent name (case-sensitive). Each entry stores:
 *   - address: the Algorand wallet address
 *   - encryptedMnemonic: AES-256-GCM encrypted mnemonic (same as DB column)
 */

import { createLogger } from './logger';

const log = createLogger('WalletKeystore');

export const KEYSTORE_PATH = process.env.WALLET_KEYSTORE_PATH ?? './wallet-keystore.json';

/** Required file mode: owner read/write only (0o600). */
const REQUIRED_MODE = 0o600;

export interface KeystoreEntry {
    address: string;
    encryptedMnemonic: string;
}

export type KeystoreData = Record<string, KeystoreEntry>;

/**
 * Check that keystore file permissions are not too permissive.
 * Returns true if the file is safe to read, false if permissions are wrong.
 * If the file doesn't exist, returns true (no data to leak).
 */
function verifyFilePermissions(): boolean {
    try {
        const fs = require('node:fs') as typeof import('node:fs');
        const stat = fs.statSync(KEYSTORE_PATH);
        const mode = stat.mode & 0o777; // Extract permission bits

        if (mode !== REQUIRED_MODE) {
            log.warn('Keystore file has overly permissive permissions — fixing', {
                path: KEYSTORE_PATH,
                currentMode: '0o' + mode.toString(8),
                requiredMode: '0o' + REQUIRED_MODE.toString(8),
            });
            // Auto-fix: tighten permissions
            try {
                fs.chmodSync(KEYSTORE_PATH, REQUIRED_MODE);
                log.info('Fixed keystore file permissions', { mode: '0o' + REQUIRED_MODE.toString(8) });
            } catch (chmodErr) {
                log.error('Failed to fix keystore permissions — refusing to read', {
                    error: chmodErr instanceof Error ? chmodErr.message : String(chmodErr),
                });
                return false;
            }
        }
        return true;
    } catch {
        // File doesn't exist yet — that's fine
        return true;
    }
}

export function readKeystore(): KeystoreData {
    try {
        if (!verifyFilePermissions()) {
            return {};
        }
        const fs = require('node:fs') as typeof import('node:fs');
        const text = fs.readFileSync(KEYSTORE_PATH, 'utf-8');
        const parsed = JSON.parse(text);

        // Basic schema validation: must be a plain object with string-keyed entries
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            log.error('Keystore file has invalid format (expected JSON object)');
            return {};
        }

        // Validate each entry has the expected shape
        const data: KeystoreData = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (
                typeof value === 'object' && value !== null &&
                typeof (value as KeystoreEntry).address === 'string' &&
                typeof (value as KeystoreEntry).encryptedMnemonic === 'string'
            ) {
                data[key] = value as KeystoreEntry;
            } else {
                log.warn(`Keystore entry "${key}" has invalid shape — skipping`);
            }
        }

        return data;
    } catch {
        return {};
    }
}

/**
 * Write keystore data atomically: write to a temporary file then rename.
 * This prevents corruption if the process crashes mid-write.
 */
function writeKeystore(data: KeystoreData): void {
    const tmpPath = KEYSTORE_PATH + '.tmp';
    try {
        const fs = require('node:fs') as typeof import('node:fs');
        const content = JSON.stringify(data, null, 2);

        // Write to temp file with restrictive permissions from the start
        fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: REQUIRED_MODE });

        // Atomic rename
        fs.renameSync(tmpPath, KEYSTORE_PATH);

        // Ensure final file has correct permissions (rename preserves source perms,
        // but belt-and-suspenders for cross-platform safety)
        fs.chmodSync(KEYSTORE_PATH, REQUIRED_MODE);
    } catch (err) {
        log.error('Failed to write wallet keystore', {
            path: KEYSTORE_PATH,
            error: err instanceof Error ? err.message : String(err),
        });
        // Clean up temp file on failure
        try {
            const fs = require('node:fs') as typeof import('node:fs');
            fs.unlinkSync(tmpPath);
        } catch {
            // Ignore cleanup errors
        }
    }
}

export function getKeystoreEntry(agentName: string): KeystoreEntry | null {
    const data = readKeystore();
    return data[agentName] ?? null;
}

export function saveKeystoreEntry(agentName: string, address: string, encryptedMnemonic: string): void {
    const data = readKeystore();
    data[agentName] = { address, encryptedMnemonic };
    writeKeystore(data);
    log.info(`Saved wallet to keystore for "${agentName}"`);
}

export function removeKeystoreEntry(agentName: string): void {
    const data = readKeystore();
    if (agentName in data) {
        delete data[agentName];
        writeKeystore(data);
        log.info(`Removed wallet from keystore for "${agentName}"`);
    }
}
