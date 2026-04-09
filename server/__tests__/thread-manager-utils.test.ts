import { describe, expect, test } from 'bun:test';
import { formatDuration, normalizeTimestamp, sessionErrorEmbed } from '../discord/thread-manager';
import { visibleEmbedParts } from '../discord/thread-response/utils';

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

describe('visibleEmbedParts', () => {
  test('filters out whitespace-only chunks', () => {
    const result = visibleEmbedParts('hello world');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBe('hello world');
  });

  test('returns empty array for whitespace-only input', () => {
    expect(visibleEmbedParts('   \n  ')).toEqual([]);
  });

  test('trims leading and trailing whitespace from parts', () => {
    const result = visibleEmbedParts('  trimmed  ');
    expect(result[0]).toBe('trimmed');
  });

  test('returns empty array for empty string', () => {
    expect(visibleEmbedParts('')).toEqual([]);
  });
});

describe('sessionErrorEmbed', () => {
  test('context_exhausted returns warning color and recovery hint', () => {
    const result = sessionErrorEmbed('context_exhausted');
    expect(result.title).toBe('Context Limit Reached');
    expect(result.description).toContain('pick up where it left off');
    expect(result.color).toBe(0xf0b232);
  });

  test('credits_exhausted directs to Settings > Spending', () => {
    const result = sessionErrorEmbed('credits_exhausted');
    expect(result.title).toBe('Credits Exhausted');
    expect(result.description).toContain('Settings > Spending');
    expect(result.color).toBe(0xf0b232);
  });

  test('timeout suggests smaller steps', () => {
    const result = sessionErrorEmbed('timeout');
    expect(result.title).toBe('Session Timed Out');
    expect(result.description).toContain('smaller steps');
    expect(result.color).toBe(0xf0b232);
  });

  test('crash returns red color with dashboard hint', () => {
    const result = sessionErrorEmbed('crash');
    expect(result.title).toBe('Session Crashed');
    expect(result.description).toContain('check the dashboard');
    expect(result.color).toBe(0xff3355);
  });

  test('spawn_error suggests checking provider config', () => {
    const result = sessionErrorEmbed('spawn_error');
    expect(result.title).toBe('Failed to Start');
    expect(result.description).toContain('provider');
    expect(result.color).toBe(0xff3355);
  });

  test('unknown error type uses fallback message', () => {
    const result = sessionErrorEmbed('unknown', 'Something weird happened');
    expect(result.title).toBe('Session Error');
    expect(result.description).toBe('Something weird happened');
    expect(result.color).toBe(0xff3355);
  });

  test('unknown error type without fallback uses default message', () => {
    const result = sessionErrorEmbed('something_else');
    expect(result.description).toBe('An unexpected error occurred.');
  });

  test('fallback message is truncated to 4096 chars', () => {
    const longMsg = 'x'.repeat(5000);
    const result = sessionErrorEmbed('unknown', longMsg);
    expect(result.description.length).toBe(4096);
  });
});
