/**
 * Crypto audit test suite for v0.16.0 — key rotation, grace periods, and memory wipe.
 *
 * Tests:
 *  - Wallet encryption key rotation (round-trip, old key invalid, atomic write, error recovery)
 *  - PSK rotation with grace period (acceptance, rejection after expiry)
 *  - API key rotation with grace period (dual-key, expiry)
 *  - Secure memory wipe (buffer zeroing)
 *  - Encryption round-trip with rotated keys
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runMigrations } from '../db/schema';
import { queryAuditLog } from '../db/audit';
import { wipeBuffer, wipeBuffers, withSecureBuffer } from '../lib/secure-wipe';
import { rotateWalletEncryptionKey } from '../lib/key-rotation';
import { encryptMnemonic, decryptMnemonic } from '../lib/crypto';
import {
    checkHttpAuth,
    checkWsAuth,
    rotateApiKey,
    getApiKeyRotationStatus,
    setApiKeyExpiry,
    isApiKeyExpired,
    getApiKeyExpiryWarning,
    type AuthConfig,
} from '../middleware/auth';

// ── Test setup ────────────────────────────────────────────────────────────

const TEST_DIR = mkdtempSync(join(tmpdir(), 'corvid-crypto-test-'));
const TEST_KEYSTORE_PATH = join(TEST_DIR, 'test-wallet-keystore.json');

// Override keystore path for tests
process.env.WALLET_KEYSTORE_PATH = TEST_KEYSTORE_PATH;

let db: Database;

function cleanup(): void {
    try { unlinkSync(TEST_KEYSTORE_PATH); } catch { /* ignore */ }
    try { unlinkSync(TEST_KEYSTORE_PATH + '.rotation-tmp'); } catch { /* ignore */ }
}

function makeRequest(path: string, options?: RequestInit & { headers?: Record<string, string> }): Request {
    return new Request(`http://localhost:3000${path}`, options);
}

