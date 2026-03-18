/**
 * Tests for warnOwnerMismatch — ensures a warning is logged when the
 * repo owner is "corvid-agent" (the bot username) instead of "CorvidLabs".
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { warnOwnerMismatch } from '../github';

describe('warnOwnerMismatch', () => {
    let warnSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        // The logger writes warnings to stderr via writeStderr
        warnSpy = spyOn(process.stderr, 'write');
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    test('logs warning when owner is "corvid-agent"', () => {
        warnOwnerMismatch('corvid-agent/corvid-agent');

        const calls = warnSpy.mock.calls as unknown[][];
        const output = calls.map((c: unknown[]) => String(c[0])).join('');
        expect(output).toContain('corvid-agent');
        expect(output).toContain('CorvidLabs');
        expect(output).toContain('bot username is not an org');
    });

    test('does not log when owner is "CorvidLabs"', () => {
        warnSpy.mockClear();
        warnOwnerMismatch('CorvidLabs/corvid-agent');

        const calls = warnSpy.mock.calls as unknown[][];
        const output = calls.map((c: unknown[]) => String(c[0])).join('');
        expect(output).not.toContain('bot username is not an org');
    });

    test('does not log for other owners', () => {
        warnSpy.mockClear();
        warnOwnerMismatch('some-user/some-repo');

        const calls = warnSpy.mock.calls as unknown[][];
        const output = calls.map((c: unknown[]) => String(c[0])).join('');
        expect(output).not.toContain('bot username is not an org');
    });

    test('suggests correct CorvidLabs owner in warning', () => {
        warnOwnerMismatch('corvid-agent/my-repo');

        const calls = warnSpy.mock.calls as unknown[][];
        const output = calls.map((c: unknown[]) => String(c[0])).join('');
        expect(output).toContain('CorvidLabs/my-repo');
    });
});
