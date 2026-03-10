import { describe, it, expect } from 'bun:test';
import { rotateWalletEncryptionKey } from '../lib/key-rotation';

// We test the validation logic without needing a real DB.
// The function returns error results for invalid inputs before touching the DB.

describe('rotateWalletEncryptionKey', () => {
    const mockDb = {
        query: () => ({ all: () => [] }),
        prepare: () => ({ run: () => {} }),
        transaction: (fn: () => void) => fn,
    } as unknown as import('bun:sqlite').Database;

    it('rejects when old and new passphrases are the same', async () => {
        const passphrase = 'a'.repeat(32);
        const result = await rotateWalletEncryptionKey(mockDb, passphrase, passphrase, 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toContain('must differ');
        expect(result.agentsRotated).toBe(0);
        expect(result.keystoreEntriesRotated).toBe(0);
    });

    it('rejects new passphrase shorter than 32 characters', async () => {
        const result = await rotateWalletEncryptionKey(mockDb, 'old-passphrase-long-enough-32chars', 'short', 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32 characters');
    });

    it('accepts a new passphrase of exactly 32 characters', async () => {
        const oldPass = 'x'.repeat(32);
        const newPass = 'y'.repeat(32);
        // This will try to proceed and hit the readKeystore call, which may fail,
        // but it should NOT fail on the length validation
        const result = await rotateWalletEncryptionKey(mockDb, oldPass, newPass, 'testnet');
        // It will fail somewhere in the rotation process (no real keystore), but not on validation
        if (!result.success) {
            expect(result.error).not.toContain('at least 32 characters');
            expect(result.error).not.toContain('must differ');
        }
    });

    it('returns proper RotationResult shape', async () => {
        const result = await rotateWalletEncryptionKey(mockDb, 'old', 'new', 'testnet');
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('agentsRotated');
        expect(result).toHaveProperty('keystoreEntriesRotated');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.agentsRotated).toBe('number');
        expect(typeof result.keystoreEntriesRotated).toBe('number');
    });
});
