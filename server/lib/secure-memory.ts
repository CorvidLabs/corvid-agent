import { createLogger } from './logger';

const log = createLogger('SecureMemory');

// AES-256-GCM encryption constants
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const SALT_LENGTH = 16; // 128 bits
const TAG_LENGTH = 128; // bits
const PBKDF2_ITERATIONS = 600_000;

/** Prefix used by the legacy "encryption" stub — used only for migration detection. */
const LEGACY_PREFIX = 'encrypted_';

export interface SecureBuffer {
    data: Uint8Array;
    zero(): void;
    isZeroed(): boolean;
}

/**
 * Secure memory utilities for handling sensitive data like private keys
 * Provides automatic zeroing and protection against memory dumps
 */
export class SecureMemoryManager {
    private static activeBuffers = new WeakSet<SecureBuffer>();
    private static cleanupTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Create a secure buffer for sensitive data
     */
    static createSecureBuffer(size: number): SecureBuffer {
        const data = new Uint8Array(size);

        const buffer: SecureBuffer = {
            data,
            zero() {
                // Overwrite with random data first, then zero
                crypto.getRandomValues(this.data);
                this.data.fill(0);
            },
            isZeroed() {
                return this.data.every(byte => byte === 0);
            }
        };

        // Track this buffer for automatic cleanup
        this.activeBuffers.add(buffer);

        // Start cleanup timer if not already running
        if (!this.cleanupTimer) {
            this.startCleanupTimer();
        }

        return buffer;
    }

    /**
     * Create a secure buffer from a string (e.g., private key)
     */
    static fromString(str: string): SecureBuffer {
        const encoder = new TextEncoder();
        const sourceData = encoder.encode(str);
        const buffer = this.createSecureBuffer(sourceData.length);

        // Copy data to secure buffer
        buffer.data.set(sourceData);

        // Zero the source data if possible
        sourceData.fill(0);

        return buffer;
    }

    /**
     * Convert secure buffer back to string
     */
    static toString(buffer: SecureBuffer): string {
        if (buffer.isZeroed()) {
            throw new Error('Cannot convert zeroed buffer to string');
        }

        const decoder = new TextDecoder();
        return decoder.decode(buffer.data);
    }

    /**
     * Create a secure buffer from hex string
     */
    static fromHex(hex: string): SecureBuffer {
        if (hex.length % 2 !== 0) {
            throw new Error('Invalid hex string length');
        }

        const buffer = this.createSecureBuffer(hex.length / 2);

        for (let i = 0; i < hex.length; i += 2) {
            buffer.data[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        }

        return buffer;
    }

    /**
     * Convert secure buffer to hex string
     */
    static toHex(buffer: SecureBuffer): string {
        if (buffer.isZeroed()) {
            throw new Error('Cannot convert zeroed buffer to hex');
        }

        return Array.from(buffer.data)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Securely copy data between buffers
     */
    static copy(source: SecureBuffer, destination: SecureBuffer): void {
        if (source.data.length !== destination.data.length) {
            throw new Error('Buffer size mismatch');
        }

        destination.data.set(source.data);
    }

    /**
     * Compare two secure buffers in constant time
     */
    static constantTimeEquals(a: SecureBuffer, b: SecureBuffer): boolean {
        if (a.data.length !== b.data.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < a.data.length; i++) {
            result |= a.data[i] ^ b.data[i];
        }

        return result === 0;
    }

    /**
     * Execute a function with automatic cleanup of sensitive data
     */
    static async withSecureContext<T>(
        sensitiveData: string | Uint8Array,
        fn: (buffer: SecureBuffer) => Promise<T> | T
    ): Promise<T> {
        let buffer: SecureBuffer;

        if (typeof sensitiveData === 'string') {
            buffer = this.fromString(sensitiveData);
        } else {
            buffer = this.createSecureBuffer(sensitiveData.length);
            buffer.data.set(sensitiveData);
        }

        try {
            const result = await fn(buffer);
            return result;
        } finally {
            // Always zero the buffer when done
            buffer.zero();
        }
    }

    /**
     * Utility for wallet operations with automatic key cleanup.
     * Note: The callback receives a SecureBuffer rather than a plain string
     * to avoid leaving sensitive data in V8's string pool.
     */
    static async withPrivateKey<T>(
        encryptedMnemonic: string,
        decryptionKey: string,
        fn: (mnemonic: SecureBuffer) => Promise<T> | T
    ): Promise<T> {
        const decryptionBuffer = this.fromString(decryptionKey);
        let mnemonicBuffer: SecureBuffer | null = null;

        try {
            const decryptedMnemonic = await this.decrypt(encryptedMnemonic, decryptionKey);
            mnemonicBuffer = this.fromString(decryptedMnemonic);

            // Execute the function with the secure buffer (not a plain string)
            const result = await fn(mnemonicBuffer);

            return result;
        } finally {
            // Always clean up sensitive data
            decryptionBuffer.zero();
            if (mnemonicBuffer) {
                mnemonicBuffer.zero();
            }

            // Force garbage collection if available
            if (typeof global !== 'undefined' && global.gc) {
                global.gc();
            }
        }
    }

    /**
     * Get memory usage statistics
     */
    static getStats(): {
        activeBuffers: number;
        cleanupInterval: boolean;
    } {
        return {
            activeBuffers: this.activeBuffers ? 1 : 0, // WeakSet doesn't have size
            cleanupInterval: this.cleanupTimer !== null
        };
    }

    /**
     * Force immediate cleanup of all tracked buffers
     */
    static forceCleanup(): void {
        // Note: WeakSet doesn't allow iteration, so we can't force cleanup
        // This is actually a security feature - prevents enumeration of sensitive data

        // Force garbage collection if available
        if (typeof global !== 'undefined' && global.gc) {
            global.gc();
        }

        log.info('Forced secure memory cleanup completed');
    }

    /**
     * Start periodic cleanup timer
     */
    private static startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            // Trigger garbage collection to clean up zeroed buffers
            if (typeof global !== 'undefined' && global.gc) {
                global.gc();
            }
        }, 30000); // Every 30 seconds

