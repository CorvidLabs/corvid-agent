import { describe, it, expect, afterAll } from 'bun:test';
import { SecureMemoryManager } from '../lib/secure-memory';

afterAll(() => {
    SecureMemoryManager.stop();
});

describe('SecureMemoryManager AES-256-GCM Encryption', () => {
    const passphrase = 'test-passphrase-for-unit-tests';

    describe('encrypt / decrypt roundtrip', () => {
        it('should encrypt and decrypt a simple string', async () => {
            const plaintext = 'hello world';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);
            const decrypted = await SecureMemoryManager.decrypt(encrypted, passphrase);

            expect(decrypted).toBe(plaintext);
        });

        it('should encrypt and decrypt a mnemonic phrase', async () => {
            const mnemonic =
                'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
            const encrypted = await SecureMemoryManager.encrypt(mnemonic, passphrase);
            const decrypted = await SecureMemoryManager.decrypt(encrypted, passphrase);

            expect(decrypted).toBe(mnemonic);
        });

        it('should encrypt and decrypt an empty string', async () => {
            const encrypted = await SecureMemoryManager.encrypt('', passphrase);
            const decrypted = await SecureMemoryManager.decrypt(encrypted, passphrase);

            expect(decrypted).toBe('');
        });

        it('should encrypt and decrypt unicode content', async () => {
            const plaintext = '🔑 clé secrète — 密码 — пароль';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);
            const decrypted = await SecureMemoryManager.decrypt(encrypted, passphrase);

            expect(decrypted).toBe(plaintext);
        });

        it('should handle long plaintexts', async () => {
            const plaintext = 'a'.repeat(10_000);
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);
            const decrypted = await SecureMemoryManager.decrypt(encrypted, passphrase);

            expect(decrypted).toBe(plaintext);
        });
    });

    describe('wrong key rejection', () => {
        it('should reject decryption with wrong passphrase', async () => {
            const plaintext = 'sensitive mnemonic data';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);

            await expect(
                SecureMemoryManager.decrypt(encrypted, 'wrong-passphrase'),
            ).rejects.toThrow('Decryption failed: wrong key or tampered ciphertext');
        });

        it('should reject decryption with empty passphrase', async () => {
            const plaintext = 'sensitive data';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);

            await expect(
                SecureMemoryManager.decrypt(encrypted, ''),
            ).rejects.toThrow('Decryption failed: wrong key or tampered ciphertext');
        });

        it('should reject decryption with similar but different passphrase', async () => {
            const plaintext = 'sensitive data';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, 'correct-key');

            await expect(
                SecureMemoryManager.decrypt(encrypted, 'correct-key!'),
            ).rejects.toThrow('Decryption failed: wrong key or tampered ciphertext');
        });
    });

    describe('tampered ciphertext detection', () => {
        it('should detect a flipped bit in the ciphertext body', async () => {
            const plaintext = 'tamper test data';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);

            // Decode, flip a byte in the ciphertext portion, re-encode
            const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
            // Flip a byte well past the salt(16)+iv(12) header, in actual ciphertext
            const targetIndex = 30;
            bytes[targetIndex] ^= 0xff;
            const tampered = btoa(String.fromCharCode(...bytes));

            await expect(
                SecureMemoryManager.decrypt(tampered, passphrase),
            ).rejects.toThrow('Decryption failed: wrong key or tampered ciphertext');
        });

        it('should detect tampered IV', async () => {
            const plaintext = 'tamper IV test';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);

            const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
            // Flip a byte in the IV region (bytes 16-27)
            bytes[18] ^= 0xff;
            const tampered = btoa(String.fromCharCode(...bytes));

            await expect(
                SecureMemoryManager.decrypt(tampered, passphrase),
            ).rejects.toThrow('Decryption failed: wrong key or tampered ciphertext');
        });

        it('should detect tampered salt', async () => {
            const plaintext = 'tamper salt test';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);

            const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
            // Flip a byte in the salt region (bytes 0-15)
            bytes[5] ^= 0xff;
            const tampered = btoa(String.fromCharCode(...bytes));

            await expect(
                SecureMemoryManager.decrypt(tampered, passphrase),
            ).rejects.toThrow('Decryption failed: wrong key or tampered ciphertext');
        });

        it('should reject truncated ciphertext', async () => {
            const plaintext = 'truncation test';
            const encrypted = await SecureMemoryManager.encrypt(plaintext, passphrase);

            // Truncate to just the salt+IV (no ciphertext body)
            const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
            const truncated = btoa(String.fromCharCode(...bytes.slice(0, 28)));

            await expect(
                SecureMemoryManager.decrypt(truncated, passphrase),
            ).rejects.toThrow(); // Could be "data too short" or auth failure
        });

        it('should reject invalid base64 input', async () => {
            await expect(
                SecureMemoryManager.decrypt('not!valid!base64!!!', passphrase),
            ).rejects.toThrow('Invalid ciphertext');
        });

        it('should reject data that is too short', async () => {
            const tooShort = btoa('abc'); // Only a few bytes
            await expect(
                SecureMemoryManager.decrypt(tooShort, passphrase),
            ).rejects.toThrow('Invalid ciphertext: data too short');
        });
    });

    describe('IV uniqueness', () => {
        it('should produce different ciphertexts for the same plaintext', async () => {
            const plaintext = 'same data encrypted twice';

            const encrypted1 = await SecureMemoryManager.encrypt(plaintext, passphrase);
            const encrypted2 = await SecureMemoryManager.encrypt(plaintext, passphrase);

            // Ciphertexts must differ (different random salt+IV each time)
            expect(encrypted1).not.toBe(encrypted2);

            // But both must decrypt to the same plaintext
            const decrypted1 = await SecureMemoryManager.decrypt(encrypted1, passphrase);
            const decrypted2 = await SecureMemoryManager.decrypt(encrypted2, passphrase);
            expect(decrypted1).toBe(plaintext);
            expect(decrypted2).toBe(plaintext);
        });

        it('should use unique salt+IV pairs across many encryptions', async () => {
            const plaintext = 'iv uniqueness stress test';
            const count = 20;

            const ciphertexts = await Promise.all(
                Array.from({ length: count }, () =>
                    SecureMemoryManager.encrypt(plaintext, passphrase),
                ),
            );

            // All ciphertexts should be unique
            const unique = new Set(ciphertexts);
            expect(unique.size).toBe(count);

            // Extract salt+IV (first 28 bytes) from each — all should be unique
            const headers = ciphertexts.map((ct) => {
                const bytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
                return btoa(String.fromCharCode(...bytes.slice(0, 28)));
            });
            const uniqueHeaders = new Set(headers);
            expect(uniqueHeaders.size).toBe(count);
        });
    });

    describe('legacy encrypted_ prefix migration', () => {
        it('should decrypt legacy "encrypted_" prefix format', async () => {
            const legacyEncrypted = 'encrypted_my-secret-mnemonic-words';
            const decrypted = await SecureMemoryManager.decrypt(
                legacyEncrypted,
                'any-key-doesnt-matter',
            );

            expect(decrypted).toBe('my-secret-mnemonic-words');
        });

        it('should return empty string for "encrypted_" with no body', async () => {
            const decrypted = await SecureMemoryManager.decrypt('encrypted_', 'key');
            expect(decrypted).toBe('');
        });
    });

    describe('withPrivateKey integration', () => {
        it('should decrypt and provide mnemonic via SecureBuffer', async () => {
            const mnemonic = 'abandon abandon about';
            const key = 'wallet-encryption-key';

            // First encrypt
            const encrypted = await SecureMemoryManager.encrypt(mnemonic, key);

            // Then use withPrivateKey to decrypt and operate
            const result = await SecureMemoryManager.withPrivateKey(
                encrypted,
                key,
                (buffer) => {
                    return SecureMemoryManager.toString(buffer);
                },
            );

            expect(result).toBe(mnemonic);
        });

        it('should zero buffers after withPrivateKey completes', async () => {
            const mnemonic = 'test mnemonic phrase';
            const key = 'test-key';
            const encrypted = await SecureMemoryManager.encrypt(mnemonic, key);

            let capturedBuffer: any = null;

            await SecureMemoryManager.withPrivateKey(encrypted, key, (buffer) => {
                capturedBuffer = buffer;
                return 'done';
            });

            // Buffer should be zeroed after withPrivateKey returns
            expect(capturedBuffer).not.toBeNull();
            expect(capturedBuffer.isZeroed()).toBe(true);
        });

        it('should reject wrong key in withPrivateKey', async () => {
            const mnemonic = 'test phrase';
            const correctKey = 'correct-key';
            const wrongKey = 'wrong-key';
            const encrypted = await SecureMemoryManager.encrypt(mnemonic, correctKey);

            await expect(
                SecureMemoryManager.withPrivateKey(encrypted, wrongKey, () => 'should not reach'),
            ).rejects.toThrow('Decryption failed');
        });

        it('should handle legacy format in withPrivateKey', async () => {
            const legacyEncrypted = 'encrypted_legacy-mnemonic-words';

            const result = await SecureMemoryManager.withPrivateKey(
                legacyEncrypted,
                'any-key',
                (buffer) => SecureMemoryManager.toString(buffer),
            );

            expect(result).toBe('legacy-mnemonic-words');
        });
    });
});
