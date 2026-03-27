import { Pipe, PipeTransform } from '@angular/core';

const DOW_NAMES: Record<string, string> = {
    '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun',
};

const MON_NAMES: Record<string, string> = {
    '1': 'Jan', '2': 'Feb', '3': 'Mar', '4': 'Apr', '5': 'May', '6': 'Jun',
    '7': 'Jul', '8': 'Aug', '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

/**
 * Converts a 5-field cron expression to a human-readable string.
 *
 * Usage: `schedule.cronExpression | cronHuman`
 *
 * Returns empty string for null/undefined input.
 * Returns the raw expression if it cannot be parsed (not 5 fields).
 */
@Pipe({ name: 'cronHuman' })
export class CronHumanPipe implements PipeTransform {
    transform(expr: string | null | undefined): string {
        return cronToHuman(expr);
    }
}

/** Standalone helper so components can call this without the pipe. */
export function cronToHuman(expr: string | null | undefined): string {
    if (!expr) return '';
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return expr;
    const [min, hour, dom, mon, dow] = parts;

    const time = formatTime(hour, min);
    const dayOfWeek = formatDow(dow);
    const dayOfMonth = dom !== '*' ? `day ${dom}` : '';
    const month = mon !== '*' ? (MON_NAMES[mon] ?? `month ${mon}`) : '';

    const pieces = [time];
    if (dayOfWeek) pieces.push(dayOfWeek);
    if (dayOfMonth) pieces.push(dayOfMonth);
    if (month) pieces.push(`in ${month}`);

    return pieces.join(', ');
}

/** Validate a 5-field cron expression. Returns null if valid, or an error string. */
export function validateCron(expr: string): string | null {
    if (!expr || !expr.trim()) return 'Cron expression is required';
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return `Expected 5 fields (min hour dom mon dow), got ${parts.length}`;

    const [min, hour, dom, mon, dow] = parts;

    const rangeErr = validateField(min, 0, 59, 'Minute');
    if (rangeErr) return rangeErr;
    const hourErr = validateField(hour, 0, 23, 'Hour');
    if (hourErr) return hourErr;
    const domErr = validateField(dom, 1, 31, 'Day-of-month');
    if (domErr) return domErr;
    const monErr = validateField(mon, 1, 12, 'Month');
    if (monErr) return monErr;
    const dowErr = validateField(dow, 0, 7, 'Day-of-week');
    if (dowErr) return dowErr;

    return null;
}

function validateField(field: string, min: number, max: number, label: string): string | null {
    if (field === '*') return null;

    // Handle step expressions like */5
    if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2), 10);
        if (!Number.isFinite(step) || step < 1) return `${label}: invalid step value "${field}"`;
        return null;
    }

    // Handle ranges like 1-5, possibly with step like 1-5/2
    const rangeParts = field.split('/');
    const rangeStr = rangeParts[0];

    // Handle comma-separated lists
    const segments = rangeStr.split(',');
    for (const seg of segments) {
        if (seg.includes('-')) {
            const [a, b] = seg.split('-');
            const aNum = parseInt(a, 10);
            const bNum = parseInt(b, 10);
            if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return `${label}: invalid range "${seg}"`;
            if (aNum < min || aNum > max || bNum < min || bNum > max) return `${label}: value out of range ${min}-${max}`;
            if (aNum > bNum) return `${label}: invalid range "${seg}" (start > end)`;
        } else {
            const num = parseInt(seg, 10);
            if (!Number.isFinite(num)) return `${label}: invalid value "${seg}"`;
            if (num < min || num > max) return `${label}: ${num} out of range ${min}-${max}`;
        }
    }

    return null;
}

function formatTime(h: string, m: string): string {
    if (h === '*' && m === '*') return 'Every minute';
    if (h.startsWith('*/')) return `Every ${h.slice(2)} hours at :${m === '*' ? '00' : m.padStart(2, '0')}`;
    if (m.startsWith('*/')) return `Every ${m.slice(2)} minutes` + (h !== '*' ? ` during hour ${h}` : '');
    if (h === '*') return `Every hour at :${m.padStart(2, '0')}`;
    if (m === '*') return `Every minute of hour ${h}`;
    const hr = parseInt(h, 10);
    const mn = parseInt(m, 10);
    if (!Number.isFinite(hr) || !Number.isFinite(mn)) return `${h} ${m}`;
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    return `${h12}:${m.padStart(2, '0')} ${ampm}`;
}

function formatDow(d: string): string {
    if (d === '*') return '';
    if (d.includes('-')) {
        const [a, b] = d.split('-');
        return (DOW_NAMES[a] ?? a) + '\u2013' + (DOW_NAMES[b] ?? b);
    }
    if (d.includes(',')) return d.split(',').map((v) => DOW_NAMES[v] ?? v).join(', ');
    return DOW_NAMES[d] ?? d;
}