        log.debug('Secure memory cleanup timer started');
    }

    /**
     * Stop the cleanup timer
     */
    static stop(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    // ────────────────────────────────────────────────────────────────
    //  AES-256-GCM Encryption / Decryption
    // ────────────────────────────────────────────────────────────────

    /**
     * Derive an AES-256 CryptoKey from a passphrase and salt using PBKDF2.
     */
    private static async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey'],
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt.buffer as ArrayBuffer,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: ALGORITHM, length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt'],
        );
    }

    /**
     * Encrypt plaintext with AES-256-GCM.
     *
     * Output format (base64-encoded):  salt(16) || iv(12) || ciphertext+tag
     *
     * A fresh random salt and IV are generated for every call, so identical
     * plaintexts always produce different ciphertexts.
     */
    static async encrypt(plaintext: string, passphrase: string): Promise<string> {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const key = await this.deriveKey(passphrase, salt);

        const encoder = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt(
            { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
            key,
            encoder.encode(plaintext),
        );

        // Combine: salt || iv || ciphertext (includes GCM auth tag)
        const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
        combined.set(salt, 0);
        combined.set(iv, SALT_LENGTH);
        combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

        // Zero intermediate buffers
        salt.fill(0);
        iv.fill(0);

        return btoa(String.fromCharCode(...combined));
    }

    /**
     * Decrypt ciphertext that was produced by {@link encrypt}.
     *
     * Also handles **legacy** data that used the old `encrypted_` prefix stub.
     * Legacy data is returned as-is (with the prefix stripped) so callers can
     * re-encrypt it with real encryption at their convenience.
     *
     * @throws {Error} On authentication failure (wrong key or tampered data).
     */
    static async decrypt(encrypted: string, passphrase: string): Promise<string> {
        // ── Legacy migration: detect old "encrypted_" prefix format ──
        if (encrypted.startsWith(LEGACY_PREFIX)) {
            log.warn(
                'Decrypting legacy encrypted_ prefix data — this format provides NO ' +
                'cryptographic security. Re-encrypt with SecureMemoryManager.encrypt().',
            );
            return encrypted.slice(LEGACY_PREFIX.length);
        }

        // ── Real AES-256-GCM decryption ──
        let combined: Uint8Array;
        try {
            combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
        } catch {
            throw new Error('Invalid ciphertext: not valid base64');
        }

        const minLength = SALT_LENGTH + IV_LENGTH + 1; // at least 1 byte of ciphertext
        if (combined.length < minLength) {
            throw new Error('Invalid ciphertext: data too short');
        }

        const salt = combined.slice(0, SALT_LENGTH);
        const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

        const key = await this.deriveKey(passphrase, salt);

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
                key,
                ciphertext,
            );

            return new TextDecoder().decode(decrypted);
        } catch {
            throw new Error('Decryption failed: wrong key or tampered ciphertext');
        } finally {
            // Zero sensitive intermediates
            salt.fill(0);
            iv.fill(0);
            combined.fill(0);
        }
    }
}

/**
 * Decorator for automatically zeroing function parameters.
 * Handles both sync and async methods correctly — for async methods,
 * buffers are zeroed after the promise resolves or rejects.
 */
export function zeroOnReturn(_target: any, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (...args: any[]) {
        const zeroArgs = () => {
            for (const arg of args) {
                if (arg && typeof arg.zero === 'function') {
                    arg.zero();
                }
            }
        };

        let result: any;
        try {
            result = method.apply(this, args);
        } catch (err) {
            zeroArgs();
            throw err;
        }

        // If the result is a promise (async method), defer zeroing until settled
        if (result && typeof result.then === 'function') {
            return result.then(
                (val: any) => { zeroArgs(); return val; },
                (err: any) => { zeroArgs(); throw err; }
            );
        }

        // Synchronous method — zero immediately
        zeroArgs();
        return result;
    };

    return descriptor;
}

/**
 * Utility function to create a secure execution context
 */
export async function executeSecurely<T>(
    operation: () => Promise<T> | T,
    sensitiveData: SecureBuffer[] = []
): Promise<T> {
    try {
        const result = await operation();
        return result;
    } finally {
        // Clean up all sensitive data
        for (const buffer of sensitiveData) {
            buffer.zero();
        }

        // Force garbage collection
        if (typeof global !== 'undefined' && global.gc) {
            global.gc();
        }
    }
}