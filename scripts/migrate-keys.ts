#!/usr/bin/env bun
/**
 * migrate-keys — migrate wallet encryption keys from plaintext env-var to KMS-backed storage.
 *
 * Currently supports re-encrypting all wallet mnemonics with a new passphrase
 * (key rotation). Future versions will support migrating to AWS KMS or
 * HashiCorp Vault backends.
 *
 * Usage:
 *   bun run migrate:keys                  — interactive key rotation
 *   bun run migrate:keys --check          — check current key source (no changes)
 *   bun run migrate:keys --help           — show usage
 *
 * Environment:
 *   WALLET_ENCRYPTION_KEY      — current encryption passphrase
 *   WALLET_ENCRYPTION_KEY_NEW  — new encryption passphrase (for rotation)
 *   ALGORAND_NETWORK           — network (localnet/testnet/mainnet)
 *
 * @see #923 — encrypt wallet keys at rest and enforce KMS migration
 */

import { Database } from 'bun:sqlite';
import { rotateWalletEncryptionKey } from '../server/lib/key-rotation';
import { readKeystore } from '../server/lib/wallet-keystore';

const USAGE = `
migrate-keys — wallet encryption key migration tool

Usage:
  bun run migrate:keys              Rotate encryption key (requires env vars)
  bun run migrate:keys --check      Check current key configuration
  bun run migrate:keys --help       Show this help

Environment variables:
  WALLET_ENCRYPTION_KEY             Current encryption passphrase
  WALLET_ENCRYPTION_KEY_NEW         New encryption passphrase (for rotation)
  ALGORAND_NETWORK                  Network (default: localnet)
  DB_PATH                           Database path (default: ./corvid-agent.db)

Key rotation:
  Set both WALLET_ENCRYPTION_KEY (current) and WALLET_ENCRYPTION_KEY_NEW (new)
  to rotate all wallet mnemonics to the new passphrase. The new passphrase
  must be at least 32 characters and different from the current one.

  Example:
    WALLET_ENCRYPTION_KEY="current-key" \\
    WALLET_ENCRYPTION_KEY_NEW="$(openssl rand -hex 32)" \\
    bun run migrate:keys
`.trim();

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(USAGE);
        process.exit(0);
    }

    const dbPath = process.env.DB_PATH ?? './corvid-agent.db';
    const network = process.env.ALGORAND_NETWORK ?? 'localnet';

    if (args.includes('--check')) {
        await checkKeyConfig(dbPath, network);
        return;
    }

    // Default: key rotation
    await rotateKeys(dbPath, network);
}

async function checkKeyConfig(dbPath: string, network: string): Promise<void> {
    console.log('=== Wallet Key Configuration Check ===\n');
    console.log(`Network:  ${network}`);
    console.log(`DB path:  ${dbPath}`);

    // Check encryption key source
    const hasEnvKey = !!process.env.WALLET_ENCRYPTION_KEY?.trim();
    const allowPlaintext = process.env.ALLOW_PLAINTEXT_KEYS === 'true' || process.env.ALLOW_PLAINTEXT_KEYS === '1';

    console.log(`\nKey source: ${hasEnvKey ? 'WALLET_ENCRYPTION_KEY (env var)' : 'default/server-mnemonic fallback'}`);
    console.log(`ALLOW_PLAINTEXT_KEYS: ${allowPlaintext ? 'true (explicitly allowed)' : 'false'}`);

    if (network === 'mainnet' && !allowPlaintext) {
        console.log('\n⚠  WARNING: Server will refuse to start on mainnet without:');
        console.log('   - ALLOW_PLAINTEXT_KEYS=true, OR');
        console.log('   - A KMS-backed key provider (future)');
    }

    if (hasEnvKey) {
        const keyLen = process.env.WALLET_ENCRYPTION_KEY!.trim().length;
        console.log(`Key length: ${keyLen} chars${keyLen < 32 ? ' (WARNING: below 32-char minimum)' : ''}`);
    }

    // Check keystore
    const keystoreData = readKeystore();
    const keystoreCount = Object.keys(keystoreData).length;
    console.log(`\nKeystore entries: ${keystoreCount}`);

    // Check DB
    try {
        const db = new Database(dbPath, { readonly: true });
        const row = db.query('SELECT COUNT(*) as cnt FROM agents WHERE wallet_mnemonic_encrypted IS NOT NULL').get() as { cnt: number };
        console.log(`DB encrypted wallets: ${row.cnt}`);
        db.close();
    } catch (err) {
        console.log(`DB: could not open (${err instanceof Error ? err.message : String(err)})`);
    }

    console.log('\n=== Check complete ===');
}

async function rotateKeys(dbPath: string, network: string): Promise<void> {
    const oldKey = process.env.WALLET_ENCRYPTION_KEY?.trim();
    const newKey = process.env.WALLET_ENCRYPTION_KEY_NEW?.trim();

    if (!oldKey) {
        console.error('ERROR: WALLET_ENCRYPTION_KEY must be set (current passphrase)');
        process.exit(1);
    }

    if (!newKey) {
        console.error('ERROR: WALLET_ENCRYPTION_KEY_NEW must be set (new passphrase)');
        console.error('Generate one with: openssl rand -hex 32');
        process.exit(1);
    }

    console.log('=== Wallet Encryption Key Rotation ===\n');
    console.log(`Network: ${network}`);
    console.log(`DB path: ${dbPath}`);
    console.log(`New key length: ${newKey.length} chars`);
    console.log('');

    const db = new Database(dbPath);
    try {
        const result = await rotateWalletEncryptionKey(db, oldKey, newKey, network);

        if (result.success) {
            console.log('Key rotation successful!');
            console.log(`  Agents rotated: ${result.agentsRotated}`);
            console.log(`  Keystore entries rotated: ${result.keystoreEntriesRotated}`);
            console.log('');
            console.log('IMPORTANT: Update your WALLET_ENCRYPTION_KEY environment variable');
            console.log('to the new passphrase value before restarting the server.');
        } else {
            console.error(`Key rotation FAILED: ${result.error}`);
            process.exit(1);
        }
    } finally {
        db.close();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
