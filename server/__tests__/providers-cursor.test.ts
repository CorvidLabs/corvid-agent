/**
 * Tests for CursorProvider — first-class LlmProvider wrapping cursor-agent CLI.
 *
 * Issue: #1529
 */
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { CursorProvider } from '../providers/cursor/provider';
import type { LlmCompletionParams } from '../providers/types';

// ─── Mock helpers for Bun.spawn ─────────────────────────────────────────────

/** Build a stream-json stdout from an array of event objects. */
function makeStreamStdout(events: Record<string, unknown>[]): ReadableStream<Uint8Array> {
    const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    return new Blob([lines]).stream();
}

/** Build a mock Bun.spawn result with stream-json stdout. */
function makeMockProc(opts: { exitCode?: number; events?: Record<string, unknown>[]; stderr?: string }) {
    return {
        stdout: makeStreamStdout(opts.events ?? []),
        stderr: new Blob([opts.stderr ?? '']).stream(),
        exited: Promise.resolve(opts.exitCode ?? 0),
        pid: 88888,
        kill: mock(() => {}),
    };
}

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

    // ── doComplete (mocked subprocess) ──────────────────────────────────

    describe('doComplete via complete()', () => {
        let spawnSpy: ReturnType<typeof spyOn>;

        beforeEach(() => {
            // Mock Bun.spawn to avoid actually running cursor-agent
            spawnSpy = spyOn(Bun, 'spawn');
        });

        afterEach(() => {
            mock.restore();
        });

        test('parses content_block_delta events', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                events: [
                    { type: 'content_block_delta', delta: { text: 'Hello ' } },
                    { type: 'content_block_delta', delta: { text: 'world' } },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('Hello world');
            expect(result.model).toBe('auto');
        });

        test('parses assistant_message events', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                events: [
                    { type: 'assistant_message', content: 'response text' },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('response text');
        });

        test('parses text events', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                events: [
                    { type: 'text', text: 'some text' },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('some text');
        });

        test('parses result events with content and model', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                events: [
                    { type: 'result', result: 'final answer', model: 'gpt-5.4-medium' },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('final answer');
            expect(result.model).toBe('gpt-5.4-medium');
        });

        test('calls onStream callback for streamed text', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                events: [
                    { type: 'content_block_delta', delta: { text: 'chunk1' } },
                    { type: 'content_block_delta', delta: { text: 'chunk2' } },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const chunks: string[] = [];
            await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
                onStream: (text) => chunks.push(text),
            });

            expect(chunks).toEqual(['chunk1', 'chunk2']);
        });

        test('calls onActivity for tool_call and content_block_start events', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                events: [
                    { type: 'tool_call', name: 'read_file' },
                    { type: 'content_block_start', index: 0 },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            let activityCount = 0;
            await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
                onActivity: () => { activityCount++; },
            });

            expect(activityCount).toBe(2);
        });

        test('includes system prompt in args when provided', async () => {
            let capturedArgs: string[] = [];
            spawnSpy.mockImplementation((...args: unknown[]) => {
                capturedArgs = args[0] as string[];
                return makeMockProc({ events: [] }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            await provider.complete({
                model: 'auto',
                systemPrompt: 'You are helpful',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(capturedArgs).toContain('--system-prompt');
            expect(capturedArgs).toContain('You are helpful');
        });

        test('uses last user message as prompt', async () => {
            let capturedArgs: string[] = [];
            spawnSpy.mockImplementation((...args: unknown[]) => {
                capturedArgs = args[0] as string[];
                return makeMockProc({ events: [] }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [
                    { role: 'user', content: 'first' },
                    { role: 'assistant', content: 'reply' },
                    { role: 'user', content: 'second question' },
                ],
            });

            expect(capturedArgs[capturedArgs.length - 1]).toBe('second question');
        });

        test('handles non-zero exit code gracefully', async () => {
            spawnSpy.mockImplementation(() => makeMockProc({
                exitCode: 1,
                events: [
                    { type: 'content_block_delta', delta: { text: 'partial' } },
                ],
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            // Should still return whatever content was collected
            expect(result.content).toBe('partial');
        });

        test('skips non-JSON lines in stdout', async () => {
            // Create stdout with mixed JSON and non-JSON lines
            const mixedOutput = 'Some debug output\n' +
                JSON.stringify({ type: 'content_block_delta', delta: { text: 'valid' } }) + '\n' +
                'Another non-json line\n';
            spawnSpy.mockImplementation(() => ({
                stdout: new Blob([mixedOutput]).stream(),
                stderr: new Blob(['']).stream(),
                exited: Promise.resolve(0),
                pid: 88888,
                kill: mock(() => {}),
            }) as unknown as ReturnType<typeof Bun.spawn>);

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('valid');
        });

        test('acquireSlot calls onStatus when queued', async () => {
            // Fill all slots
            await provider.acquireSlot('auto');
            await provider.acquireSlot('auto');

            const statusMessages: string[] = [];
            const controller = new AbortController();

            // Queue then immediately abort to avoid hanging
            const promise = provider.acquireSlot('auto', controller.signal, (msg) => {
                statusMessages.push(msg);
            });

            expect(statusMessages.length).toBe(1);
            expect(statusMessages[0]).toContain('Queued');

            controller.abort();
            await promise;

            // Cleanup
            provider.releaseSlot('auto');
            provider.releaseSlot('auto');
        });
    });
});
