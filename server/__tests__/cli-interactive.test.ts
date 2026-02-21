import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { buildPromptWithHistory, handleMessage } from '../../cli/commands/interactive';
import type { Turn } from '../../cli/commands/interactive';
import type { ServerMessage } from '../../shared/ws-protocol';
import { resetStreamState } from '../../cli/render';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Capture process.stdout.write calls and return written content. */
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

/** Capture process.stderr.write calls. */
function captureStderr(fn: () => void): string {
    const chunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((data: string | Uint8Array) => {
        chunks.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
        return true;
    }) as typeof process.stderr.write;
    try {
        fn();
    } finally {
        process.stderr.write = origWrite;
    }
    return chunks.join('');
}

/** Capture console.log calls. */
function captureConsoleLog(fn: () => void): string[] {
    const lines: string[] = [];
    const origLog = console.log;
    console.log = mock((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    });
    try {
        fn();
    } finally {
        console.log = origLog;
    }
    return lines;
}

/** Capture console.error calls. */
function captureConsoleError(fn: () => void): string[] {
    const lines: string[] = [];
    const origError = console.error;
    console.error = mock((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    });
    try {
        fn();
    } finally {
        console.error = origError;
    }
    return lines;
}

/** Strip ANSI escape codes. */
function stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── buildPromptWithHistory ─────────────────────────────────────────────────

describe('buildPromptWithHistory', () => {
    test('returns current message when history is empty', () => {
        const result = buildPromptWithHistory([], 'Hello');
        expect(result).toBe('Hello');
    });

    test('wraps history in conversation_history XML tags', () => {
        const history: Turn[] = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello there' },
        ];
        const result = buildPromptWithHistory(history, 'How are you?');
        expect(result).toContain('<conversation_history>');
        expect(result).toContain('</conversation_history>');
    });

    test('labels user turns as "User:"', () => {
        const history: Turn[] = [
            { role: 'user', content: 'My question' },
        ];
        const result = buildPromptWithHistory(history, 'Follow up');
        expect(result).toContain('User: My question');
    });

    test('labels assistant turns as "Assistant:"', () => {
        const history: Turn[] = [
            { role: 'assistant', content: 'My answer' },
        ];
        const result = buildPromptWithHistory(history, 'Next');
        expect(result).toContain('Assistant: My answer');
    });

    test('includes current message after the history block', () => {
        const history: Turn[] = [
            { role: 'user', content: 'First' },
        ];
        const result = buildPromptWithHistory(history, 'Current');
        const lines = result.split('\n');
        const lastLine = lines[lines.length - 1];
        expect(lastLine).toBe('Current');
    });

    test('preserves turn order', () => {
        const history: Turn[] = [
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'A1' },
            { role: 'user', content: 'Q2' },
            { role: 'assistant', content: 'A2' },
        ];
        const result = buildPromptWithHistory(history, 'Q3');
        const q1Idx = result.indexOf('User: Q1');
        const a1Idx = result.indexOf('Assistant: A1');
        const q2Idx = result.indexOf('User: Q2');
        const a2Idx = result.indexOf('Assistant: A2');
        expect(q1Idx).toBeLessThan(a1Idx);
        expect(a1Idx).toBeLessThan(q2Idx);
        expect(q2Idx).toBeLessThan(a2Idx);
    });

    test('trims oldest turns when history exceeds MAX_HISTORY_CHARS (12000)', () => {
        // Create history that exceeds 12,000 chars
        const longContent = 'x'.repeat(5000);
        const history: Turn[] = [
            { role: 'user', content: longContent },      // 5000 chars
            { role: 'assistant', content: longContent },  // 5000 chars
            { role: 'user', content: longContent },       // 5000 chars = 15000 total
        ];
        const result = buildPromptWithHistory(history, 'Current');

        // The oldest turn(s) should be trimmed
        // Walking backward: turn[2]=5000, turn[1]=5000 (total 10000), turn[0]=5000 (total 15000 > 12000, break)
        // So startIdx = 1, meaning only turns[1] and turns[2] are included
        const lines = result.split('\n');
        const historyBlock = lines.filter(l => l.startsWith('User:') || l.startsWith('Assistant:'));
        expect(historyBlock.length).toBe(2); // Only last 2 turns fit
    });

    test('keeps all history when under MAX_HISTORY_CHARS', () => {
        const history: Turn[] = [
            { role: 'user', content: 'Short question' },
            { role: 'assistant', content: 'Short answer' },
        ];
        const result = buildPromptWithHistory(history, 'Another');
        expect(result).toContain('User: Short question');
        expect(result).toContain('Assistant: Short answer');
    });

    test('result has correct structure: XML tags, history, blank line, current message', () => {
        const history: Turn[] = [
            { role: 'user', content: 'Hello' },
        ];
        const result = buildPromptWithHistory(history, 'World');
        const lines = result.split('\n');
        expect(lines[0]).toBe('<conversation_history>');
        expect(lines[1]).toBe('User: Hello');
        expect(lines[2]).toBe('</conversation_history>');
        expect(lines[3]).toBe(''); // blank line
        expect(lines[4]).toBe('World');
    });

    test('handles single-turn history', () => {
        const history: Turn[] = [
            { role: 'user', content: 'Only one' },
        ];
        const result = buildPromptWithHistory(history, 'New');
        expect(result).toContain('User: Only one');
        expect(result).toContain('New');
    });

    test('handles history with exactly MAX_HISTORY_CHARS', () => {
        // Build history that exactly fits
        const content = 'a'.repeat(6000);
        const history: Turn[] = [
            { role: 'user', content },     // 6000
            { role: 'assistant', content }, // 6000, total = 12000
        ];
        const result = buildPromptWithHistory(history, 'Test');
        // Both turns should be included since we break when chars > 12000
        // Walking backward: turn[1]=6000, turn[0]=6000 (total 12000, not > 12000)
        // So startIdx = 0, all turns included
        expect(result).toContain('User:');
        expect(result).toContain('Assistant:');
    });
});

