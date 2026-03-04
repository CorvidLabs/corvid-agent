import { describe, test, expect } from 'bun:test';
import { parseCron, getNextCronDate, describeCron } from '../scheduler/cron-parser';

// ── parseCron ────────────────────────────────────────────────────────

describe('parseCron', () => {
    test('parses wildcard fields', () => {
        const cron = parseCron('* * * * *');
        expect(cron.minute.values.size).toBe(60);
        expect(cron.hour.values.size).toBe(24);
        expect(cron.dayOfMonth.values.size).toBe(31);
        expect(cron.month.values.size).toBe(12);
        expect(cron.dayOfWeek.values.size).toBe(8); // 0-7
    });

    test('parses exact values', () => {
        const cron = parseCron('30 12 15 6 3');
        expect([...cron.minute.values]).toEqual([30]);
        expect([...cron.hour.values]).toEqual([12]);
        expect([...cron.dayOfMonth.values]).toEqual([15]);
        expect([...cron.month.values]).toEqual([6]);
        expect([...cron.dayOfWeek.values]).toEqual([3]);
    });

    test('parses comma-separated lists', () => {
        const cron = parseCron('0,15,30,45 * * * *');
        expect([...cron.minute.values].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
    });

    test('parses ranges', () => {
        const cron = parseCron('* 9-17 * * *');
        expect([...cron.hour.values].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    test('parses step values', () => {
        const cron = parseCron('*/15 * * * *');
        expect([...cron.minute.values].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
    });

    test('parses range with step', () => {
        const cron = parseCron('1-30/10 * * * *');
        expect([...cron.minute.values].sort((a, b) => a - b)).toEqual([1, 11, 21]);
    });

    test('resolves @hourly preset', () => {
        const cron = parseCron('@hourly');
        expect([...cron.minute.values]).toEqual([0]);
        expect(cron.hour.values.size).toBe(24);
    });

    test('resolves @daily preset', () => {
        const cron = parseCron('@daily');
        expect([...cron.minute.values]).toEqual([0]);
        expect([...cron.hour.values]).toEqual([0]);
        expect(cron.dayOfMonth.values.size).toBe(31);
    });

    test('resolves @weekly preset', () => {
        const cron = parseCron('@weekly');
        expect([...cron.minute.values]).toEqual([0]);
        expect([...cron.hour.values]).toEqual([0]);
        expect([...cron.dayOfWeek.values]).toEqual([0]);
    });

    test('resolves @monthly preset', () => {
        const cron = parseCron('@monthly');
        expect([...cron.dayOfMonth.values]).toEqual([1]);
    });

    test('resolves @yearly and @annually to same result', () => {
        const yearly = parseCron('@yearly');
        const annually = parseCron('@annually');
        expect([...yearly.month.values]).toEqual([1]);
        expect([...annually.month.values]).toEqual([1]);
        expect([...yearly.dayOfMonth.values]).toEqual([1]);
        expect([...annually.dayOfMonth.values]).toEqual([1]);
    });

    test('presets are case-insensitive', () => {
        const cron = parseCron('@DAILY');
        expect([...cron.minute.values]).toEqual([0]);
        expect([...cron.hour.values]).toEqual([0]);
    });

    test('throws on invalid field count', () => {
        expect(() => parseCron('* * *')).toThrow('expected 5 fields');
        expect(() => parseCron('* * * * * *')).toThrow('expected 5 fields');
    });

    test('handles day-of-week 0 and 7 both as Sunday', () => {
        const cron = parseCron('* * * * 0,7');
        expect(cron.dayOfWeek.values.has(0)).toBe(true);
        expect(cron.dayOfWeek.values.has(7)).toBe(true);
    });
});

// ── getNextCronDate ──────────────────────────────────────────────────

describe('getNextCronDate', () => {
    test('finds next occurrence for every-minute cron', () => {
        const from = new Date('2026-01-15T10:30:00Z');
        const next = getNextCronDate('* * * * *', from);
        expect(next.getMinutes()).toBe(31);
        expect(next.getHours()).toBe(10);
    });

    test('finds next hour for hourly cron', () => {
        const from = new Date('2026-01-15T10:30:00Z');
        const next = getNextCronDate('0 * * * *', from);
        expect(next.getMinutes()).toBe(0);
        expect(next.getHours()).toBe(11);
    });

    test('finds next day for daily cron', () => {
        const from = new Date('2026-01-15T10:30:00Z');
        const next = getNextCronDate('@daily', from);
        expect(next.getDate()).toBe(16);
        expect(next.getHours()).toBe(0);
        expect(next.getMinutes()).toBe(0);
    });

    test('finds correct day of week', () => {
        // 2026-01-15 is a Thursday (day 4)
        const from = new Date('2026-01-15T10:30:00Z');
        // Next Monday (day 1)
        const next = getNextCronDate('0 9 * * 1', from);
        expect(next.getDay()).toBe(1); // Monday
        expect(next.getHours()).toBe(9);
    });

    test('finds next month when current month not in schedule', () => {
        // Schedule for March only
        const from = new Date('2026-01-15T10:30:00Z');
        const next = getNextCronDate('0 0 1 3 *', from);
        expect(next.getMonth()).toBe(2); // March (0-indexed)
        expect(next.getDate()).toBe(1);
    });

    test('handles @monthly preset', () => {
        const from = new Date('2026-01-15T10:30:00Z');
        const next = getNextCronDate('@monthly', from);
        expect(next.getDate()).toBe(1);
        expect(next.getMonth()).toBe(1); // February
    });

    test('returns seconds and milliseconds as zero', () => {
        const from = new Date('2026-01-15T10:30:45.123Z');
        const next = getNextCronDate('* * * * *', from);
        expect(next.getSeconds()).toBe(0);
        expect(next.getMilliseconds()).toBe(0);
    });

    test('uses preset aliases', () => {
        const from = new Date('2026-01-15T10:30:00Z');
        const next = getNextCronDate('@hourly', from);
        expect(next.getMinutes()).toBe(0);
        expect(next.getHours()).toBe(11);
    });
});

// ── describeCron ─────────────────────────────────────────────────────

describe('describeCron', () => {
    test('describes @hourly', () => {
        expect(describeCron('@hourly')).toBe('Every hour');
    });

    test('describes @daily', () => {
        expect(describeCron('@daily')).toBe('Every day at midnight');
    });

    test('describes @weekly', () => {
        expect(describeCron('@weekly')).toBe('Every Sunday at midnight');
    });

    test('describes @monthly', () => {
        expect(describeCron('@monthly')).toBe('First day of every month at midnight');
    });

    test('describes @yearly', () => {
        expect(describeCron('@yearly')).toBe('January 1st at midnight');
    });

    test('describes @annually same as @yearly', () => {
        expect(describeCron('@annually')).toBe('January 1st at midnight');
    });

    test('describes every minute', () => {
        expect(describeCron('* * * * *')).toBe('Every minute');
    });

    test('describes hourly at specific minute', () => {
        expect(describeCron('30 * * * *')).toBe('Every hour at minute 30');
    });

    test('describes specific time', () => {
        expect(describeCron('0 9 * * *')).toBe('At 09:00');
    });

    test('includes day-of-week when restricted', () => {
        const desc = describeCron('0 9 * * 1-5');
        expect(desc).toContain('on');
        expect(desc).toContain('Mon');
        expect(desc).toContain('Fri');
    });

    test('omits day-of-week when all days selected', () => {
        const desc = describeCron('0 9 * * *');
        expect(desc).not.toContain('on');
    });
});
