import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { EnvKeyProvider, createKeyProvider, type KeyProvider } from '../lib/key-provider';
import {
    encryptMnemonicWithPassphrase,
    decryptMnemonicWithPassphrase,
} from '../lib/crypto';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSPHRASE = 'test-encryption-key-for-unit-tests-32chars!';

describe('KeyProvider', () => {
    describe('EnvKeyProvider', () => {
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

        it('returns env var passphrase when set', async () => {
            process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
            const provider = new EnvKeyProvider('localnet');

            const passphrase = await provider.getEncryptionPassphrase();
            expect(passphrase).toBe(TEST_PASSPHRASE);
        });

        it('returns default key on localnet when no env var', async () => {
            delete process.env.WALLET_ENCRYPTION_KEY;
            const provider = new EnvKeyProvider('localnet');

            const passphrase = await provider.getEncryptionPassphrase();
            expect(passphrase).toBeTruthy();
            expect(typeof passphrase).toBe('string');
        });

        it('throws on testnet when no env var', async () => {
            delete process.env.WALLET_ENCRYPTION_KEY;
            const provider = new EnvKeyProvider('testnet');

            await expect(provider.getEncryptionPassphrase()).rejects.toThrow('WALLET_ENCRYPTION_KEY must be set');
        });

        it('throws on mainnet when no env var', async () => {
            delete process.env.WALLET_ENCRYPTION_KEY;
            const provider = new EnvKeyProvider('mainnet');

            await expect(provider.getEncryptionPassphrase()).rejects.toThrow('WALLET_ENCRYPTION_KEY must be set');
        });

        it('has providerType "env"', () => {
            const provider = new EnvKeyProvider();
            expect(provider.providerType).toBe('env');
        });

        it('dispose is safe to call multiple times', () => {
            const provider = new EnvKeyProvider();
            provider.dispose();
            provider.dispose();
            // No error thrown
        });
    });

    describe('createKeyProvider', () => {
        let originalKey: string | undefined;
        let originalAllow: string | undefined;

        beforeEach(() => {
            originalKey = process.env.WALLET_ENCRYPTION_KEY;
            originalAllow = process.env.ALLOW_PLAINTEXT_KEYS;
            process.env.WALLET_ENCRYPTION_KEY = TEST_PASSPHRASE;
        });

        afterEach(() => {
            if (originalKey === undefined) {
                delete process.env.WALLET_ENCRYPTION_KEY;
            } else {
                process.env.WALLET_ENCRYPTION_KEY = originalKey;
            }
            if (originalAllow === undefined) {
                delete process.env.ALLOW_PLAINTEXT_KEYS;
            } else {
                process.env.ALLOW_PLAINTEXT_KEYS = originalAllow;
            }
        });

        it('returns an EnvKeyProvider by default', () => {
            const provider = createKeyProvider('localnet');
            expect(provider).toBeInstanceOf(EnvKeyProvider);
        });

        it('returned provider resolves passphrase', async () => {
            const provider = createKeyProvider('localnet');
            const passphrase = await provider.getEncryptionPassphrase();
            expect(passphrase).toBe(TEST_PASSPHRASE);
        });

        it('throws on mainnet without ALLOW_PLAINTEXT_KEYS', () => {
            delete process.env.ALLOW_PLAINTEXT_KEYS;
            expect(() => createKeyProvider('mainnet')).toThrow('Refusing to start on mainnet');
        });

        it('allows mainnet with ALLOW_PLAINTEXT_KEYS=true', () => {
            process.env.ALLOW_PLAINTEXT_KEYS = 'true';
            const provider = createKeyProvider('mainnet');
            expect(provider).toBeInstanceOf(EnvKeyProvider);
        });

        it('allows mainnet with ALLOW_PLAINTEXT_KEYS=1', () => {
            process.env.ALLOW_PLAINTEXT_KEYS = '1';
            const provider = createKeyProvider('mainnet');
            expect(provider).toBeInstanceOf(EnvKeyProvider);
        });

        it('rejects mainnet with ALLOW_PLAINTEXT_KEYS=false', () => {
            process.env.ALLOW_PLAINTEXT_KEYS = 'false';
            expect(() => createKeyProvider('mainnet')).toThrow('Refusing to start on mainnet');
        });
    });

    describe('custom KeyProvider', () => {
        it('can implement the interface for testing', async () => {
            const customProvider: KeyProvider = {
                providerType: 'mock-kms',
                async getEncryptionPassphrase() {
                    return 'custom-test-passphrase-for-mock-kms';
                },
                dispose() {},
            };

            const passphrase = await customProvider.getEncryptionPassphrase();
            expect(passphrase).toBe('custom-test-passphrase-for-mock-kms');
        });
    });
});

describe('encryptMnemonicWithPassphrase / decryptMnemonicWithPassphrase', () => {
    it('encrypts and decrypts with explicit passphrase', async () => {
        const encrypted = await encryptMnemonicWithPassphrase(TEST_MNEMONIC, TEST_PASSPHRASE);
        expect(encrypted).not.toBe(TEST_MNEMONIC);
        expect(typeof encrypted).toBe('string');

        const decrypted = await decryptMnemonicWithPassphrase(encrypted, TEST_PASSPHRASE);
        expect(decrypted).toBe(TEST_MNEMONIC);
    });

    it('produces different ciphertexts for same input (random salt/IV)', async () => {
        const enc1 = await encryptMnemonicWithPassphrase(TEST_MNEMONIC, TEST_PASSPHRASE);
        const enc2 = await encryptMnemonicWithPassphrase(TEST_MNEMONIC, TEST_PASSPHRASE);
        expect(enc1).not.toBe(enc2);

        expect(await decryptMnemonicWithPassphrase(enc1, TEST_PASSPHRASE)).toBe(TEST_MNEMONIC);
        expect(await decryptMnemonicWithPassphrase(enc2, TEST_PASSPHRASE)).toBe(TEST_MNEMONIC);
    });

    it('fails to decrypt with wrong passphrase', async () => {
        const encrypted = await encryptMnemonicWithPassphrase(TEST_MNEMONIC, TEST_PASSPHRASE);
        await expect(
            decryptMnemonicWithPassphrase(encrypted, 'wrong-passphrase-that-will-fail'),
        ).rejects.toThrow();
    });

    it('output is valid base64', async () => {
        const encrypted = await encryptMnemonicWithPassphrase(TEST_MNEMONIC, TEST_PASSPHRASE);
        const decoded = atob(encrypted);
        expect(decoded.length).toBeGreaterThan(0);
    });

    it('round-trips through KeyProvider pattern', async () => {
        const provider: KeyProvider = {
            providerType: 'test',
            async getEncryptionPassphrase() {
                return TEST_PASSPHRASE;
            },
            dispose() {},
        };

        const passphrase = await provider.getEncryptionPassphrase();
        const encrypted = await encryptMnemonicWithPassphrase(TEST_MNEMONIC, passphrase);
        const decrypted = await decryptMnemonicWithPassphrase(encrypted, passphrase);
        expect(decrypted).toBe(TEST_MNEMONIC);
    });
});