// ─── handleMessage ──────────────────────────────────────────────────────────

describe('handleMessage', () => {
    const agentId = 'test-agent-123';

    // Shared callback mocks
    let doneCalled: boolean;
    let chunksCalled: string[];
    let headerEnsured: boolean;

    function makeCallbacks() {
        doneCalled = false;
        chunksCalled = [];
        headerEnsured = false;
        return {
            getHasStreamContent: () => chunksCalled.length > 0,
            onDone: () => { doneCalled = true; },
            onChunk: (chunk: string) => { chunksCalled.push(chunk); return true; },
            ensureHeader: () => { headerEnsured = true; },
        };
    }

    beforeEach(() => {
        resetStreamState();
    });

    describe('chat_stream', () => {
        test('renders chunk when agentId matches', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_stream',
                agentId,
                chunk: 'Hello world',
                done: false,
            };

            // Capture stdout from renderStreamChunk
            captureStdout(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(chunksCalled).toContain('Hello world');
            expect(doneCalled).toBe(false);
        });

        test('calls onDone when done=true and has stream content', () => {
            const cbs = makeCallbacks();
            // First send a chunk
            captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId, chunk: 'data', done: false },
                    agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader,
                );
            });

            // Then send done
            handleMessage(
                { type: 'chat_stream', agentId, chunk: '', done: true },
                agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader,
            );

            expect(doneCalled).toBe(true);
        });

        test('does not call onDone when done=true but no stream content', () => {
            const cbs = makeCallbacks();
            handleMessage(
                { type: 'chat_stream', agentId, chunk: '', done: true },
                agentId, () => false, cbs.onDone, cbs.onChunk, cbs.ensureHeader,
            );
            expect(doneCalled).toBe(false);
        });

        test('ignores chunks from different agent', () => {
            const cbs = makeCallbacks();
            captureStdout(() => {
                handleMessage(
                    { type: 'chat_stream', agentId: 'other-agent', chunk: 'ignored', done: false },
                    agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader,
                );
            });
            expect(chunksCalled.length).toBe(0);
        });
    });

    describe('algochat_message', () => {
        test('renders outbound message content when no prior stream content', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'algochat_message',
                participant: 'agent',
                content: 'AlgoChat response',
                direction: 'outbound',
            };

            captureStdout(() => {
                handleMessage(msg, agentId, () => false, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(chunksCalled).toContain('AlgoChat response');
            expect(doneCalled).toBe(true);
        });

        test('calls onDone for outbound even when already has stream content', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'algochat_message',
                participant: 'agent',
                content: 'Response',
                direction: 'outbound',
            };

            captureStdout(() => {
                handleMessage(msg, agentId, () => true, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            // onChunk should NOT be called since getHasStreamContent returns true
            expect(chunksCalled.length).toBe(0);
            expect(doneCalled).toBe(true);
        });

        test('ignores inbound messages', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'algochat_message',
                participant: 'user',
                content: 'User input',
                direction: 'inbound',
            };

            handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            expect(chunksCalled.length).toBe(0);
            expect(doneCalled).toBe(false);
        });

        test('ignores status messages', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'algochat_message',
                participant: 'system',
                content: 'connected',
                direction: 'status',
            };

            handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            expect(chunksCalled.length).toBe(0);
            expect(doneCalled).toBe(false);
        });
    });

    describe('chat_tool_use', () => {
        test('renders tool use when agentId matches', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_tool_use',
                agentId,
                toolName: 'bash',
                input: 'ls -la',
            };

            const logLines = captureConsoleLog(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(headerEnsured).toBe(true);
            const plain = logLines.map(stripAnsi).join('\n');
            expect(plain).toContain('bash');
            expect(plain).toContain('ls -la');
        });

        test('ignores tool use from different agent', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_tool_use',
                agentId: 'other-agent',
                toolName: 'bash',
                input: 'ls',
            };

            const logLines = captureConsoleLog(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(headerEnsured).toBe(false);
            expect(logLines.length).toBe(0);
        });
    });

    describe('chat_thinking', () => {
        test('renders thinking indicator when agentId matches and active', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_thinking',
                agentId,
                active: true,
            };

            const stderrOutput = captureStderr(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(headerEnsured).toBe(true);
            expect(stripAnsi(stderrOutput)).toContain('thinking...');
        });

        test('clears thinking when inactive', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_thinking',
                agentId,
                active: false,
            };

            const stderrOutput = captureStderr(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(headerEnsured).toBe(true);
            expect(stderrOutput).toContain('\x1b[K');
        });

        test('ignores thinking from different agent', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_thinking',
                agentId: 'other-agent',
                active: true,
            };

            captureStderr(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(headerEnsured).toBe(false);
        });
    });

    describe('chat_session', () => {
        test('is suppressed (no side effects)', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'chat_session',
                agentId,
                sessionId: 'sess-123',
            };

            handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            expect(doneCalled).toBe(false);
            expect(chunksCalled.length).toBe(0);
            expect(headerEnsured).toBe(false);
        });
    });

    describe('error', () => {
        test('prints error and calls onDone', () => {
            const cbs = makeCallbacks();
            const msg: ServerMessage = {
                type: 'error',
                message: 'Something went wrong',
            };

            const errorLines = captureConsoleError(() => {
                handleMessage(msg, agentId, cbs.getHasStreamContent, cbs.onDone, cbs.onChunk, cbs.ensureHeader);
            });

            expect(doneCalled).toBe(true);
            const plain = errorLines.map(stripAnsi).join('\n');
            expect(plain).toContain('Something went wrong');
        });
    });
});