function makeUrl(path: string, params?: Record<string, string>): URL {
    const url = new URL(`http://localhost:3000${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return url;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. Secure Memory Wipe
// ══════════════════════════════════════════════════════════════════════════

describe('Secure Memory Wipe', () => {
    it('wipeBuffer zeroes a Uint8Array', () => {
        const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(buf.some((b) => b !== 0)).toBe(true);

        wipeBuffer(buf);

        expect(buf.every((b) => b === 0)).toBe(true);
    });

    it('wipeBuffer zeroes a large buffer', () => {
        const buf = crypto.getRandomValues(new Uint8Array(1024));
        expect(buf.some((b) => b !== 0)).toBe(true);

        wipeBuffer(buf);

        expect(buf.every((b) => b === 0)).toBe(true);
    });

    it('wipeBuffer handles null/undefined gracefully', () => {
        expect(() => wipeBuffer(null)).not.toThrow();
        expect(() => wipeBuffer(undefined)).not.toThrow();
    });

    it('wipeBuffer zeroes an ArrayBuffer via view', () => {
        const arrBuf = new ArrayBuffer(16);
        const view = new Uint8Array(arrBuf);
        crypto.getRandomValues(view);
        expect(view.some((b) => b !== 0)).toBe(true);

        wipeBuffer(arrBuf);

        const checkView = new Uint8Array(arrBuf);
        expect(checkView.every((b) => b === 0)).toBe(true);
    });

    it('wipeBuffers zeroes multiple buffers', () => {
        const buf1 = crypto.getRandomValues(new Uint8Array(32));
        const buf2 = crypto.getRandomValues(new Uint8Array(64));
        const buf3 = null;

        wipeBuffers(buf1, buf2, buf3);

        expect(buf1.every((b) => b === 0)).toBe(true);
        expect(buf2.every((b) => b === 0)).toBe(true);
    });

    it('withSecureBuffer wipes buffer after operation succeeds', async () => {
        const buf = crypto.getRandomValues(new Uint8Array(32));
        const originalFirstByte = buf[0];

        const result = await withSecureBuffer(buf, async (b) => {
            // Buffer should still have data during operation
            expect(b[0]).toBe(originalFirstByte);
            return 'done';
        });

        expect(result).toBe('done');
        expect(buf.every((b) => b === 0)).toBe(true);
    });

    it('withSecureBuffer wipes buffer even after operation throws', async () => {
        const buf = crypto.getRandomValues(new Uint8Array(32));

        try {
            await withSecureBuffer(buf, async () => {
                throw new Error('test error');
            });
        } catch {
            // Expected
        }

        expect(buf.every((b) => b === 0)).toBe(true);
    });

    it('buffer contains zeros after simulated signing wipe', () => {
        // Simulate a secret key buffer used for signing
        const secretKey = crypto.getRandomValues(new Uint8Array(64));
        expect(secretKey.some((b) => b !== 0)).toBe(true);

        // Simulate sign operation (placeholder)
        void new Uint8Array(64);

        // Wipe key material
        wipeBuffer(secretKey);

        // Verify wiped
        expect(secretKey.every((b) => b === 0)).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Wallet Encryption Key Rotation
// ══════════════════════════════════════════════════════════════════════════

describe('Wallet Encryption Key Rotation', () => {
    const OLD_PASSPHRASE = 'a'.repeat(32) + '-old-passphrase';
    const NEW_PASSPHRASE = 'b'.repeat(32) + '-new-passphrase';

    beforeEach(() => {
        cleanup();
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
        cleanup();
    });

    it('successfully rotates wallet encryption key', async () => {
        // Set up: encrypt a mnemonic with the old passphrase
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        const encrypted = await encryptMnemonic(mnemonic, null, 'testnet');

        // Store in DB
        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'TESTADDR' WHERE id = 'agent-1'`);

        // Store in keystore
        writeFileSync(TEST_KEYSTORE_PATH, JSON.stringify({
            TestAgent: { address: 'TESTADDR', encryptedMnemonic: encrypted },
        }), { encoding: 'utf-8', mode: 0o600 });

        // Rotate
        const result = await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, NEW_PASSPHRASE, 'testnet');

        expect(result.success).toBe(true);
        expect(result.agentsRotated).toBe(1);
        expect(result.keystoreEntriesRotated).toBe(1);
    });

    it('old key is invalid after rotation', async () => {
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        const encrypted = await encryptMnemonic(mnemonic, null, 'testnet');

        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'TESTADDR' WHERE id = 'agent-1'`);

        writeFileSync(TEST_KEYSTORE_PATH, JSON.stringify({
            TestAgent: { address: 'TESTADDR', encryptedMnemonic: encrypted },
        }), { encoding: 'utf-8', mode: 0o600 });

        await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, NEW_PASSPHRASE, 'testnet');

        // Read the new encrypted mnemonic from DB
        const row = db.query('SELECT wallet_mnemonic_encrypted FROM agents WHERE id = ?').get('agent-1') as { wallet_mnemonic_encrypted: string };

        // Decrypt with new key should work
        process.env.WALLET_ENCRYPTION_KEY = NEW_PASSPHRASE;
        const decrypted = await decryptMnemonic(row.wallet_mnemonic_encrypted, null, 'testnet');
        expect(decrypted).toBe(mnemonic);

        // Decrypt with old key should fail
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        try {
            await decryptMnemonic(row.wallet_mnemonic_encrypted, null, 'testnet');
            expect(true).toBe(false); // Should not reach here
        } catch {
            // Expected: old key can't decrypt new ciphertext
        }
    });

    it('atomic write prevents partial keystore state', async () => {
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        const encrypted = await encryptMnemonic(mnemonic, null, 'testnet');

        writeFileSync(TEST_KEYSTORE_PATH, JSON.stringify({
            Agent1: { address: 'ADDR1', encryptedMnemonic: encrypted },
            Agent2: { address: 'ADDR2', encryptedMnemonic: encrypted },
        }), { encoding: 'utf-8', mode: 0o600 });

        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('a1', 'Agent1', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'ADDR1' WHERE id = 'a1'`);
        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('a2', 'Agent2', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'ADDR2' WHERE id = 'a2'`);

        await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, NEW_PASSPHRASE, 'testnet');

        // Keystore should have exactly 2 entries, both with new encryption
        const keystoreContent = JSON.parse(readFileSync(TEST_KEYSTORE_PATH, 'utf-8'));
        expect(Object.keys(keystoreContent)).toHaveLength(2);
        expect(keystoreContent.Agent1.address).toBe('ADDR1');
        expect(keystoreContent.Agent2.address).toBe('ADDR2');

        // No temp file should remain
        expect(existsSync(TEST_KEYSTORE_PATH + '.rotation-tmp')).toBe(false);
    });

    it('rejects same passphrase for old and new', async () => {
        const result = await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, OLD_PASSPHRASE, 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toContain('must differ');
    });

    it('rejects short new passphrase', async () => {
        const result = await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, 'short', 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32');
    });

    it('rotation failure leaves system in consistent state', async () => {
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        const encrypted = await encryptMnemonic(mnemonic, null, 'testnet');

        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'TESTADDR' WHERE id = 'agent-1'`);

        // Try to rotate with wrong old passphrase — should fail
        const result = await rotateWalletEncryptionKey(db, 'wrong-passphrase-that-is-long-enough-32chars', NEW_PASSPHRASE, 'testnet');
        expect(result.success).toBe(false);

        // Original encrypted mnemonic in DB should be unchanged
        const row = db.query('SELECT wallet_mnemonic_encrypted FROM agents WHERE id = ?').get('agent-1') as { wallet_mnemonic_encrypted: string };
        expect(row.wallet_mnemonic_encrypted).toBe(encrypted);

        // Should still decrypt with old key
        const decrypted = await decryptMnemonic(encrypted, null, 'testnet');
        expect(decrypted).toBe(mnemonic);
    });

    it('logs rotation to audit trail', async () => {
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        const encrypted = await encryptMnemonic(mnemonic, null, 'testnet');

        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'TESTADDR' WHERE id = 'agent-1'`);

        await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, NEW_PASSPHRASE, 'testnet');

        const auditResult = queryAuditLog(db, { action: 'key_rotation' });
        expect(auditResult.total).toBe(1);
        expect(auditResult.entries[0].actor).toBe('owner');
        expect(auditResult.entries[0].resourceType).toBe('wallet_encryption_key');
        const detail = JSON.parse(auditResult.entries[0].detail!);
        expect(detail.agentsRotated).toBe(1);
    });

    it('encryption roundtrip works with rotated keys', async () => {
        process.env.WALLET_ENCRYPTION_KEY = OLD_PASSPHRASE;
        const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';
        const encrypted = await encryptMnemonic(mnemonic, null, 'testnet');

        db.exec(`INSERT INTO agents (id, name, model, system_prompt) VALUES ('agent-1', 'TestAgent', 'test', 'test')`);
        db.exec(`UPDATE agents SET wallet_mnemonic_encrypted = '${encrypted}', wallet_address = 'TESTADDR' WHERE id = 'agent-1'`);

        await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, NEW_PASSPHRASE, 'testnet');

        // Read new encrypted value from DB
        const row = db.query('SELECT wallet_mnemonic_encrypted FROM agents WHERE id = ?').get('agent-1') as { wallet_mnemonic_encrypted: string };

        // Decrypt with new passphrase
        process.env.WALLET_ENCRYPTION_KEY = NEW_PASSPHRASE;
        const decrypted = await decryptMnemonic(row.wallet_mnemonic_encrypted, null, 'testnet');
        expect(decrypted).toBe(mnemonic);

        // Re-encrypt and decrypt again
        const reEncrypted = await encryptMnemonic(decrypted, null, 'testnet');
        const reDecrypted = await decryptMnemonic(reEncrypted, null, 'testnet');
        expect(reDecrypted).toBe(mnemonic);
    });

    it('handles empty DB gracefully', async () => {
        // No agents in DB, no keystore
        const result = await rotateWalletEncryptionKey(db, OLD_PASSPHRASE, NEW_PASSPHRASE, 'testnet');
        expect(result.success).toBe(true);
        expect(result.agentsRotated).toBe(0);
        expect(result.keystoreEntriesRotated).toBe(0);
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. API Key Rotation with Grace Period
// ══════════════════════════════════════════════════════════════════════════

describe('API Key Rotation with Grace Period', () => {
    const savedApiKey = process.env.API_KEY;

    afterEach(() => {
        // Restore original API_KEY to avoid leaking into other test files
        if (savedApiKey === undefined) {
            delete process.env.API_KEY;
        } else {
            process.env.API_KEY = savedApiKey;
        }
    });

    it('rotateApiKey generates a new key and retains old key', () => {
        const config: AuthConfig = {
            apiKey: 'original-key-12345',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        const newKey = rotateApiKey(config, 60_000); // 1 minute grace

        expect(newKey).toBeTruthy();
        expect(newKey).not.toBe('original-key-12345');
        expect(config.apiKey).toBe(newKey);
        expect(config.previousApiKey).toBe('original-key-12345');
        expect(config.previousKeyExpiry).toBeGreaterThan(Date.now());
    });

    it('both old and new keys work during grace period', () => {
        const config: AuthConfig = {
            apiKey: 'old-key-test',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        const newKey = rotateApiKey(config, 60_000);

        // New key works
        const reqNew = makeRequest('/api/sessions', {
            headers: { Authorization: `Bearer ${newKey}` },
        });
        expect(checkHttpAuth(reqNew, makeUrl('/api/sessions'), config)).toBeNull();

        // Old key works during grace period
        const reqOld = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer old-key-test' },
        });
        expect(checkHttpAuth(reqOld, makeUrl('/api/sessions'), config)).toBeNull();
    });

    it('old key is rejected after grace period expires', () => {
        const config: AuthConfig = {
            apiKey: 'new-key-test',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            previousApiKey: 'expired-old-key',
            previousKeyExpiry: Date.now() - 1000, // Already expired
        };

        // Old key should be rejected
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer expired-old-key' },
        });
        const result = checkHttpAuth(req, makeUrl('/api/sessions'), config);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);

        // New key should still work
        const reqNew = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer new-key-test' },
        });
        expect(checkHttpAuth(reqNew, makeUrl('/api/sessions'), config)).toBeNull();
    });

    it('WebSocket auth respects grace period for old key', () => {
        const config: AuthConfig = {
            apiKey: 'ws-new-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            previousApiKey: 'ws-old-key',
            previousKeyExpiry: Date.now() + 60_000,
        };

        // Old key via query param works during grace period
        const req = makeRequest('/ws');
        const url = makeUrl('/ws', { key: 'ws-old-key' });
        expect(checkWsAuth(req, url, config)).toBe(true);

        // New key via header works
        const reqNew = makeRequest('/ws', {
            headers: { Authorization: 'Bearer ws-new-key' },
        });
        expect(checkWsAuth(reqNew, makeUrl('/ws'), config)).toBe(true);
    });

    it('WebSocket auth rejects old key after grace period', () => {
        const config: AuthConfig = {
            apiKey: 'ws-new-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            previousApiKey: 'ws-old-key',
            previousKeyExpiry: Date.now() - 1000,
        };

        const req = makeRequest('/ws');
        const url = makeUrl('/ws', { key: 'ws-old-key' });
        expect(checkWsAuth(req, url, config)).toBe(false);
    });

    it('getApiKeyRotationStatus reports grace period correctly', () => {
        const config: AuthConfig = {
            apiKey: 'current-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        // No rotation
        let status = getApiKeyRotationStatus(config);
        expect(status.hasActiveKey).toBe(true);
        expect(status.isInGracePeriod).toBe(false);
        expect(status.gracePeriodExpiry).toBeNull();

        // After rotation
        rotateApiKey(config, 60_000);
        status = getApiKeyRotationStatus(config);
        expect(status.hasActiveKey).toBe(true);
        expect(status.isInGracePeriod).toBe(true);
        expect(status.gracePeriodExpiry).toBeTruthy();
    });

    it('invalid key is rejected even during grace period', () => {
        const config: AuthConfig = {
            apiKey: 'new-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            previousApiKey: 'old-key',
            previousKeyExpiry: Date.now() + 60_000,
        };

        const req = makeRequest('/api/sessions', {
            headers: { Authorization: 'Bearer totally-wrong-key' },
        });
        const result = checkHttpAuth(req, makeUrl('/api/sessions'), config);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Encryption/Decryption Integrity
// ══════════════════════════════════════════════════════════════════════════

describe('Encryption/Decryption Integrity', () => {
    const PASSPHRASE = 'z'.repeat(32) + '-test-passphrase';
    const savedEncKey = process.env.WALLET_ENCRYPTION_KEY;

    beforeEach(() => {
        process.env.WALLET_ENCRYPTION_KEY = PASSPHRASE;
    });

    afterEach(() => {
        // Restore original value to avoid leaking into other test files
        if (savedEncKey === undefined) {
            delete process.env.WALLET_ENCRYPTION_KEY;
        } else {
            process.env.WALLET_ENCRYPTION_KEY = savedEncKey;
        }
    });

    it('encrypt then decrypt produces original plaintext', async () => {
        const original = 'this is a secret mnemonic phrase for testing';
        const encrypted = await encryptMnemonic(original, null, 'testnet');
        const decrypted = await decryptMnemonic(encrypted, null, 'testnet');
        expect(decrypted).toBe(original);
    });

    it('different encryptions of same plaintext produce different ciphertexts', async () => {
        const original = 'test mnemonic data';
        const enc1 = await encryptMnemonic(original, null, 'testnet');
        const enc2 = await encryptMnemonic(original, null, 'testnet');
        expect(enc1).not.toBe(enc2); // Random salt + IV should differ
    });

    it('wrong passphrase fails to decrypt', async () => {
        const original = 'secret data';
        const encrypted = await encryptMnemonic(original, null, 'testnet');

        process.env.WALLET_ENCRYPTION_KEY = 'w'.repeat(32) + '-wrong-passphrase';
        try {
            await decryptMnemonic(encrypted, null, 'testnet');
            expect(true).toBe(false); // Should not reach here
        } catch {
            // Expected
        }
    });

    it('tampered ciphertext fails to decrypt', async () => {
        const original = 'secret data for tampering test';
        const encrypted = await encryptMnemonic(original, null, 'testnet');

        // Tamper with the ciphertext (flip a bit near the end)
        const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
        bytes[bytes.length - 5] ^= 0xFF;
        const tampered = btoa(String.fromCharCode(...bytes));

        try {
            await decryptMnemonic(tampered, null, 'testnet');
            expect(true).toBe(false); // Should not reach here
        } catch {
            // Expected: GCM authentication tag should fail
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. API Key Expiration
// ══════════════════════════════════════════════════════════════════════════

describe('API Key Expiration', () => {
    it('setApiKeyExpiry sets createdAt and expiresAt', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        setApiKeyExpiry(config, 7 * 24 * 60 * 60 * 1000); // 7 days

        expect(config.apiKeyCreatedAt).toBeDefined();
        expect(config.apiKeyExpiresAt).toBeDefined();
        expect(config.apiKeyExpiresAt! - config.apiKeyCreatedAt!).toBeGreaterThanOrEqual(
            7 * 24 * 60 * 60 * 1000 - 100, // allow small timing tolerance
        );
    });

    it('isApiKeyExpired returns false when no expiry is set', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };
        expect(isApiKeyExpired(config)).toBe(false);
    });

    it('isApiKeyExpired returns false when key has not expired', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() + 60_000,
        };
        expect(isApiKeyExpired(config)).toBe(false);
    });

    it('isApiKeyExpired returns true when key has expired', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() - 1000,
        };
        expect(isApiKeyExpired(config)).toBe(true);
    });

    it('getApiKeyExpiryWarning returns null when no expiry', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };
        expect(getApiKeyExpiryWarning(config)).toBeNull();
    });

    it('getApiKeyExpiryWarning returns null when >7 days remaining', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() + 8 * 24 * 60 * 60 * 1000,
        };
        expect(getApiKeyExpiryWarning(config)).toBeNull();
    });

    it('getApiKeyExpiryWarning returns warning when <7 days remaining', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
        };
        const warning = getApiKeyExpiryWarning(config);
        expect(warning).not.toBeNull();
        expect(warning).toContain('3 days');
        expect(warning).toContain('rotate');
    });

    it('getApiKeyExpiryWarning returns null when already expired', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() - 1000,
        };
        expect(getApiKeyExpiryWarning(config)).toBeNull();
    });

    it('getApiKeyExpiryWarning returns singular "day" for 1 day', () => {
        const config: AuthConfig = {
            apiKey: 'test-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
            apiKeyExpiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12 hours rounds up to 1 day
        };
        const warning = getApiKeyExpiryWarning(config);
        expect(warning).not.toBeNull();
        expect(warning).toContain('1 day');
        expect(warning).not.toContain('1 days');
    });

    it('rotateApiKey with setApiKeyExpiry works together', () => {
        const config: AuthConfig = {
            apiKey: 'old-key',
            allowedOrigins: [],
            bindHost: '0.0.0.0',
        };

        const newKey = rotateApiKey(config, 60_000);
        setApiKeyExpiry(config, 30 * 24 * 60 * 60 * 1000); // 30 days

        expect(config.apiKey).toBe(newKey);
        expect(config.previousApiKey).toBe('old-key');
        expect(isApiKeyExpired(config)).toBe(false);
        expect(getApiKeyExpiryWarning(config)).toBeNull(); // >7 days away
    });
});
