import { describe, it, expect } from 'bun:test';
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
});
