/**
 * Secure memory wipe utilities for sensitive key material.
 *
 * In JavaScript/Node.js, true secure memory wipe is best-effort:
 * - Uint8Array/Buffer: reliably zeroed via .fill(0)
 * - Strings: immutable in V8 — can't be overwritten in place
 *
 * Strategy: convert sensitive data to Uint8Array for processing,
 * wipe when done, and minimize string lifetime.
 */

/**
 * Zero-fill a Uint8Array or Buffer in place.
 * Uses crypto.getRandomValues first (to defeat optimizer dead-store elimination),
 * then fills with zeros.
 */
export function wipeBuffer(buf: Uint8Array | ArrayBuffer | null | undefined): void {
    if (!buf) return;
    const view = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    // First overwrite with random bytes to defeat dead-store elimination by optimizers,
    // then zero-fill for clean state.
    crypto.getRandomValues(view);
    view.fill(0);
}

/**
 * Wipe multiple buffers. Convenience for finally blocks.
 */
export function wipeBuffers(...bufs: Array<Uint8Array | ArrayBuffer | null | undefined>): void {
    for (const buf of bufs) {
        wipeBuffer(buf);
    }
}

/**
 * Execute an async operation with a buffer, ensuring the buffer is wiped
 * in the finally block regardless of success or failure.
 */
export async function withSecureBuffer<T>(
    buf: Uint8Array,
    operation: (buf: Uint8Array) => Promise<T>,
): Promise<T> {
    try {
        return await operation(buf);
    } finally {
        wipeBuffer(buf);
    }
}
