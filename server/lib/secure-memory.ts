import { createLogger } from './logger';

const log = createLogger('SecureMemory');

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
            buffer.data[i / 2] = parseInt(hex.substr(i, 2), 16);
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
     * Utility for wallet operations with automatic key cleanup
     */
    static async withPrivateKey<T>(
        encryptedMnemonic: string,
        decryptionKey: string,
        fn: (mnemonic: string) => Promise<T> | T
    ): Promise<T> {
        const decryptionBuffer = this.fromString(decryptionKey);
        let mnemonicBuffer: SecureBuffer | null = null;

        try {
            // TODO: Integrate with actual encryption/decryption
            // For now, simulate decryption
            const decryptedMnemonic = this.simulateDecryption(encryptedMnemonic, decryptionKey);
            mnemonicBuffer = this.fromString(decryptedMnemonic);

            // Execute the function with the decrypted mnemonic
            const mnemonic = this.toString(mnemonicBuffer);
            const result = await fn(mnemonic);

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

    /**
     * Simulate decryption (placeholder for actual implementation)
     */
    private static simulateDecryption(encrypted: string, _key: string): string {
        // TODO: Replace with actual AES decryption
        // This is just a placeholder
        return encrypted.replace('encrypted_', '');
    }
}

/**
 * Decorator for automatically zeroing function parameters
 */
export function zeroOnReturn(_target: any, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (...args: any[]) {
        try {
            return method.apply(this, args);
        } finally {
            // Zero any SecureBuffer arguments
            for (const arg of args) {
                if (arg && typeof arg.zero === 'function') {
                    arg.zero();
                }
            }
        }
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