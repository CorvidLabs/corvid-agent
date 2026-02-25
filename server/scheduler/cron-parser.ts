import { ValidationError } from '../lib/errors';

/**
 * Lightweight cron expression parser.
 *
 * Supports standard 5-field cron expressions:
 *   minute hour day-of-month month day-of-week
 *
 * Field syntax:
 *   *        — any value
 *   5        — exact value
 *   1,3,5    — list of values
 *   1-5      — range
 *   * /15     — step (every 15)
 *   1-30/5   — range with step
 *
 * Day-of-week: 0-7 (0 and 7 = Sunday)
 *
 * Preset aliases:
 *   @hourly   → 0 * * * *
 *   @daily    → 0 0 * * *
 *   @weekly   → 0 0 * * 0
 *   @monthly  → 0 0 1 * *
 *   @yearly   → 0 0 1 1 *
 */

const PRESETS: Record<string, string> = {
    '@hourly': '0 * * * *',
    '@daily': '0 0 * * *',
    '@weekly': '0 0 * * 0',
    '@monthly': '0 0 1 * *',
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
};

interface CronField {
    values: Set<number>;
}

function parseField(field: string, min: number, max: number): CronField {
    const values = new Set<number>();

    for (const part of field.split(',')) {
        const stepMatch = part.match(/^(.+)\/(\d+)$/);
        const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
        const range = stepMatch ? stepMatch[1] : part;

        if (range === '*') {
            for (let i = min; i <= max; i += step) {
                values.add(i);
            }
        } else if (range.includes('-')) {
            const [startStr, endStr] = range.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            for (let i = start; i <= end; i += step) {
                values.add(i);
            }
        } else {
            values.add(parseInt(range, 10));
        }
    }

    return { values };
}

export interface ParsedCron {
    minute: CronField;
    hour: CronField;
    dayOfMonth: CronField;
    month: CronField;
    dayOfWeek: CronField;
}

export function parseCron(expression: string): ParsedCron {
    const resolved = PRESETS[expression.toLowerCase()] ?? expression;
    const parts = resolved.trim().split(/\s+/);

    if (parts.length !== 5) {
        throw new ValidationError(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
    }

    return {
        minute: parseField(parts[0], 0, 59),
        hour: parseField(parts[1], 0, 23),
        dayOfMonth: parseField(parts[2], 1, 31),
        month: parseField(parts[3], 1, 12),
        dayOfWeek: parseField(parts[4], 0, 7), // 0 and 7 = Sunday
    };
}

/**
 * Get the next date that matches the cron expression, starting from `from` (default: now).
 * Searches up to 366 days ahead to prevent infinite loops.
 */
export function getNextCronDate(expression: string, from?: Date): Date {
    const cron = parseCron(expression);
    const start = from ? new Date(from) : new Date();

    // Start from the next minute
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    const maxDate = new Date(start);
    maxDate.setDate(maxDate.getDate() + 366);

    const date = new Date(start);

    while (date < maxDate) {
        // Check month
        if (!cron.month.values.has(date.getMonth() + 1)) {
            date.setMonth(date.getMonth() + 1, 1);
            date.setHours(0, 0, 0, 0);
            continue;
        }

        // Check day of month
        if (!cron.dayOfMonth.values.has(date.getDate())) {
            date.setDate(date.getDate() + 1);
            date.setHours(0, 0, 0, 0);
            continue;
        }

        // Check day of week (normalize 7 → 0 for Sunday)
        const dow = date.getDay();
        const dowNorm = dow === 7 ? 0 : dow;
        if (!cron.dayOfWeek.values.has(dowNorm) && !cron.dayOfWeek.values.has(dow === 0 ? 7 : dow)) {
            date.setDate(date.getDate() + 1);
            date.setHours(0, 0, 0, 0);
            continue;
        }

        // Check hour
        if (!cron.hour.values.has(date.getHours())) {
            date.setHours(date.getHours() + 1, 0, 0, 0);
            continue;
        }

        // Check minute
        if (!cron.minute.values.has(date.getMinutes())) {
            date.setMinutes(date.getMinutes() + 1, 0, 0);
            continue;
        }

        return date;
    }

    throw new ValidationError(`No matching cron date found within 366 days for: ${expression}`);
}

/**
 * Get a human-readable description of a cron expression.
 */
export function describeCron(expression: string): string {
    const lower = expression.toLowerCase();
    if (lower === '@hourly') return 'Every hour';
    if (lower === '@daily') return 'Every day at midnight';
    if (lower === '@weekly') return 'Every Sunday at midnight';
    if (lower === '@monthly') return 'First day of every month at midnight';
    if (lower === '@yearly' || lower === '@annually') return 'January 1st at midnight';

    const cron = parseCron(expression);
    const parts: string[] = [];

    const minVals = [...cron.minute.values].sort((a, b) => a - b);
    const hourVals = [...cron.hour.values].sort((a, b) => a - b);

    if (minVals.length === 60 && hourVals.length === 24) {
        parts.push('Every minute');
    } else if (hourVals.length === 24) {
        parts.push(`Every hour at minute ${minVals.join(', ')}`);
    } else if (minVals.length === 1 && hourVals.length === 1) {
        parts.push(`At ${String(hourVals[0]).padStart(2, '0')}:${String(minVals[0]).padStart(2, '0')}`);
    } else {
        parts.push(`At ${hourVals.join(',')}h, minute ${minVals.join(',')}`);
    }

    const dowVals = [...cron.dayOfWeek.values];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (dowVals.length < 7) {
        const names = dowVals.map((d) => dayNames[d % 7]).join(', ');
        parts.push(`on ${names}`);
    }

    return parts.join(' ');
}
