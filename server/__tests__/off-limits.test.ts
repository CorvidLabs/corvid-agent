/**
 * Tests for server/github/off-limits.ts
 *
 * Validates that the off-limits repo blocklist is loaded and enforced correctly.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { isRepoOffLimits, assertRepoAllowed, _resetCache } from '../github/off-limits';

beforeEach(() => _resetCache());

describe('off-limits repos', () => {
    test('blocks repos listed in off-limits-repos.txt', () => {
        expect(isRepoOffLimits('jellyfin/Swiftfin')).toBe(true);
    });

    test('matching is case-insensitive', () => {
        expect(isRepoOffLimits('Jellyfin/SWIFTFIN')).toBe(true);
        expect(isRepoOffLimits('JELLYFIN/swiftfin')).toBe(true);
    });

    test('allows repos not on the list', () => {
        expect(isRepoOffLimits('CorvidLabs/corvid-agent')).toBe(false);
        expect(isRepoOffLimits('octocat/hello-world')).toBe(false);
    });

    test('assertRepoAllowed throws for blocked repos', () => {
        expect(() => assertRepoAllowed('jellyfin/Swiftfin')).toThrow(/off-limits/);
    });

    test('assertRepoAllowed does not throw for allowed repos', () => {
        expect(() => assertRepoAllowed('CorvidLabs/corvid-agent')).not.toThrow();
    });

    test('blocks contributor-owned repos', () => {
        expect(isRepoOffLimits('CorvidLabs/rust-server')).toBe(true);
        expect(isRepoOffLimits('CorvidLabs/rust-game')).toBe(true);
    });
});
