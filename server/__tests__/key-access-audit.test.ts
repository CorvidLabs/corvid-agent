/**
 * Key access audit & production enforcement tests (Issue #923).
 *
 * Tests:
 *  - Production-mode guard (assertProductionReady)
 *  - Key access audit logging (key_access, key_access_denied)
 *  - Encrypted in-memory key cache
 *  - KeyProvider production validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { queryAuditLog } from '../db/audit';
import {
    EnvKeyProvider,
    assertProductionReady,
    type KeyProvider,
} from '../lib/key-provider';
import {
    encryptMnemonicWithPassphrase,
    decryptMnemonicWithPassphrase,
} from '../lib/crypto';

const TEST_PASSPHRASE = 'test-encryption-key-for-unit-tests-32chars!';
const SHORT_PASSPHRASE = 'short';

// ══════════════════════════════════════════════════════════════════════════
// 1. Production-Mode Guard (assertProductionReady)
// ══════════════════════════════════════════════════════════════════════════

describe('assertProductionReady', () => {
    let originalKey: string | undefined;

    beforeEach(() => {
        originalKey = process.env.WALLET_ENCRYPTION_KEY;
    });

    afterEach(() => {
        if (originalKey === undefined) {
            delete process.env.WALLET_ENCRYPTION_KEY;
        } else {
            process.env.WALLET_ENCRYPTION_KEY = originalKey;
        }
    });

    it('is a no-op on localnet', async () => {
        delete process.env.WALLET_ENCRYPTION_KEY;
        await assertProductionReady(null, 'localnet');
        // No error thrown
    });

    it('throws when no KeyProvider on testnet', async () => {
        process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        await expect(
            assertProductionReady(null, 'testnet'),
        ).rejects.toThrow('KeyProvider is required');
    });

    it('throws when no KeyProvider on mainnet', async () => {
        process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        await expect(
            assertProductionReady(null, 'mainnet'),
        ).rejects.toThrow('KeyProvider is required');
    });

    it('throws when WALLET_ENCRYPTION_KEY not set on testnet', async () => {
        delete process.env.WALLET_ENCRYPTION_KEY;
        const provider = new EnvKeyProvider('testnet');

        await expect(
            assertProductionReady(provider, 'testnet'),
        ).rejects.toThrow('WALLET_ENCRYPTION_KEY must be explicitly set');
    });

    it('throws when WALLET_ENCRYPTION_KEY too short on mainnet', async () => {
        process.env.WALLET_ENCRYPTION_KEY = SHORT_PASSPHRASE;
        const provider = new EnvKeyProvider('mainnet');

        await expect(
            assertProductionReady(provider, 'mainnet'),
        ).rejects.toThrow('too short');
    });

    it('passes with strong key on testnet', async () => {
        process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        const provider = new EnvKeyProvider('testnet');

        await assertProductionReady(provider, 'testnet');
        // No error thrown
    });

    it('passes with strong key on mainnet', async () => {
        process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        const provider = new EnvKeyProvider('mainnet');

        await assertProductionReady(provider, 'mainnet');
        // No error thrown
    });

    it('rejects empty WALLET_ENCRYPTION_KEY', async () => {
        process.env.WALLET_ENCRYPTION_KEY = '   ';
        const provider = new EnvKeyProvider('testnet');

        await expect(
            assertProductionReady(provider, 'testnet'),
        ).rejects.toThrow('WALLET_ENCRYPTION_KEY must be explicitly set');
    });

    it('rejects provider that returns short passphrase', async () => {
        process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        const badProvider: KeyProvider = {
            async getEncryptionPassphrase() { return 'short'; },
            dispose() {},
        };

        await expect(
            assertProductionReady(badProvider, 'mainnet'),
        ).rejects.toThrow('shorter than 32');
    });

    it('rejects provider that throws', async () => {
        process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        const failingProvider: KeyProvider = {
            async getEncryptionPassphrase() { throw new Error('vault unavailable'); },
            dispose() {},
        };

        await expect(
            assertProductionReady(failingProvider, 'mainnet'),
        ).rejects.toThrow('vault unavailable');
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. EnvKeyProvider.getNetwork()
// ══════════════════════════════════════════════════════════════════════════

describe('EnvKeyProvider.getNetwork', () => {
    it('returns the configured network', () => {
        const provider = new EnvKeyProvider('testnet');
        expect(provider.getNetwork()).toBe('testnet');
    });

    it('defaults to localnet', () => {
        const provider = new EnvKeyProvider();
        expect(provider.getNetwork()).toBe('localnet');
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Key Access Audit Actions
// ══════════════════════════════════════════════════════════════════════════

describe('Key access audit actions', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    it('records key_access audit entry', () => {
        const { recordAudit } = require('../db/audit');
        recordAudit(db, 'key_access', 'system', 'agent_wallet', 'agent-1',
            JSON.stringify({ operation: 'decrypt', network: 'testnet' }));

        const result = queryAuditLog(db, { action: 'key_access' });
        expect(result.total).toBe(1);
        expect(result.entries[0].actor).toBe('system');
        expect(result.entries[0].resourceType).toBe('agent_wallet');
        expect(result.entries[0].resourceId).toBe('agent-1');

        const detail = JSON.parse(result.entries[0].detail!);
        expect(detail.operation).toBe('decrypt');
        expect(detail.network).toBe('testnet');
    });

    it('records key_access_denied audit entry', () => {
        const { recordAudit } = require('../db/audit');
        recordAudit(db, 'key_access_denied', 'system', 'agent_wallet', 'agent-2',
            JSON.stringify({ operation: 'decrypt', network: 'mainnet' }));

        const result = queryAuditLog(db, { action: 'key_access_denied' });
        expect(result.total).toBe(1);
        expect(result.entries[0].resourceId).toBe('agent-2');
    });

    it('key rotation creates key_access entries for each agent', async () => {
        const { rotateWalletEncryptionKey } = require('../lib/key-rotation');

        const OLD = 'a'.repeat(32) + '-old-passphrase';
        const NEW = 'b'.repeat(32) + '-new-passphrase';

        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        // Encrypt directly with passphrase (avoids env-var race with parallel tests)
        const enc = await encryptMnemonicWithPassphrase(mnemonic, OLD);

        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('a1', 'Agent1', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${enc}', wallet_address = 'ADDR1' WHERE id = 'a1'`);
        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('a2', 'Agent2', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${enc}', wallet_address = 'ADDR2' WHERE id = 'a2'`);

        const result = await rotateWalletEncryptionKey(db, OLD, NEW, 'testnet');
        expect(result.success).toBe(true);

        // Should have key_rotation + 2x key_access entries
        const rotationEntries = queryAuditLog(db, { action: 'key_rotation' });
        expect(rotationEntries.total).toBe(1);

        const accessEntries = queryAuditLog(db, { action: 'key_access' });
        expect(accessEntries.total).toBe(2);

        const agentIds = accessEntries.entries.map(e => e.resourceId).sort();
        expect(agentIds).toEqual(['a1', 'a2']);
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Encrypted In-Memory Key Cache (unit test for the pattern)
// ══════════════════════════════════════════════════════════════════════════

describe('Encrypted in-memory cache pattern', () => {
    it('re-encrypt with ephemeral key produces different ciphertext', async () => {
        const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
        const ephemeralKey1 = crypto.getRandomValues(new Uint8Array(32));
        const ephemeralHex1 = Array.from(ephemeralKey1, b => b.toString(16).padStart(2, '0')).join('');
        const ephemeralKey2 = crypto.getRandomValues(new Uint8Array(32));
        const ephemeralHex2 = Array.from(ephemeralKey2, b => b.toString(16).padStart(2, '0')).join('');

        const enc1 = await encryptMnemonicWithPassphrase(mnemonic, ephemeralHex1);
        const enc2 = await encryptMnemonicWithPassphrase(mnemonic, ephemeralHex2);

        // Different ephemeral keys produce different ciphertexts
        expect(enc1).not.toBe(enc2);

        // Each decrypts correctly with its own key
        expect(await decryptMnemonicWithPassphrase(enc1, ephemeralHex1)).toBe(mnemonic);
        expect(await decryptMnemonicWithPassphrase(enc2, ephemeralHex2)).toBe(mnemonic);
    });

    it('ephemeral key cannot decrypt data encrypted with different ephemeral key', async () => {
        const mnemonic = 'test secret data';
        const key1 = 'a'.repeat(64);
        const key2 = 'b'.repeat(64);

        const enc = await encryptMnemonicWithPassphrase(mnemonic, key1);

        await expect(
            decryptMnemonicWithPassphrase(enc, key2),
        ).rejects.toThrow();
    });

    it('cache entry with expired TTL is effectively stale', () => {
        // Simulate TTL check logic (5 min = 300_000 ms)
        const CACHE_TTL_MS = 5 * 60 * 1000;
        const cachedAt = Date.now() - CACHE_TTL_MS - 1;
        const isExpired = Date.now() - cachedAt > CACHE_TTL_MS;
        expect(isExpired).toBe(true);

        const freshCachedAt = Date.now();
        const isFresh = Date.now() - freshCachedAt > CACHE_TTL_MS;
        expect(isFresh).toBe(false);
    });
});
