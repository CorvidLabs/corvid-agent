/**
 * Tests for public channel hardening utilities.
 *
 * Covers:
 * - PublicChannelGuard: rate limiting per sender
 * - sanitizePublicChannelContent: control char stripping, truncation, blank line collapsing
 * - buildPublicChannelGuidance: returns non-empty guidance string
 *
 * @module
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
    PublicChannelGuard,
    sanitizePublicChannelContent,
    buildPublicChannelGuidance,
} from '../algochat/public-channel-guard';

// ── PublicChannelGuard: rate limiting ─────────────────────────────────────

describe('PublicChannelGuard', () => {
    let guard: PublicChannelGuard;

    beforeEach(() => {
        guard = new PublicChannelGuard({ rateLimitPerWindow: 3, rateLimitWindowMs: 60_000 });
    });

    test('allows messages within the rate limit', () => {
        expect(guard.checkRateLimit('sender-1').allowed).toBe(true);
        guard.recordSend('sender-1');
        expect(guard.checkRateLimit('sender-1').allowed).toBe(true);
        guard.recordSend('sender-1');
        expect(guard.checkRateLimit('sender-1').allowed).toBe(true);
        guard.recordSend('sender-1');
    });

    test('blocks when rate limit is exceeded', () => {
        // Send 3 messages (at the limit)
        for (let i = 0; i < 3; i++) {
            expect(guard.checkRateLimit('sender-2').allowed).toBe(true);
            guard.recordSend('sender-2');
        }
        // 4th should be blocked
        const result = guard.checkRateLimit('sender-2');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('RATE_LIMITED');
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    test('different senders have independent limits', () => {
        // Exhaust sender-A
        for (let i = 0; i < 3; i++) {
            guard.recordSend('sender-A');
        }
        expect(guard.checkRateLimit('sender-A').allowed).toBe(false);

        // sender-B is still allowed
        expect(guard.checkRateLimit('sender-B').allowed).toBe(true);
    });

    test('unknown sender is allowed', () => {
        expect(guard.checkRateLimit('never-seen-before').allowed).toBe(true);
    });

    test('stop() clears the sweep timer without error', () => {
        expect(() => guard.stop()).not.toThrow();
    });
});

// ── sanitizePublicChannelContent ──────────────────────────────────────────

describe('sanitizePublicChannelContent', () => {
    test('passes through normal text unchanged', () => {
        const input = 'Hello, world!';
        expect(sanitizePublicChannelContent(input)).toBe(input);
    });

    test('strips C0 control characters (except \\t, \\n, \\r)', () => {
        const input = 'Hello\x00\x01\x07\x1Fworld';
        expect(sanitizePublicChannelContent(input)).toBe('Helloworld');
    });

    test('preserves tab, newline, and carriage return', () => {
        const input = 'line1\nline2\ttabbed\rend';
        expect(sanitizePublicChannelContent(input)).toBe(input);
    });

    test('strips DEL and C1 control chars (0x7F-0x9F)', () => {
        const input = 'before\x7Fafter\x80junk\x9Fend';
        expect(sanitizePublicChannelContent(input)).toBe('beforeafterjunkend');
    });

    test('collapses 4+ consecutive newlines to 3', () => {
        const input = 'line1\n\n\n\n\n\nline2';
        const result = sanitizePublicChannelContent(input);
        expect(result).toBe('line1\n\n\nline2');
    });

    test('truncates to maxLength', () => {
        const input = 'a'.repeat(5000);
        expect(sanitizePublicChannelContent(input, 100).length).toBe(100);
    });

    test('default maxLength is 4096', () => {
        const input = 'x'.repeat(5000);
        expect(sanitizePublicChannelContent(input).length).toBe(4096);
    });

    test('empty string passes through', () => {
        expect(sanitizePublicChannelContent('')).toBe('');
    });
});

// ── buildPublicChannelGuidance ────────────────────────────────────────────

describe('buildPublicChannelGuidance', () => {
    test('returns a non-empty string', () => {
        const guidance = buildPublicChannelGuidance();
        expect(typeof guidance).toBe('string');
        expect(guidance.length).toBeGreaterThan(0);
    });

    test('mentions PUBLIC CHANNEL', () => {
        expect(buildPublicChannelGuidance()).toContain('PUBLIC CHANNEL');
    });

    test('includes safety guidance about not revealing internal details', () => {
        const guidance = buildPublicChannelGuidance();
        expect(guidance.toLowerCase()).toContain('internal');
    });
});
