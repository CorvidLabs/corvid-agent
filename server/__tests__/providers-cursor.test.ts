/**
 * Tests for CursorProvider — first-class LlmProvider wrapping cursor-agent CLI.
 *
 * Issue: #1529
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { CursorProvider } from '../providers/cursor/provider';
import type { LlmCompletionParams } from '../providers/types';

describe('CursorProvider', () => {
    let provider: CursorProvider;

    beforeEach(() => {
        provider = new CursorProvider();
    });

    // ── Provider identity ────────────────────────────────────────────────

    test('type is cursor', () => {
        expect(provider.type).toBe('cursor');
    });

    test('executionMode is direct', () => {
        expect(provider.executionMode).toBe('direct');
    });

    // ── getInfo ──────────────────────────────────────────────────────────

    test('getInfo returns cursor provider info', () => {
        const info = provider.getInfo();
        expect(info.type).toBe('cursor');
        expect(info.name).toBe('Cursor Agent');
        expect(info.executionMode).toBe('direct');
        expect(info.supportsTools).toBe(true);
        expect(Array.isArray(info.models)).toBe(true);
        expect(info.models.length).toBeGreaterThan(0);
        expect(info.defaultModel).toBeTruthy();
    });

    test('getInfo models include known cursor models', () => {
        const info = provider.getInfo();
        expect(info.models).toContain('auto');
        expect(info.models).toContain('composer-2');
    });

    // ── isAvailable ──────────────────────────────────────────────────────

    test('isAvailable returns a boolean', async () => {
        const result = await provider.isAvailable();
        expect(typeof result).toBe('boolean');
    });

    // ── Slot management ──────────────────────────────────────────────────

    describe('acquireSlot / releaseSlot', () => {
        test('acquireSlot succeeds when slots available', async () => {
            const acquired = await provider.acquireSlot('auto');
            expect(acquired).toBe(true);
            provider.releaseSlot('auto');
        });

        test('acquireSlot respects abort signal', async () => {
            const controller = new AbortController();
            controller.abort();
            const acquired = await provider.acquireSlot('auto', controller.signal);
            expect(acquired).toBe(false);
        });

        test('releaseSlot unblocks queued requests', async () => {
            // Fill all slots
            const acquired1 = await provider.acquireSlot('auto');
            const acquired2 = await provider.acquireSlot('auto');
            expect(acquired1).toBe(true);
            expect(acquired2).toBe(true);

            // Third request should queue
            let thirdResolved = false;
            const thirdPromise = provider.acquireSlot('auto').then((result) => {
                thirdResolved = true;
                return result;
            });

            // Not yet resolved
            await new Promise((r) => setTimeout(r, 10));
            expect(thirdResolved).toBe(false);

            // Release one slot — third should resolve
            provider.releaseSlot('auto');
            const result = await thirdPromise;
            expect(result).toBe(true);
            expect(thirdResolved).toBe(true);

            // Cleanup
            provider.releaseSlot('auto');
            provider.releaseSlot('auto');
        });

        test('queued request returns false when aborted', async () => {
            // Fill all slots
            await provider.acquireSlot('auto');
            await provider.acquireSlot('auto');

            // Third request with abort
            const controller = new AbortController();
            const thirdPromise = provider.acquireSlot('auto', controller.signal);

            await new Promise((r) => setTimeout(r, 10));
            controller.abort();

            const result = await thirdPromise;
            expect(result).toBe(false);

            // Cleanup
            provider.releaseSlot('auto');
            provider.releaseSlot('auto');
        });
    });

    // ── complete (basic validation) ──────────────────────────────────────

    test('complete throws on missing model', async () => {
        const params: LlmCompletionParams = {
            model: '',
            systemPrompt: 'test',
            messages: [{ role: 'user', content: 'hello' }],
        };
        await expect(provider.complete(params)).rejects.toThrow('[cursor] model is required');
    });

    test('complete throws on empty messages', async () => {
        const params: LlmCompletionParams = {
            model: 'auto',
            systemPrompt: 'test',
            messages: [],
        };
        await expect(provider.complete(params)).rejects.toThrow('[cursor] at least one message is required');
    });
});
