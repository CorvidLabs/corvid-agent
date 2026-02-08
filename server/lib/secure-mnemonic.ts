/**
 * Secure mnemonic handling utilities.
 *
 * Provides functions to safely redact and validate mnemonics so they
 * never appear in logs, error messages, or API responses.
 */

/**
 * Algorand mnemonics are exactly 25 words. A string that looks like
 * a space-separated sequence of 25 lowercase BIP-39 style words is
 * almost certainly a mnemonic.
 */
const MNEMONIC_WORD_COUNT = 25;

/**
 * Redact a mnemonic for safe logging. Shows only the first and last
 * words, replacing the rest with "***".
 *
 * Example: "abandon ability ... zoo" → "abandon *** zoo"
 *
 * Returns the input unchanged if it doesn't look like a mnemonic.
 */
export function redactMnemonic(mnemonic: string): string {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length < 3) return '***';
    return `${words[0]} *** ${words[words.length - 1]} (${words.length} words)`;
}

/**
 * Check whether a string looks like an Algorand mnemonic.
 * Does NOT validate the checksum — just checks the shape.
 */
export function looksLikeMnemonic(value: string): boolean {
    const words = value.trim().split(/\s+/);
    if (words.length !== MNEMONIC_WORD_COUNT) return false;
    // All words should be lowercase alpha only (BIP-39 words)
    return words.every((w) => /^[a-z]+$/.test(w));
}

/**
 * Scan a log message / error string for anything that looks like it
 * might contain a mnemonic and redact it. Useful as a safety net
 * in structured logging.
 *
 * Strategy: find runs of lowercase words (20+), then check if any
 * contiguous 25-word window within them looks like a mnemonic.
 */
export function sanitizeLogMessage(message: string): string {
    // Match runs of 20+ consecutive lowercase alpha words
    return message.replace(
        /\b([a-z]+(?:\s+[a-z]+){19,})\b/g,
        (fullMatch, group: string) => {
            const words = group.split(/\s+/);
            // Slide a 25-word window over the matched words
            for (let i = 0; i <= words.length - MNEMONIC_WORD_COUNT; i++) {
                const window = words.slice(i, i + MNEMONIC_WORD_COUNT);
                const candidate = window.join(' ');
                if (looksLikeMnemonic(candidate)) {
                    // Replace the mnemonic portion within the full match
                    const before = i > 0 ? words.slice(0, i).join(' ') + ' ' : '';
                    const after = i + MNEMONIC_WORD_COUNT < words.length
                        ? ' ' + words.slice(i + MNEMONIC_WORD_COUNT).join(' ')
                        : '';
                    return before + redactMnemonic(candidate) + after;
                }
            }
            return fullMatch;
        },
    );
}
