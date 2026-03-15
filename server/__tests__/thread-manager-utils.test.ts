import { describe, test, expect } from 'bun:test';
import { normalizeTimestamp, formatDuration } from '../discord/thread-manager';

describe('normalizeTimestamp', () => {
    test('appends Z to bare SQLite timestamp', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00')).toBe('2026-03-14 12:30:00Z');
    });

    test('does not double-append Z', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00Z')).toBe('2026-03-14 12:30:00Z');
    });

    test('handles ISO format with T', () => {
        expect(normalizeTimestamp('2026-03-14T12:30:00')).toBe('2026-03-14T12:30:00Z');
    });

    test('handles fractional seconds', () => {
        expect(normalizeTimestamp('2026-03-14 12:30:00.123')).toBe('2026-03-14 12:30:00.123Z');
    });

    test('result parses as UTC', () => {
        const ts = normalizeTimestamp('2026-03-14 12:30:00');
        const d = new Date(ts);
        expect(d.getUTCHours()).toBe(12);
        expect(d.getUTCMinutes()).toBe(30);
    });
});

describe('formatDuration', () => {
    test('formats seconds only', () => {
        expect(formatDuration(45000)).toBe('45s');
    });

    test('formats minutes and seconds', () => {
        expect(formatDuration(125000)).toBe('2m 5s');
    });

    test('formats zero', () => {
        expect(formatDuration(0)).toBe('0s');
    });

    test('clamps negative to zero', () => {
        expect(formatDuration(-5000)).toBe('0s');
    });

    test('formats large durations', () => {
        expect(formatDuration(3661000)).toBe('61m 1s');
    });

    test('truncates sub-second to 0s', () => {
        expect(formatDuration(999)).toBe('0s');
    });

    test('exactly one minute', () => {
        expect(formatDuration(60000)).toBe('1m 0s');
    });
});
