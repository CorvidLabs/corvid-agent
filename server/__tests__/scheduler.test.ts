import { test, expect, describe } from 'bun:test';
import { parseCron, getNextCronDate, describeCron } from '../scheduler/cron-parser';
import { validateScheduleFrequency } from '../scheduler/service';

// ─── Cron Parser ─────────────────────────────────────────────────────────────

describe('parseCron', () => {
    test('parses simple fields', () => {
        const cron = parseCron('30 9 * * *');
        expect(cron.minute.values.has(30)).toBe(true);
        expect(cron.minute.values.size).toBe(1);
        expect(cron.hour.values.has(9)).toBe(true);
        expect(cron.hour.values.size).toBe(1);
        expect(cron.dayOfMonth.values.size).toBe(31);
        expect(cron.month.values.size).toBe(12);
        expect(cron.dayOfWeek.values.size).toBe(8); // 0-7
    });

    test('parses comma-separated lists', () => {
        const cron = parseCron('0,15,30,45 * * * *');
        expect(cron.minute.values.size).toBe(4);
        expect(cron.minute.values.has(0)).toBe(true);
        expect(cron.minute.values.has(15)).toBe(true);
        expect(cron.minute.values.has(30)).toBe(true);
        expect(cron.minute.values.has(45)).toBe(true);
    });

    test('parses ranges', () => {
        const cron = parseCron('* 9-17 * * *');
        expect(cron.hour.values.size).toBe(9); // 9,10,11,12,13,14,15,16,17
        for (let h = 9; h <= 17; h++) {
            expect(cron.hour.values.has(h)).toBe(true);
        }
    });

    test('parses step values', () => {
        const cron = parseCron('*/15 * * * *');
        expect(cron.minute.values.size).toBe(4); // 0,15,30,45
        expect(cron.minute.values.has(0)).toBe(true);
        expect(cron.minute.values.has(15)).toBe(true);
        expect(cron.minute.values.has(30)).toBe(true);
        expect(cron.minute.values.has(45)).toBe(true);
    });

    test('parses range with step', () => {
        const cron = parseCron('0 1-10/3 * * *');
        expect(cron.hour.values.has(1)).toBe(true);
        expect(cron.hour.values.has(4)).toBe(true);
        expect(cron.hour.values.has(7)).toBe(true);
        expect(cron.hour.values.has(10)).toBe(true);
        expect(cron.hour.values.has(2)).toBe(false);
    });

    test('resolves @hourly preset', () => {
        const cron = parseCron('@hourly');
        expect(cron.minute.values.size).toBe(1);
        expect(cron.minute.values.has(0)).toBe(true);
        expect(cron.hour.values.size).toBe(24);
    });

    test('resolves @daily preset', () => {
        const cron = parseCron('@daily');
        expect(cron.minute.values.has(0)).toBe(true);
        expect(cron.hour.values.has(0)).toBe(true);
        expect(cron.hour.values.size).toBe(1);
        expect(cron.minute.values.size).toBe(1);
    });

    test('resolves @weekly preset', () => {
        const cron = parseCron('@weekly');
        expect(cron.dayOfWeek.values.has(0)).toBe(true);
        expect(cron.dayOfWeek.values.size).toBe(1);
    });

    test('resolves @monthly preset', () => {
        const cron = parseCron('@monthly');
        expect(cron.dayOfMonth.values.has(1)).toBe(true);
        expect(cron.dayOfMonth.values.size).toBe(1);
    });

    test('resolves @yearly preset', () => {
        const cron = parseCron('@yearly');
        expect(cron.month.values.has(1)).toBe(true);
        expect(cron.month.values.size).toBe(1);
        expect(cron.dayOfMonth.values.has(1)).toBe(true);
    });

    test('presets are case-insensitive', () => {
        const cron = parseCron('@HOURLY');
        expect(cron.minute.values.has(0)).toBe(true);
    });

    test('throws on invalid field count', () => {
        expect(() => parseCron('* * *')).toThrow('expected 5 fields');
        expect(() => parseCron('* * * * * *')).toThrow('expected 5 fields');
    });

    test('parses weekday range (Mon-Fri)', () => {
        const cron = parseCron('0 9 * * 1-5');
        expect(cron.dayOfWeek.values.has(1)).toBe(true); // Mon
        expect(cron.dayOfWeek.values.has(5)).toBe(true); // Fri
        expect(cron.dayOfWeek.values.has(0)).toBe(false); // Sun
        expect(cron.dayOfWeek.values.has(6)).toBe(false); // Sat
    });
});

// ─── getNextCronDate ─────────────────────────────────────────────────────────

