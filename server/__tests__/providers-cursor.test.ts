/**
 * Tests for CursorProvider — first-class LlmProvider wrapping cursor-agent CLI.
 *
 * Issue: #1529
 */
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { LlmCompletionParams } from '../providers/types';

// ── Mock cursor-process before importing provider ────────────────────────
mock.module('../process/cursor-process', () => ({
    hasCursorAccess: () => true,
    getCursorBinPath: () => '/usr/local/bin/cursor-agent',
}));

// Import after mock.module so the provider picks up the mocked functions
const { CursorProvider } = await import('../providers/cursor/provider');

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a mock Bun.spawn result with stream-json stdout. */
function makeMockProc(opts: { exitCode?: number; stdoutLines?: string[]; stderr?: string }) {
    const { exitCode = 0, stdoutLines = [], stderr = '' } = opts;
    const stdoutText = stdoutLines.join('\n') + (stdoutLines.length ? '\n' : '');
    return {
        stdout: new Blob([stdoutText]).stream(),
        stderr: new Blob([stderr]).stream(),
        exited: Promise.resolve(exitCode),
        pid: 88888,
        kill: mock(() => {}),
    };
}

describe('CursorProvider', () => {
    let provider: InstanceType<typeof CursorProvider>;
    let spawnSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        provider = new CursorProvider();
    });

    afterEach(() => {
        spawnSpy?.mockRestore?.();
        mock.restore();
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

    test('isAvailable returns true when binary passes version check', async () => {
        spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
            return makeMockProc({ exitCode: 0 }) as unknown as ReturnType<typeof Bun.spawn>;
        });
        const result = await provider.isAvailable();
        expect(result).toBe(true);
    });

    test('isAvailable returns false when version check fails', async () => {
        spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
            return makeMockProc({ exitCode: 1 }) as unknown as ReturnType<typeof Bun.spawn>;
        });
        const result = await provider.isAvailable();
        expect(result).toBe(false);
    });

    test('isAvailable returns false when spawn throws', async () => {
        spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
            throw new Error('binary not found');
        });
        const result = await provider.isAvailable();
        expect(result).toBe(false);
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

        test('acquireSlot calls onStatus when queued', async () => {
            // Fill all slots
            await provider.acquireSlot('auto');
            await provider.acquireSlot('auto');

            const statusMessages: string[] = [];
            const controller = new AbortController();

            // Third request should queue and call onStatus
            const thirdPromise = provider.acquireSlot('auto', controller.signal, (msg) => {
                statusMessages.push(msg);
            });

            await new Promise((r) => setTimeout(r, 10));
            expect(statusMessages.length).toBe(1);
            expect(statusMessages[0]).toContain('Queued');
            expect(statusMessages[0]).toContain('waiting');

            // Cleanup
            controller.abort();
            await thirdPromise;
            provider.releaseSlot('auto');
            provider.releaseSlot('auto');
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

        test('releaseSlot skips aborted waiters in queue', async () => {
            // Fill all slots
            await provider.acquireSlot('auto');
            await provider.acquireSlot('auto');

            // Queue two waiters: first will be aborted, second should get the slot
            const controller1 = new AbortController();
            const promise1 = provider.acquireSlot('auto', controller1.signal);

            let secondResolved = false;
            const promise2 = provider.acquireSlot('auto').then((result) => {
                secondResolved = true;
                return result;
            });

            await new Promise((r) => setTimeout(r, 10));

            // Abort first waiter (removes from queue via signal handler)
            controller1.abort();
            await promise1; // resolves false

            // Release a slot — second waiter should get it
            provider.releaseSlot('auto');
            const result2 = await promise2;
            expect(result2).toBe(true);
            expect(secondResolved).toBe(true);

            // Cleanup
            provider.releaseSlot('auto');
            provider.releaseSlot('auto');
        });

        test('releaseSlot never goes below zero', () => {
            // Release without acquiring — should not throw or go negative
            provider.releaseSlot('auto');
            provider.releaseSlot('auto');
            // If it went negative, the next acquire would skip incrementing
            // Verify we can still acquire normally
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

    // ── doComplete (via complete) with mocked Bun.spawn ──────────────────

    describe('doComplete (stream-json parsing)', () => {
        test('parses content_block_delta events', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hello ' } }),
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'world!' } }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('Hello world!');
            expect(result.model).toBe('auto');
        });

        test('parses assistant_message events', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'assistant_message', content: 'Generated reply' }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('Generated reply');
        });

        test('parses text events', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'text', text: 'Some text output' }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('Some text output');
        });

        test('parses result event with model and content', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'result', model: 'composer-2', result: 'Final answer' }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('Final answer');
            expect(result.model).toBe('composer-2');
        });

        test('handles tool_call activity events', async () => {
            const activityCalls: number[] = [];
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'tool_call', name: 'read_file' }),
                        JSON.stringify({ type: 'content_block_start', index: 0 }),
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'done' } }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
                onActivity: () => { activityCalls.push(1); },
            });

            expect(result.content).toBe('done');
            // tool_call + content_block_start + content_block_delta = 3 activity calls
            expect(activityCalls.length).toBe(3);
        });

        test('calls onStream callback for text content', async () => {
            const streamed: string[] = [];
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'chunk1' } }),
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'chunk2' } }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
                onStream: (text) => { streamed.push(text); },
            });

            expect(streamed).toEqual(['chunk1', 'chunk2']);
        });

        test('skips non-JSON stdout lines', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        'Some plain text log line',
                        '',
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'actual content' } }),
                        'another non-json line',
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('actual content');
        });

        test('includes system prompt in spawn args', async () => {
            let capturedArgs: string[] = [];
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
                capturedArgs = args[0] as string[];
                return makeMockProc({ stdoutLines: [] }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            await provider.complete({
                model: 'auto',
                systemPrompt: 'You are helpful',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(capturedArgs).toContain('--system-prompt');
            expect(capturedArgs).toContain('You are helpful');
            expect(capturedArgs).toContain('--model');
            expect(capturedArgs).toContain('auto');
            expect(capturedArgs).toContain('--print');
            expect(capturedArgs).toContain('--output-format');
            expect(capturedArgs).toContain('stream-json');
        });

        test('uses last user message as prompt', async () => {
            let capturedArgs: string[] = [];
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
                capturedArgs = args[0] as string[];
                return makeMockProc({ stdoutLines: [] }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [
                    { role: 'user', content: 'first message' },
                    { role: 'assistant', content: 'reply' },
                    { role: 'user', content: 'second message' },
                ],
            });

            // Last positional arg should be the last user message
            expect(capturedArgs[capturedArgs.length - 1]).toBe('second message');
        });

        test('omits --system-prompt flag when systemPrompt is empty', async () => {
            let capturedArgs: string[] = [];
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
                capturedArgs = args[0] as string[];
                return makeMockProc({ stdoutLines: [] }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            await provider.complete({
                model: 'auto',
                systemPrompt: '',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(capturedArgs).not.toContain('--system-prompt');
        });

        test('handles non-zero exit code gracefully', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    exitCode: 1,
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'partial' } }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            // Should still return partial content
            expect(result.content).toBe('partial');
        });

        test('handles empty stdout', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({ stdoutLines: [] }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('');
            expect(result.model).toBe('auto');
        });

        test('abort signal is wired up and cleaned up', async () => {
            const controller = new AbortController();

            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'ok' } }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
                signal: controller.signal,
            });

            expect(result.content).toBe('ok');
            // Signal listener should have been cleaned up in finally block
            // Aborting after completion should not throw
            controller.abort();
        });

        test('content_block_delta with missing delta text is ignored', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_delta', delta: {} }),
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'valid' } }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('valid');
        });

        test('result event with empty string result is not appended', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'content' } }),
                        JSON.stringify({ type: 'result', model: 'auto', result: '' }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('content');
        });

        test('result event with non-string result is not appended', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'result', model: 'auto', result: 42 }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('');
        });

        test('mixed event types produce correct content', async () => {
            spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
                return makeMockProc({
                    stdoutLines: [
                        JSON.stringify({ type: 'content_block_start', index: 0 }),
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'Part 1. ' } }),
                        JSON.stringify({ type: 'tool_call', name: 'read' }),
                        JSON.stringify({ type: 'content_block_delta', delta: { text: 'Part 2.' } }),
                        JSON.stringify({ type: 'result', model: 'composer-2', result: ' Done.' }),
                    ],
                }) as unknown as ReturnType<typeof Bun.spawn>;
            });

            const result = await provider.complete({
                model: 'auto',
                systemPrompt: 'test',
                messages: [{ role: 'user', content: 'hi' }],
            });

            expect(result.content).toBe('Part 1. Part 2. Done.');
            expect(result.model).toBe('composer-2');
        });
    });
});
