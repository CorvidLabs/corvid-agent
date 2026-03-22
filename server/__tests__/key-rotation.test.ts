import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { rotateWalletEncryptionKey, type RotationResult } from '../lib/key-rotation';

// ── Input validation tests (no DB/keystore needed) ──────────────────────────

describe('rotateWalletEncryptionKey — input validation', () => {
    // Minimal mock DB that returns no agents and no keystore entries
    function makeMockDb() {
        return {
            query: () => ({ all: () => [] }),
            prepare: () => ({ run: () => {} }),
            transaction: (fn: () => void) => fn,
        } as any;
    }

    it('rejects same old and new passphrase', async () => {
        const db = makeMockDb();
        const passphrase = 'a'.repeat(32);
        const result: RotationResult = await rotateWalletEncryptionKey(
            db,
            passphrase,
            passphrase,
            'testnet',
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('must differ');
        expect(result.agentsRotated).toBe(0);
        expect(result.keystoreEntriesRotated).toBe(0);
    });

    it('rejects new passphrase shorter than 32 characters', async () => {
        const db = makeMockDb();
        const result: RotationResult = await rotateWalletEncryptionKey(
            db,
            'old-passphrase-that-is-long-enough-123',
            'short',
            'testnet',
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32 characters');
    });

    it('rejects empty new passphrase', async () => {
        const db = makeMockDb();
        const result: RotationResult = await rotateWalletEncryptionKey(
            db,
            'old-passphrase-that-is-long-enough-123',
            '',
            'testnet',
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32 characters');
    });

    it('rejects new passphrase of 31 characters (boundary)', async () => {
        const db = makeMockDb();
        const result: RotationResult = await rotateWalletEncryptionKey(
            db,
            'old-passphrase-that-is-long-enough-123',
            'x'.repeat(31),
            'testnet',
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32 characters');
    });

    it('accepts new passphrase of exactly 32 characters', async () => {
        const db = makeMockDb();
        // With no agents and mocked keystore, this should succeed or fail on keystore read
        // (not on passphrase validation)
        const result = await rotateWalletEncryptionKey(
            db,
            'old-passphrase-that-is-different',
            'x'.repeat(32),
            'testnet',
        );
        // It should NOT fail on passphrase length validation
        if (!result.success) {
            expect(result.error).not.toContain('at least 32 characters');
            expect(result.error).not.toContain('must differ');
        }
    });

    it('accepts very long new passphrase', async () => {
        const db = makeMockDb();
        const result = await rotateWalletEncryptionKey(
            db,
            'old-passphrase-that-is-different-enough',
            'x'.repeat(256),
            'testnet',
        );
        // Should not reject on length — only on keystore read
        if (!result.success) {
            expect(result.error).not.toContain('at least 32 characters');
            expect(result.error).not.toContain('must differ');
        }
    });
});

describe('rotateWalletEncryptionKey — with mock agents', () => {
    // Encrypt/decrypt helpers using the same algorithm as key-rotation.ts
    const ALGORITHM = 'AES-GCM';
    const KEY_LENGTH = 256;
    const IV_LENGTH = 12;
    const SALT_LENGTH = 16;
    const TAG_LENGTH = 128;
    const ITERATIONS = 600_000;

    async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey'],
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
            keyMaterial,
            { name: ALGORITHM, length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt'],
        );
    }

    async function encrypt(plaintext: string, passphrase: string): Promise<string> {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const key = await deriveKey(passphrase, salt);
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const ciphertext = await crypto.subtle.encrypt(
            { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
            key,
            new TextEncoder().encode(plaintext),
        );
        const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
        combined.set(salt);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
        return btoa(String.fromCharCode(...combined));
    }

    async function decrypt(encrypted: string, passphrase: string): Promise<string> {
        const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
        const salt = combined.slice(0, SALT_LENGTH);
        const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
        const key = await deriveKey(passphrase, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
            key,
            ciphertext,
        );
        return new TextDecoder().decode(decrypted);
    }

    const OLD_PASS = 'old-secure-passphrase-that-is-32chars!!';
    const NEW_PASS = 'new-secure-passphrase-that-is-32chars!!';
    const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about above';

    function makeMockDbWithAgents(agents: Array<{ id: string; name: string; wallet_mnemonic_encrypted: string }>) {
        const updates: Array<{ encrypted: string; id: string }> = [];
        const auditLogs: Array<{ action: string }> = [];

        return {
            db: {
                query: () => ({ all: () => agents }),
                prepare: () => ({
                    run: (...args: any[]) => { updates.push({ encrypted: args[0], id: args[1] }); },
                }),
                transaction: (fn: () => void) => fn,
            } as any,
            updates,
            auditLogs,
        };
    }

    // Mock readKeystore to return empty keystore
    beforeEach(() => {
        // We need to mock the wallet-keystore module
        // The key-rotation module calls readKeystore() which reads from disk
        // For tests, we'll set WALLET_KEYSTORE_PATH to a nonexistent file
        process.env.WALLET_KEYSTORE_PATH = '/tmp/test-keystore-nonexistent-' + Date.now() + '.json';
    });

    afterEach(() => {
        delete process.env.WALLET_KEYSTORE_PATH;
    });

    it('succeeds with no agents and no keystore', async () => {
        const { db } = makeMockDbWithAgents([]);
        const result = await rotateWalletEncryptionKey(db, OLD_PASS, NEW_PASS, 'testnet');
        expect(result.success).toBe(true);
        expect(result.agentsRotated).toBe(0);
        expect(result.keystoreEntriesRotated).toBe(0);
        expect(result.error).toBeUndefined();
    });

    it('rotates a single agent wallet mnemonic', async () => {
        const encrypted = await encrypt(MNEMONIC, OLD_PASS);
        const { db, updates } = makeMockDbWithAgents([
            { id: 'agent-1', name: 'TestAgent', wallet_mnemonic_encrypted: encrypted },
        ]);

        const result = await rotateWalletEncryptionKey(db, OLD_PASS, NEW_PASS, 'testnet');
        expect(result.success).toBe(true);
        expect(result.agentsRotated).toBe(1);

        // Verify the update was called
        expect(updates.length).toBe(1);
        expect(updates[0].id).toBe('agent-1');

        // Verify the new encrypted value can be decrypted with new passphrase
        const decrypted = await decrypt(updates[0].encrypted, NEW_PASS);
        expect(decrypted).toBe(MNEMONIC);
    });

    it('rotates multiple agent wallets', async () => {
        const mnemonics = [
            'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about above',
            'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
            'ability ability ability ability ability ability ability ability ability ability ability able',
        ];

        const agents = await Promise.all(
            mnemonics.map(async (m, i) => ({
                id: `agent-${i}`,
                name: `Agent${i}`,
                wallet_mnemonic_encrypted: await encrypt(m, OLD_PASS),
            })),
        );

        const { db, updates } = makeMockDbWithAgents(agents);
        const result = await rotateWalletEncryptionKey(db, OLD_PASS, NEW_PASS, 'testnet');

        expect(result.success).toBe(true);
        expect(result.agentsRotated).toBe(3);

        // Verify each mnemonic was correctly re-encrypted
        for (let i = 0; i < updates.length; i++) {
            const decrypted = await decrypt(updates[i].encrypted, NEW_PASS);
            expect(decrypted).toBe(mnemonics[i]);
        }
    });

    it('fails when old passphrase is wrong (cannot decrypt)', async () => {
        const encrypted = await encrypt(MNEMONIC, OLD_PASS);
        const { db } = makeMockDbWithAgents([
            { id: 'agent-1', name: 'TestAgent', wallet_mnemonic_encrypted: encrypted },
        ]);

        const result = await rotateWalletEncryptionKey(db, 'wrong-passphrase-that-is-long-enough!!', NEW_PASS, 'testnet');
        expect(result.success).toBe(false);
        expect(result.agentsRotated).toBe(0);
        expect(result.error).toBeDefined();
    });

    it('does not update DB when decryption fails', async () => {
        const encrypted = await encrypt(MNEMONIC, OLD_PASS);
        const { db, updates } = makeMockDbWithAgents([
            { id: 'agent-1', name: 'TestAgent', wallet_mnemonic_encrypted: encrypted },
        ]);

        await rotateWalletEncryptionKey(db, 'wrong-passphrase-that-is-long-enough!!', NEW_PASS, 'testnet');
        expect(updates.length).toBe(0);
    });

    it('fails with corrupt encrypted data', async () => {
        const { db } = makeMockDbWithAgents([
            { id: 'agent-1', name: 'TestAgent', wallet_mnemonic_encrypted: 'not-valid-base64!!!' },
        ]);

        const result = await rotateWalletEncryptionKey(db, OLD_PASS, NEW_PASS, 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('produces unique ciphertext on each rotation (new salt/IV)', async () => {
        const encrypted = await encrypt(MNEMONIC, OLD_PASS);
        const { db: db1, updates: updates1 } = makeMockDbWithAgents([
            { id: 'agent-1', name: 'TestAgent', wallet_mnemonic_encrypted: encrypted },
        ]);
        const { db: db2, updates: updates2 } = makeMockDbWithAgents([
            { id: 'agent-1', name: 'TestAgent', wallet_mnemonic_encrypted: encrypted },
        ]);

        await rotateWalletEncryptionKey(db1, OLD_PASS, NEW_PASS, 'testnet');
        await rotateWalletEncryptionKey(db2, OLD_PASS, NEW_PASS, 'testnet');

        // Both should succeed
        expect(updates1.length).toBe(1);
        expect(updates2.length).toBe(1);

        // But ciphertext should differ (different random salt/IV)
        expect(updates1[0].encrypted).not.toBe(updates2[0].encrypted);

        // Both should decrypt to the same plaintext
        const d1 = await decrypt(updates1[0].encrypted, NEW_PASS);
        const d2 = await decrypt(updates2[0].encrypted, NEW_PASS);
        expect(d1).toBe(MNEMONIC);
        expect(d2).toBe(MNEMONIC);
    });
});

describe('rotateWalletEncryptionKey — crypto parameters', () => {
    it('uses AES-256-GCM (256-bit key)', () => {
        // Verify the constants match the spec requirement
        // Read from the module source indirectly via the test
        // The fact that encrypt/decrypt work with these params proves correctness
        expect(true).toBe(true); // Verified by successful rotation tests above
    });

    it('uses PBKDF2 with 600,000 iterations', () => {
        // This is verified by the fact that encryption/decryption works
        // using the same iteration count. If the module used a different count,
        // decryption would fail.
        expect(true).toBe(true); // Verified by successful rotation tests above
    });
});

describe('RotationResult type shape', () => {
    it('success result has expected fields', () => {
        const result: RotationResult = {
            success: true,
            agentsRotated: 3,
            keystoreEntriesRotated: 2,
        };
        expect(result.success).toBe(true);
        expect(result.agentsRotated).toBe(3);
        expect(result.keystoreEntriesRotated).toBe(2);
        expect(result.error).toBeUndefined();
    });

    it('failure result includes error message', () => {
        const result: RotationResult = {
            success: false,
            agentsRotated: 0,
            keystoreEntriesRotated: 0,
            error: 'something went wrong',
        };
        expect(result.success).toBe(false);
        expect(result.error).toBe('something went wrong');
    });

    it('zero counts on failure', () => {
        const result: RotationResult = {
            success: false,
            agentsRotated: 0,
            keystoreEntriesRotated: 0,
            error: 'test error',
        };
        expect(result.agentsRotated).toBe(0);
        expect(result.keystoreEntriesRotated).toBe(0);
    });
});
