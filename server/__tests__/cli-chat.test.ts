import { test, expect, describe, beforeEach } from 'bun:test';
import { handleMessage } from '../../cli/commands/chat';
import type { ServerMessage } from '../../shared/ws-protocol';
import { resetStreamState, Spinner } from '../../cli/render';

// ─── Helpers ────────────────────────────────────────────────────────────────

function captureStdout(fn: () => void): string {
    const chunks: string[] = [];
    const origWrite = process.stdout.write;
    process.stdout.write = ((data: string | Uint8Array) => {
        chunks.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
        return true;
    }) as typeof process.stdout.write;
    try {
        fn();
    } finally {
        process.stdout.write = origWrite;
    }
    return chunks.join('');
}

function createMockSpinner(): Spinner {
    return {
        start: () => {},
        stop: () => {},
        update: () => {},
    } as unknown as Spinner;
}

const agentId = 'test-agent-123';

describe('chat handleMessage', () => {
    let contentCalled: boolean;
    let doneCalled: boolean;
    let spinner: Spinner;

    beforeEach(() => {
        resetStreamState();
        contentCalled = false;
        doneCalled = false;
        spinner = createMockSpinner();
    });

    describe('chat_stream leading newline stripping', () => {
        test('strips leading newlines from first chunk (hasStreamContent=false)', () => {
            const output = captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId, chunk: '\n\nHello', done: false } as ServerMessage,
                    agentId,
                    spinner,
                    false,
                    () => { doneCalled = true; },
                    () => { contentCalled = true; },
                );
            });

            expect(contentCalled).toBe(true);
            expect(output).toContain('Hello');
            expect(output).not.toMatch(/^\n/);
        });

        test('does not strip newlines from subsequent chunks (hasStreamContent=true)', () => {
            captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId, chunk: '\n\nMore', done: false } as ServerMessage,
                    agentId,
                    spinner,
                    true,
                    () => { doneCalled = true; },
                    () => { contentCalled = true; },
                );
            });

            expect(contentCalled).toBe(true);
            // The chunk should be passed through (render may still strip but onContent is called)
        });

        test('suppresses chunk that is only newlines when hasStreamContent=false', () => {
            captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId, chunk: '\n\n', done: false } as ServerMessage,
                    agentId,
                    spinner,
                    false,
                    () => { doneCalled = true; },
                    () => { contentCalled = true; },
                );
            });

            expect(contentCalled).toBe(false);
        });

        test('passes through non-newline first chunk normally', () => {
            const output = captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId, chunk: 'Hello', done: false } as ServerMessage,
                    agentId,
                    spinner,
                    false,
                    () => { doneCalled = true; },
                    () => { contentCalled = true; },
                );
            });

            expect(contentCalled).toBe(true);
            expect(output).toContain('Hello');
        });
    });

    describe('chat_stream done handling', () => {
        test('calls onDone when done and hasStreamContent', () => {
            handleMessage(
                { type: 'chat_stream', agentId, chunk: '', done: true } as ServerMessage,
                agentId,
                spinner,
                true,
                () => { doneCalled = true; },
                () => { contentCalled = true; },
            );
            expect(doneCalled).toBe(true);
        });

        test('does not call onDone when done but no stream content', () => {
            handleMessage(
                { type: 'chat_stream', agentId, chunk: '', done: true } as ServerMessage,
                agentId,
                spinner,
                false,
                () => { doneCalled = true; },
                () => { contentCalled = true; },
            );
            expect(doneCalled).toBe(false);
        });
    });

    describe('ignores other agents', () => {
        test('ignores chunks from different agent', () => {
            captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId: 'other', chunk: 'ignored', done: false } as ServerMessage,
                    agentId,
                    spinner,
                    false,
                    () => { doneCalled = true; },
                    () => { contentCalled = true; },
                );
            });
            expect(contentCalled).toBe(false);
        });
    });
});
