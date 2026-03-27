/**
 * Tests for cursor-agent exit code classification (issue #1531).
 *
 * Validates that classifyCursorError() correctly maps exit codes and stderr
 * patterns to transient (retryable) vs permanent (fail-fast) errors.
 */
import { describe, test, expect } from 'bun:test';
import {
    classifyCursorError,
    CURSOR_EXIT_CODE_MAP,
    STREAM_IDLE_TIMEOUT_MS,
} from '../process/cursor-process';

describe('classifyCursorError', () => {
    // ── Exit code 0: success ────────────────────────────────────────────

    test('exit code 0 is classified as success', () => {
        const result = classifyCursorError(0);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('success');
    });

    test('exit code 0 with stderr is still success', () => {
        const result = classifyCursorError(0, 'some warning output');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('success');
    });

    // ── Exit code 2: invalid arguments (permanent) ─────────────────────

    test('exit code 2 is permanent invalid_args', () => {
        const result = classifyCursorError(2);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('invalid_args');
        expect(result.message).toContain('Invalid arguments');
    });

    test('exit code 2 ignores transient stderr patterns', () => {
        // Even if stderr has ECONNRESET, exit code 2 is always permanent
        const result = classifyCursorError(2, 'ECONNRESET happened');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('invalid_args');
    });

    // ── Exit code 126/127: binary issues (permanent) ────────────────────

    test('exit code 126 is permanent config_error', () => {
        const result = classifyCursorError(126);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('config_error');
        expect(result.message).toContain('not executable');
    });

    test('exit code 127 is permanent config_error', () => {
        const result = classifyCursorError(127);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('config_error');
        expect(result.message).toContain('not found');
    });

    // ── Signal-based exit codes ─────────────────────────────────────────

    test('exit code 137 (SIGKILL) is transient', () => {
        const result = classifyCursorError(137);
        expect(result.transient).toBe(true);
        expect(result.category).toBe('general_error');
    });

    test('exit code 143 (SIGTERM) is transient', () => {
        const result = classifyCursorError(143);
        expect(result.transient).toBe(true);
        expect(result.category).toBe('general_error');
    });

    test('exit code 130 (SIGINT) is non-transient', () => {
        const result = classifyCursorError(130);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('general_error');
    });

    // ── Exit code 1 with transient stderr patterns ──────────────────────

    test('ECONNRESET in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'Error: read ECONNRESET');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    test('ETIMEDOUT in stderr → transient network_timeout', () => {
        const result = classifyCursorError(1, 'connect ETIMEDOUT 1.2.3.4:443');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_timeout');
    });

    test('ECONNREFUSED in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'connect ECONNREFUSED 127.0.0.1:8080');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    test('EPIPE in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'write EPIPE');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    test('rate limit in stderr → transient rate_limit', () => {
        const result = classifyCursorError(1, 'Error: rate limit exceeded');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('rate_limit');
    });

    test('HTTP 429 in stderr → transient rate_limit', () => {
        const result = classifyCursorError(1, 'HTTP error 429 Too Many Requests');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('rate_limit');
    });

    test('HTTP 503 in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'Service Unavailable 503');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    test('HTTP 502 in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'Bad Gateway 502');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    test('timeout in stderr → transient network_timeout', () => {
        const result = classifyCursorError(1, 'Request timeout after 30000ms');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_timeout');
    });

    test('overloaded in stderr → transient rate_limit', () => {
        const result = classifyCursorError(1, 'Server is overloaded, please try again');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('rate_limit');
    });

    test('fetch failed in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'TypeError: fetch failed');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    test('network error in stderr → transient network_error', () => {
        const result = classifyCursorError(1, 'NetworkError: Failed to fetch');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('network_error');
    });

    // ── Exit code 1 with permanent stderr patterns ──────────────────────

    test('auth failure in stderr → permanent auth_failure', () => {
        const result = classifyCursorError(1, 'authentication failed: invalid token');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('auth_failure');
    });

    test('invalid API key in stderr → permanent auth_failure', () => {
        const result = classifyCursorError(1, 'Error: invalid API key');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('auth_failure');
    });

    test('unauthorized in stderr → permanent auth_failure', () => {
        const result = classifyCursorError(1, 'HTTP 401 Unauthorized');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('auth_failure');
    });

    test('forbidden in stderr → permanent auth_failure', () => {
        const result = classifyCursorError(1, 'HTTP 403 Forbidden');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('auth_failure');
    });

    test('invalid model in stderr → permanent invalid_model', () => {
        const result = classifyCursorError(1, 'Error: invalid model "nonexistent-v9"');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('invalid_model');
    });

    test('model not found in stderr → permanent invalid_model', () => {
        const result = classifyCursorError(1, 'model not found: foo-bar');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('invalid_model');
    });

    test('unknown model in stderr → permanent invalid_model', () => {
        const result = classifyCursorError(1, 'unknown model identifier xyz');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('invalid_model');
    });

    test('invalid config in stderr → permanent config_error', () => {
        const result = classifyCursorError(1, 'Error: invalid config: missing required field');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('config_error');
    });

    // ── Priority: permanent patterns checked before transient ────────────

    test('auth error takes precedence over transient patterns', () => {
        // Stderr has both auth failure and timeout — auth should win
        const result = classifyCursorError(1, 'authentication failed after timeout');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('auth_failure');
    });

    // ── Exit code 1 with no matching patterns ───────────────────────────

    test('exit code 1 with unrecognized stderr → non-transient general_error', () => {
        const result = classifyCursorError(1, 'some random error');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('general_error');
        expect(result.message).toContain('some random error');
    });

    test('exit code 1 with empty stderr → non-transient general_error', () => {
        const result = classifyCursorError(1, '');
        expect(result.transient).toBe(false);
        expect(result.category).toBe('general_error');
        expect(result.message).toContain('error code 1');
    });

    test('exit code 1 with no stderr arg → non-transient general_error', () => {
        const result = classifyCursorError(1);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('general_error');
    });

    // ── Null exit code (process crashed) ────────────────────────────────

    test('null exit code → transient unknown', () => {
        const result = classifyCursorError(null);
        expect(result.transient).toBe(true);
        expect(result.category).toBe('unknown');
        expect(result.message).toContain('abnormally');
    });

    test('null exit code with stderr → transient unknown', () => {
        const result = classifyCursorError(null, 'segfault');
        expect(result.transient).toBe(true);
        expect(result.category).toBe('unknown');
    });

    // ── Unknown non-zero exit codes ─────────────────────────────────────

    test('unknown exit code (42) → non-transient unknown', () => {
        const result = classifyCursorError(42);
        expect(result.transient).toBe(false);
        expect(result.category).toBe('unknown');
        expect(result.message).toContain('42');
    });

    // ── Error message format for FallbackManager ────────────────────────

    test('error messages contain keywords FallbackManager.isTransientError() recognizes', () => {
        // The FallbackManager checks for 'rate limit', '429', '503', '502', 'timeout',
        // 'econnrefused', 'fetch failed', 'overloaded' — transient classifications
        // should produce messages the fallback manager can detect.
        const rateLimit = classifyCursorError(1, 'rate limit');
        expect(rateLimit.message.toLowerCase()).toContain('rate limit');

        const timeout = classifyCursorError(1, 'ETIMEDOUT');
        expect(timeout.message.toLowerCase()).toContain('timed out');
    });
});

describe('CURSOR_EXIT_CODE_MAP', () => {
    test('has entry for exit code 0 (success)', () => {
        expect(CURSOR_EXIT_CODE_MAP[0]).toBeDefined();
        expect(CURSOR_EXIT_CODE_MAP[0].category).toBe('success');
    });

    test('has entry for exit code 2 (invalid args)', () => {
        expect(CURSOR_EXIT_CODE_MAP[2]).toBeDefined();
        expect(CURSOR_EXIT_CODE_MAP[2].transient).toBe(false);
    });

    test('all entries have required fields', () => {
        for (const [_code, entry] of Object.entries(CURSOR_EXIT_CODE_MAP)) {
            expect(entry.category).toBeTruthy();
            expect(typeof entry.transient).toBe('boolean');
            expect(entry.message).toBeTruthy();
        }
    });
});

describe('STREAM_IDLE_TIMEOUT_MS', () => {
    test('is 120 seconds', () => {
        expect(STREAM_IDLE_TIMEOUT_MS).toBe(120_000);
    });
});
