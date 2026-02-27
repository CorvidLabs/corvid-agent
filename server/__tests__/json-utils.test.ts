import { test, expect, describe } from 'bun:test';
import { safeJsonParse } from '../db/json-utils';

describe('safeJsonParse', () => {
    test('parses valid JSON', () => {
        expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    });

    test('parses valid JSON array', () => {
        expect(safeJsonParse('[1,2,3]', [] as number[])).toEqual([1, 2, 3]);
    });

    test('parses valid JSON string', () => {
        expect(safeJsonParse('"hello"', '')).toBe('hello');
    });

    test('returns default value for invalid JSON', () => {
        expect(safeJsonParse('not json', { fallback: true })).toEqual({ fallback: true });
    });

    test('returns default value for empty string', () => {
        expect(safeJsonParse('', [])).toEqual([]);
    });

    test('returns default value for truncated JSON', () => {
        expect(safeJsonParse('{"key": "val', null)).toBeNull();
    });

    test('preserves generic type on success', () => {
        const result = safeJsonParse<{ x: number }>('{"x":42}', { x: 0 });
        expect(result.x).toBe(42);
    });

    test('preserves generic default type on failure', () => {
        const result = safeJsonParse<string[]>('oops', ['default']);
        expect(result).toEqual(['default']);
    });
});
