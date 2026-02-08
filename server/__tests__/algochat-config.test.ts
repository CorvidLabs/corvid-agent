import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { parseOwnerAddresses } from '../algochat/config';

// A valid Algorand address (the zero address, which always passes checksum validation)
const VALID_ADDRESS = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ';

// A 58-character base32 string that passes format checks but has an invalid checksum.
// This is the zero address with the last character changed, breaking the checksum.
const BAD_CHECKSUM_ADDRESS = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKA';

describe('parseOwnerAddresses', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
        originalEnv = process.env.ALGOCHAT_OWNER_ADDRESSES;
    });

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.ALGOCHAT_OWNER_ADDRESSES;
        } else {
            process.env.ALGOCHAT_OWNER_ADDRESSES = originalEnv;
        }
    });

    it('accepts a valid Algorand address', () => {
        process.env.ALGOCHAT_OWNER_ADDRESSES = VALID_ADDRESS;
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(1);
        expect(result.has(VALID_ADDRESS)).toBe(true);
    });

    it('rejects an address with valid format but invalid checksum', () => {
        // Verify the bad address matches the old regex pattern (58-char base32)
        expect(/^[A-Z2-7]{58}$/.test(BAD_CHECKSUM_ADDRESS)).toBe(true);

        process.env.ALGOCHAT_OWNER_ADDRESSES = BAD_CHECKSUM_ADDRESS;
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(0);
    });

    it('rejects non-base32 strings', () => {
        process.env.ALGOCHAT_OWNER_ADDRESSES = 'not-an-algorand-address';
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(0);
    });

    it('accepts multiple valid addresses separated by commas', () => {
        // Use the same valid address twice — Set deduplicates, so size is 1
        process.env.ALGOCHAT_OWNER_ADDRESSES = `${VALID_ADDRESS},${VALID_ADDRESS}`;
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(1);
    });

    it('skips invalid addresses while keeping valid ones', () => {
        process.env.ALGOCHAT_OWNER_ADDRESSES = `${VALID_ADDRESS},${BAD_CHECKSUM_ADDRESS}`;
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(1);
        expect(result.has(VALID_ADDRESS)).toBe(true);
    });

    it('returns empty set when env var is not set', () => {
        delete process.env.ALGOCHAT_OWNER_ADDRESSES;
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(0);
    });

    it('returns empty set for empty string', () => {
        process.env.ALGOCHAT_OWNER_ADDRESSES = '';
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(0);
    });

    it('normalizes lowercase addresses to uppercase', () => {
        process.env.ALGOCHAT_OWNER_ADDRESSES = VALID_ADDRESS.toLowerCase();
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(1);
        expect(result.has(VALID_ADDRESS)).toBe(true);
    });

    it('trims whitespace around addresses', () => {
        process.env.ALGOCHAT_OWNER_ADDRESSES = `  ${VALID_ADDRESS}  `;
        const result = parseOwnerAddresses('testnet');
        expect(result.size).toBe(1);
        expect(result.has(VALID_ADDRESS)).toBe(true);
    });
});
