import { describe, test, expect } from 'bun:test';
import { truncate, formatUptime } from '../../cli/utils';

describe('truncate', () => {
    test('returns string unchanged when under max', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    test('returns string unchanged when exactly at max', () => {
        expect(truncate('hello', 5)).toBe('hello');
    });

    test('truncates and appends ellipsis when over max', () => {
        expect(truncate('hello world', 8)).toBe('hello w…');
    });

    test('handles single character max', () => {
        expect(truncate('hello', 1)).toBe('…');
    });

    test('handles empty string', () => {
        expect(truncate('', 5)).toBe('');
    });
});

describe('formatUptime', () => {
    test('formats minutes only', () => {
        expect(formatUptime(300)).toBe('5m');
    });

    test('formats hours and minutes', () => {
        expect(formatUptime(3720)).toBe('1h 2m');
    });

    test('formats days and hours', () => {
        expect(formatUptime(90000)).toBe('1d 1h');
    });

    test('formats zero seconds', () => {
        expect(formatUptime(0)).toBe('0m');
    });

    test('omits zero minutes for hours', () => {
        expect(formatUptime(7200)).toBe('2h 0m');
    });
});
