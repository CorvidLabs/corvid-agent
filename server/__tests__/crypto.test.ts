import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { encryptMnemonic, decryptMnemonic, getEncryptionPassphrase } from '../lib/crypto';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('encryptMnemonic / decryptMnemonic', () => {
    let originalKey: string | undefined;

    beforeEach(() => {
        originalKey = process.env.WALLET_ENCRYPTION_KEY;
        // Use a deterministic key for testing
        process.env.WALLET_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
    });

    afterEach(() => {
        if (originalKey === undefined) {
            delete process.env.WALLET_ENCRYPTION_KEY;
        } else {
            process.env.WALLET_ENCRYPTION_KEY = originalKey;
        }
    });

    it('encrypts and decrypts a mnemonic correctly', async () => {
        const encrypted = await encryptMnemonic(TEST_MNEMONIC);
        expect(encrypted).not.toBe(TEST_MNEMONIC);
        expect(typeof encrypted).toBe('string');

        const decrypted = await decryptMnemonic(encrypted);
        expect(decrypted).toBe(TEST_MNEMONIC);
    });

    it('produces different ciphertexts for same input (random salt/IV)', async () => {
        const enc1 = await encryptMnemonic(TEST_MNEMONIC);
        const enc2 = await encryptMnemonic(TEST_MNEMONIC);
        expect(enc1).not.toBe(enc2);

        // Both should decrypt to the same value
        expect(await decryptMnemonic(enc1)).toBe(TEST_MNEMONIC);
        expect(await decryptMnemonic(enc2)).toBe(TEST_MNEMONIC);
    });

    it('fails to decrypt with wrong key', async () => {
        const encrypted = await encryptMnemonic(TEST_MNEMONIC);

        process.env.WALLET_ENCRYPTION_KEY = 'completely-different-key-that-will-not-work';
        await expect(decryptMnemonic(encrypted)).rejects.toThrow();
    });

    it('output is valid base64', async () => {
        const encrypted = await encryptMnemonic(TEST_MNEMONIC);
        // atob should not throw on valid base64
        const decoded = atob(encrypted);
        expect(decoded.length).toBeGreaterThan(0);
    });

    it('encrypts empty string', async () => {
        const encrypted = await encryptMnemonic('');
        const decrypted = await decryptMnemonic(encrypted);
        expect(decrypted).toBe('');
    });

    it('handles unicode content', async () => {
        const unicodeContent = 'hello 🌍 world';
        const encrypted = await encryptMnemonic(unicodeContent);
        const decrypted = await decryptMnemonic(encrypted);
        expect(decrypted).toBe(unicodeContent);
    });
});

describe('getEncryptionPassphrase', () => {
    let originalKey: string | undefined;

    beforeEach(() => {
        originalKey = process.env.WALLET_ENCRYPTION_KEY;
        delete process.env.WALLET_ENCRYPTION_KEY;
    });

    afterEach(() => {
        if (originalKey === undefined) {
            delete process.env.WALLET_ENCRYPTION_KEY;
        } else {
            process.env.WALLET_ENCRYPTION_KEY = originalKey;
        }
    });

    it('uses WALLET_ENCRYPTION_KEY env var when set', () => {
        process.env.WALLET_ENCRYPTION_KEY = 'my-custom-key';
        expect(getEncryptionPassphrase('localnet')).toBe('my-custom-key');
    });

    it('trims whitespace from env key', () => {
        process.env.WALLET_ENCRYPTION_KEY = '  my-key  ';
        expect(getEncryptionPassphrase()).toBe('my-key');
    });

    it('throws on testnet without WALLET_ENCRYPTION_KEY', () => {
        expect(() => getEncryptionPassphrase('testnet')).toThrow('WALLET_ENCRYPTION_KEY must be set for testnet');
    });

    it('throws on mainnet without WALLET_ENCRYPTION_KEY', () => {
        expect(() => getEncryptionPassphrase('mainnet')).toThrow('WALLET_ENCRYPTION_KEY must be set for mainnet');
    });

    it('falls back to server mnemonic on localnet', () => {
        const passphrase = getEncryptionPassphrase('localnet', 'my-server-mnemonic');
        expect(passphrase).toBe('my-server-mnemonic');
    });

    it('uses default key on localnet with no server mnemonic', () => {
        const passphrase = getEncryptionPassphrase('localnet', null);
        expect(passphrase).toBe('corvid-agent-localnet-default-key');
    });

    it('prefers env key over server mnemonic', () => {
        process.env.WALLET_ENCRYPTION_KEY = 'env-key';
        const passphrase = getEncryptionPassphrase('localnet', 'server-mnemonic');
        expect(passphrase).toBe('env-key');
    });
});
