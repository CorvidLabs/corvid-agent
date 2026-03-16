import { describe, test, expect } from 'bun:test';
import { assertSnowflake, assertInteractionToken } from '../discord/embeds';

describe('assertSnowflake', () => {
    test('accepts valid snowflake IDs', () => {
        expect(() => assertSnowflake('12345678901234567', 'test')).not.toThrow();
        expect(() => assertSnowflake('12345678901234567890', 'test')).not.toThrow();
    });

    test('rejects non-numeric strings', () => {
        expect(() => assertSnowflake('not-a-snowflake', 'channel ID')).toThrow(
            'Invalid Discord channel ID: expected snowflake ID (17-20 digit numeric string)',
        );
    });

    test('rejects too-short numeric strings', () => {
        expect(() => assertSnowflake('1234', 'user ID')).toThrow(
            'expected snowflake ID (17-20 digit numeric string)',
        );
    });
});

describe('assertInteractionToken', () => {
    test('accepts valid interaction tokens', () => {
        const validToken = 'aOf2mdK8w3FlPWkm9GdC';
        expect(() => assertInteractionToken(validToken)).not.toThrow();
    });

    test('rejects tokens that are too short', () => {
        expect(() => assertInteractionToken('short')).toThrow(
            'Invalid Discord interaction token (expected 20-500 alphanumeric characters with dashes, dots, or underscores)',
        );
    });

    test('rejects tokens with invalid characters', () => {
        expect(() => assertInteractionToken('invalid token with spaces!!')).toThrow(
            'Invalid Discord interaction token',
        );
    });
});
