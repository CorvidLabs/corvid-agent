import { describe, test, expect } from 'bun:test';
import { rotateWalletEncryptionKey } from '../lib/key-rotation';

// Minimal mock DB with no agents and no keystore
function createMockDb(agentRows: unknown[] = []) {
    const updates: Array<{ encrypted: string; id: string }> = [];
    return {
        db: {
            query: (_sql: string) => ({
                all: () => agentRows,
                run: () => {},
            }),
            prepare: () => ({
                run: (...args: unknown[]) => {
                    updates.push({ encrypted: args[0] as string, id: args[1] as string });
                },
            }),
            transaction: (fn: () => void) => fn,
        } as unknown as import('bun:sqlite').Database,
        updates,
    };
}

describe('rotateWalletEncryptionKey', () => {
    test('rejects when old and new passphrases are identical', async () => {
        const { db } = createMockDb();
        const passphrase = 'a'.repeat(32);
        const result = await rotateWalletEncryptionKey(db, passphrase, passphrase, 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toContain('must differ');
    });

    test('rejects when new passphrase is too short (< 32 chars)', async () => {
        const { db } = createMockDb();
        const result = await rotateWalletEncryptionKey(db, 'old-passphrase-long-enough-32chars!', 'short', 'testnet');
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32 characters');
    });

    test('rejects passphrase of exactly 31 characters', async () => {
        const { db } = createMockDb();
        const result = await rotateWalletEncryptionKey(
            db,
            'a'.repeat(32),
            'a'.repeat(31),
            'testnet',
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('at least 32 characters');
    });

    test('returns correct structure on validation failure', async () => {
        const { db } = createMockDb();
        const result = await rotateWalletEncryptionKey(db, 'same', 'same', 'testnet');
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('agentsRotated');
        expect(result).toHaveProperty('keystoreEntriesRotated');
        expect(result).toHaveProperty('error');
        expect(result.agentsRotated).toBe(0);
        expect(result.keystoreEntriesRotated).toBe(0);
    });
});
