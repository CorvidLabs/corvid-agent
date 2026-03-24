/**
 * Tests for BuddyService.isApproval — the approval detection logic.
 *
 * Since isApproval is private, we test it via a thin wrapper that
 * instantiates BuddyService with a minimal mock and exposes the method.
 */
import { describe, test, expect } from 'bun:test';
import { BuddyService } from '../buddy/service';

// BuddyService needs db + processManager, but isApproval is pure logic.
// We create a minimal instance and access the private method via bracket notation.
const service = new BuddyService({
    db: {} as any,
    processManager: {} as any,
});

function isApproval(output: string): boolean {
    return (service as any).isApproval(output);
}

describe('isApproval', () => {
    // ── Positive cases ───────────────────────────────────────────────
    describe('detects approval', () => {
        test('plain LGTM', () => {
            expect(isApproval('LGTM')).toBe(true);
        });

        test('lowercase lgtm', () => {
            expect(isApproval('lgtm')).toBe(true);
        });

        test('looks good to me', () => {
            expect(isApproval('Looks good to me!')).toBe(true);
        });

        test('approved', () => {
            expect(isApproval('Approved.')).toBe(true);
        });

        test('no issues found is rejected by negative pattern (known edge case)', () => {
            // The negative pattern /issues?\s+(found|...)/ fires before the
            // approval phrase check, so "no issues found" is treated as
            // qualified feedback. This tests current behavior.
            expect(isApproval('No issues found.')).toBe(false);
        });

        test('no issues (without "found")', () => {
            expect(isApproval('No issues.')).toBe(true);
        });

        test('ship it', () => {
            expect(isApproval('Ship it!')).toBe(true);
        });

        test('lgtm with minor context', () => {
            expect(isApproval('Everything checks out. LGTM.')).toBe(true);
        });
    });

    // ── Negative qualifier rejection ─────────────────────────────────
    describe('rejects qualified approvals', () => {
        test('not approved', () => {
            expect(isApproval('Not approved yet.')).toBe(false);
        });

        test('approved but with issues', () => {
            expect(isApproval('Approved, but there are two issues remaining.')).toBe(false);
        });

        test('lgtm however', () => {
            expect(isApproval('LGTM, however the tests are missing.')).toBe(false);
        });

        test('with reservations', () => {
            expect(isApproval('Approved with reservations about the error handling.')).toBe(false);
        });

        test("don't approve yet", () => {
            expect(isApproval("I don't think this is ready. Not approved.")).toBe(false);
        });

        test('issues remain', () => {
            expect(isApproval('LGTM overall, but issues still remain with the tests.')).toBe(false);
        });

        test('do not merge', () => {
            expect(isApproval('Do not merge this yet. Approved in principle only.')).toBe(false);
        });
    });

    // ── Length threshold ─────────────────────────────────────────────
    describe('rejects long responses', () => {
        test('approval buried in long text is not detected', () => {
            const longText = 'x'.repeat(250) + ' LGTM ' + 'y'.repeat(100);
            expect(isApproval(longText)).toBe(false);
        });

        test('short approval within limit is detected', () => {
            const text = 'Code review complete. LGTM.';
            expect(isApproval(text)).toBe(true);
        });
    });

    // ── Non-approval responses ───────────────────────────────────────
    describe('rejects non-approval', () => {
        test('feedback with suggestions', () => {
            expect(isApproval('Please fix the error handling in processQueue.')).toBe(false);
        });

        test('empty string', () => {
            expect(isApproval('')).toBe(false);
        });

        test('generic praise without approval phrase', () => {
            expect(isApproval('Great work on this feature!')).toBe(false);
        });
    });
});
