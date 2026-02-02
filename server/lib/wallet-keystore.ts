/**
 * Wallet keystore — persists encrypted mnemonics to a JSON file outside the DB.
 * This survives DB rebuilds so agents don't need re-funding on localnet.
 *
 * Keyed by agent name (case-sensitive). Each entry stores:
 *   - address: the Algorand wallet address
 *   - encryptedMnemonic: AES-256-GCM encrypted mnemonic (same as DB column)
 */

import { createLogger } from './logger';

const log = createLogger('WalletKeystore');

const KEYSTORE_PATH = process.env.WALLET_KEYSTORE_PATH ?? './wallet-keystore.json';

interface KeystoreEntry {
    address: string;
    encryptedMnemonic: string;
}

type KeystoreData = Record<string, KeystoreEntry>;

function readKeystore(): KeystoreData {
    try {
        const text = require('node:fs').readFileSync(KEYSTORE_PATH, 'utf-8');
        return JSON.parse(text) as KeystoreData;
    } catch {
        return {};
    }
}

function writeKeystore(data: KeystoreData): void {
    try {
        require('node:fs').writeFileSync(KEYSTORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        log.error('Failed to write wallet keystore', {
            path: KEYSTORE_PATH,
            error: err instanceof Error ? err.message : String(err),
        });
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