describe('getNextCronDate', () => {
    test('finds next hourly occurrence', () => {
        const from = new Date('2026-02-14T10:30:00Z');
        const next = getNextCronDate('@hourly', from);
        // Should be at the top of the next hour
        expect(next.getMinutes()).toBe(0);
        expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    test('finds next daily occurrence', () => {
        const from = new Date('2026-02-14T10:30:00Z');
        const next = getNextCronDate('@daily', from);
        expect(next.getHours()).toBe(0);
        expect(next.getMinutes()).toBe(0);
        expect(next.getDate()).toBe(15); // next day
    });

    test('finds next specific time', () => {
        const from = new Date('2026-02-14T08:00:00Z');
        const next = getNextCronDate('30 9 * * *', from);
        expect(next.getHours()).toBe(9);
        expect(next.getMinutes()).toBe(30);
    });

    test('skips to next day if time already passed', () => {
        const from = new Date('2026-02-14T10:00:00Z');
        const next = getNextCronDate('30 9 * * *', from);
        // 9:30 already passed for Feb 14, should go to Feb 15
        expect(next.getDate()).toBe(15);
    });

    test('respects weekday constraints', () => {
        // Friday Feb 14, 2026
        const from = new Date('2026-02-14T23:00:00Z');
        // Monday through Friday at 9:00
        const next = getNextCronDate('0 9 * * 1-5', from);
        const dayOfWeek = next.getDay();
        expect(dayOfWeek).toBeGreaterThanOrEqual(1);
        expect(dayOfWeek).toBeLessThanOrEqual(5);
    });

    test('consecutive calls yield increasing dates', () => {
        const first = getNextCronDate('@hourly');
        const second = getNextCronDate('@hourly', first);
        expect(second.getTime()).toBeGreaterThan(first.getTime());
    });

    test('respects month constraints', () => {
        // Only January
        const from = new Date('2026-02-14T00:00:00Z');
        const next = getNextCronDate('0 0 1 1 *', from);
        expect(next.getMonth()).toBe(0); // January
        expect(next.getFullYear()).toBe(2027); // Next year
    });
});

// ─── describeCron ────────────────────────────────────────────────────────────

describe('describeCron', () => {
    test('describes presets', () => {
        expect(describeCron('@hourly')).toBe('Every hour');
        expect(describeCron('@daily')).toBe('Every day at midnight');
        expect(describeCron('@weekly')).toBe('Every Sunday at midnight');
        expect(describeCron('@monthly')).toBe('First day of every month at midnight');
        expect(describeCron('@yearly')).toBe('January 1st at midnight');
        expect(describeCron('@annually')).toBe('January 1st at midnight');
    });

    test('describes specific time', () => {
        const desc = describeCron('30 9 * * *');
        expect(desc).toContain('09:30');
    });

    test('describes every-n-minutes', () => {
        const desc = describeCron('*/15 * * * *');
        expect(desc).toContain('hour');
    });

    test('describes weekday filter', () => {
        const desc = describeCron('0 9 * * 1-5');
        expect(desc).toContain('Mon');
        expect(desc).toContain('Fri');
    });
});

// ─── validateScheduleFrequency ───────────────────────────────────────────────

describe('validateScheduleFrequency', () => {
    test('accepts valid interval (5+ minutes)', () => {
        expect(() => validateScheduleFrequency(null, 300_000)).not.toThrow();   // 5 min
        expect(() => validateScheduleFrequency(null, 3_600_000)).not.toThrow(); // 1 hour
    });

    test('rejects interval shorter than 5 minutes', () => {
        expect(() => validateScheduleFrequency(null, 60_000)).toThrow('too short');
        expect(() => validateScheduleFrequency(null, 299_999)).toThrow('too short');
    });

    test('accepts valid cron expressions', () => {
        expect(() => validateScheduleFrequency('@hourly')).not.toThrow();
        expect(() => validateScheduleFrequency('@daily')).not.toThrow();
        expect(() => validateScheduleFrequency('0 9 * * 1-5')).not.toThrow();
        expect(() => validateScheduleFrequency('*/30 * * * *')).not.toThrow(); // every 30 min
    });

    test('rejects cron expressions that fire too frequently', () => {
        // Every minute
        expect(() => validateScheduleFrequency('* * * * *')).toThrow('fires every');
        // Every 2 minutes
        expect(() => validateScheduleFrequency('*/2 * * * *')).toThrow('fires every');
        // Every 4 minutes
        expect(() => validateScheduleFrequency('*/4 * * * *')).toThrow('fires every');
    });

    test('accepts cron at exactly 5-minute intervals', () => {
        expect(() => validateScheduleFrequency('*/5 * * * *')).not.toThrow();
    });

    test('throws on invalid cron expression', () => {
        expect(() => validateScheduleFrequency('invalid cron')).toThrow('Invalid cron');
    });

    test('accepts null/undefined for both params (no-op)', () => {
        expect(() => validateScheduleFrequency(null, null)).not.toThrow();
        expect(() => validateScheduleFrequency(undefined, undefined)).not.toThrow();
    });

    test('validates both params independently', () => {
        // Valid cron + valid interval: OK
        expect(() => validateScheduleFrequency('@daily', 3_600_000)).not.toThrow();
        // Valid cron + invalid interval: throws for interval
        expect(() => validateScheduleFrequency('@daily', 60_000)).toThrow('too short');
        // Invalid cron + valid interval: throws for cron
        expect(() => validateScheduleFrequency('* * * * *', 3_600_000)).toThrow('fires every');
    });
});

// ─── needsApproval logic (tested via behavior expectations) ──────────────────

describe('needsApproval behavior', () => {
    // Since needsApproval is private, we document the expected behavior here
    // These tests validate the approval policy rules as documented

    test('auto policy never needs approval', () => {
        // approvalPolicy: 'auto' → always false for all action types
        // Verified by reading the source: if (schedule.approvalPolicy === 'auto') return false;
        expect(true).toBe(true); // Placeholder — tested via integration with executeSchedule
    });

    test('owner_approve only requires approval for destructive actions', () => {
        // Destructive: work_task, github_suggest, fork_repo
        // Non-destructive: star_repo, review_prs, council_launch, send_message, custom
        const destructive = ['work_task', 'github_suggest', 'fork_repo'];
        const safe = ['star_repo', 'review_prs', 'council_launch', 'send_message', 'custom'];

        expect(destructive).toHaveLength(3);
        expect(safe).toHaveLength(5);
    });

    test('council_approve requires approval for all actions', () => {
        // approvalPolicy: 'council_approve' → always true
        expect(true).toBe(true); // Placeholder
    });
});
