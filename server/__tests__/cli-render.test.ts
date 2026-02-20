import { test, expect, describe, beforeEach, mock } from 'bun:test';
import {
    c,
    Spinner,
    printError,
    printSuccess,
    printWarning,
    printHeader,
    printTable,
    renderMarkdown,
    renderToolUse,
    renderThinking,
    renderAgentPrefix,
    renderAgentSuffix,
    renderStreamChunk,
    resetStreamState,
    flushStreamBuffer,
    stripLeakedToolCalls,
    printPrompt,
} from '../../cli/render';

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

/** Capture console.log calls and return logged lines. */
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

/** Strip ANSI escape codes for easier assertions. */
function stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Color Utilities ────────────────────────────────────────────────────────

describe('Color utilities (c)', () => {
    test('all color functions return strings containing the input', () => {
        const fns = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'gray', 'white'] as const;
        for (const name of fns) {
            const result = c[name]('hello');
            expect(typeof result).toBe('string');
            expect(result).toContain('hello');
        }
    });

    test('all bg functions return strings containing the input', () => {
        const fns = ['bgRed', 'bgGreen', 'bgBlue'] as const;
        for (const name of fns) {
            const result = c[name]('world');
            expect(typeof result).toBe('string');
            expect(result).toContain('world');
        }
    });

    test('red wraps with correct ANSI codes', () => {
        const result = c.red('err');
        expect(result).toBe('\x1b[31merr\x1b[0m');
    });

    test('green wraps with correct ANSI codes', () => {
        const result = c.green('ok');
        expect(result).toBe('\x1b[32mok\x1b[0m');
    });

    test('yellow wraps with correct ANSI codes', () => {
        const result = c.yellow('warn');
        expect(result).toBe('\x1b[33mwarn\x1b[0m');
    });

    test('blue wraps with correct ANSI codes', () => {
        expect(c.blue('info')).toBe('\x1b[34minfo\x1b[0m');
    });

    test('magenta wraps with correct ANSI codes', () => {
        expect(c.magenta('mag')).toBe('\x1b[35mmag\x1b[0m');
    });

    test('cyan wraps with correct ANSI codes', () => {
        expect(c.cyan('cy')).toBe('\x1b[36mcy\x1b[0m');
    });

    test('gray wraps with correct ANSI codes', () => {
        expect(c.gray('dim')).toBe('\x1b[90mdim\x1b[0m');
    });

    test('white wraps with correct ANSI codes', () => {
        expect(c.white('bright')).toBe('\x1b[97mbright\x1b[0m');
    });

    test('bgRed wraps with correct ANSI codes', () => {
        expect(c.bgRed('alert')).toBe('\x1b[41malert\x1b[0m');
    });

    test('bgGreen wraps with correct ANSI codes', () => {
        expect(c.bgGreen('success')).toBe('\x1b[42msuccess\x1b[0m');
    });

    test('bgBlue wraps with correct ANSI codes', () => {
        expect(c.bgBlue('highlight')).toBe('\x1b[44mhighlight\x1b[0m');
    });

    test('bold, dim, italic, reset are raw escape strings', () => {
        expect(c.bold).toBe('\x1b[1m');
        expect(c.dim).toBe('\x1b[2m');
        expect(c.italic).toBe('\x1b[3m');
        expect(c.reset).toBe('\x1b[0m');
    });

    test('color functions handle empty strings', () => {
        expect(c.red('')).toBe('\x1b[31m\x1b[0m');
    });

    test('color functions handle strings with special characters', () => {
        const result = c.green('hello\nworld');
        expect(result).toContain('hello\nworld');
        expect(result).toContain('\x1b[32m');
    });
});

// ─── stripLeakedToolCalls ───────────────────────────────────────────────────

describe('stripLeakedToolCalls', () => {
    test('removes a simple tool call array', () => {
        const input = '[{"name": "run_command", "input": {"cmd": "ls"}}]';
        expect(stripLeakedToolCalls(input)).toBe('');
    });

    test('removes tool call array from surrounding text', () => {
        const input = 'Here is my response [{"name": "tool"}] and more text';
        const result = stripLeakedToolCalls(input);
        expect(result).toBe('Here is my responseand more text');
    });

    test('preserves text when no tool call array is present', () => {
        const input = 'Just a normal response with [brackets] in it';
        expect(stripLeakedToolCalls(input)).toBe(input);
    });

    test('handles nested braces within tool call', () => {
        const input = '[{"name": "tool", "input": {"nested": {"deep": true}}}]';
        expect(stripLeakedToolCalls(input)).toBe('');
    });

    test('handles multiple tool call arrays', () => {
        const input = 'before [{"name": "a"}] middle [{"name": "b"}] after';
        const result = stripLeakedToolCalls(input);
        expect(result).not.toContain('"name"');
        expect(result).toContain('before');
        expect(result).toContain('after');
    });

    test('leaves unmatched opening bracket alone', () => {
        const input = 'partial [{"name": "tool" without closing';
        expect(stripLeakedToolCalls(input)).toBe(input);
    });

    test('handles empty string', () => {
        expect(stripLeakedToolCalls('')).toBe('');
    });

    test('handles string with no brackets', () => {
        expect(stripLeakedToolCalls('hello world')).toBe('hello world');
    });

    test('does not strip arrays that do not look like tool calls', () => {
        const input = '[1, 2, 3]';
        expect(stripLeakedToolCalls(input)).toBe(input);
    });

    test('does not strip arrays with different key patterns', () => {
        const input = '[{"id": "123", "value": true}]';
        expect(stripLeakedToolCalls(input)).toBe(input);
    });

    test('strips tool calls with extra whitespace', () => {
        const input = '[  {  "name" : "run_command" } ]';
        expect(stripLeakedToolCalls(input)).toBe('');
    });

    test('trims surrounding whitespace when stripping', () => {
        const input = 'Hello   [{"name": "tool"}]   World';
        const result = stripLeakedToolCalls(input);
        expect(result).toBe('HelloWorld');
    });

    test('handles tool call with complex input including strings with brackets', () => {
        const input = '[{"name": "tool", "input": {"code": "arr[0]"}}]';
        // The bracket counter should still balance since these are inside strings
        // but the implementation counts all [ and ] characters
        const result = stripLeakedToolCalls(input);
        // With bracket counting, arr[0] adds nested depth
        // The outer [ reaches depth 0 at the final ], so it should strip
        expect(result).toBe('');
    });
});

// ─── deduplicateContent (tested via renderStreamChunk) ──────────────────────

describe('deduplicateContent (via renderStreamChunk)', () => {
    beforeEach(() => {
        resetStreamState();
    });

    test('passes through non-duplicate content', () => {
        const output = captureStdout(() => {
            renderStreamChunk('Hello, world!');
        });
        expect(stripAnsi(output)).toContain('Hello, world!');
    });

    test('collapses 2x repeated content', () => {
        const unit = 'This is a repeated block.';
        const doubled = unit + unit;
        const output = captureStdout(() => {
            renderStreamChunk(doubled);
        });
        const plain = stripAnsi(output);
        // Should appear only once (border prefix adds characters)
        const count = plain.split(unit).length - 1;
        expect(count).toBe(1);
    });

    test('collapses 3x repeated content', () => {
        const unit = 'Repeated content here!!';
        const tripled = unit + unit + unit;
        const output = captureStdout(() => {
            renderStreamChunk(tripled);
        });
        const plain = stripAnsi(output);
        const count = plain.split(unit).length - 1;
        expect(count).toBe(1);
    });

    test('collapses 4x repeated content (caught by 2x check first)', () => {
        // When content is repeated 4x, the 2x dedup check fires first
        // because the first half (2 copies) repeated twice equals the full string.
        // So 4x content is collapsed to 2x (the first half).
        const unit = 'A unit that repeats..'; // 21 chars
        const quadrupled = unit + unit + unit + unit; // 84 chars
        const output = captureStdout(() => {
            renderStreamChunk(quadrupled);
        });
        const plain = stripAnsi(output);
        const count = plain.split(unit).length - 1;
        // 2x dedup returns the first 42 chars (2 copies), so the unit appears 2 times
        expect(count).toBe(2);
    });

    test('collapses 4x when length not divisible by 2', () => {
        // To actually trigger n=4 dedup, we need length % 2 !== 0 but % 4 === 0.
        // That's impossible (if n%4==0, then n%2==0). So the 4x path is only
        // reachable when unitLen < 10 for n=2 but >= 10 for n=4.
        // That means unitLen in [10, 19] with total length in [40, 79].
        // For n=2: unitLen = total/2 >= 20, so >= 10 — always matches first.
        // In practice the n=4 check is a fallback that covers edge cases where
        // the 2x check's unit doesn't exactly repeat. We verify the 2x path works.
        const unit = 'ABCDEFGHIJ'; // 10 chars
        const quad = unit.repeat(4); // 40 chars
        const output = captureStdout(() => {
            renderStreamChunk(quad);
        });
        const plain = stripAnsi(output);
        // 2x fires: first 20 chars = "ABCDEFGHIJABCDEFGHIJ", repeat(2) = 40 chars = match
        // Returns first 20 chars (2 copies of unit)
        const count = plain.split(unit).length - 1;
        expect(count).toBe(2);
    });

    test('does not deduplicate short content (< 20 chars)', () => {
        const unit = 'short';
        const doubled = unit + unit; // 10 chars total, below 20
        const output = captureStdout(() => {
            renderStreamChunk(doubled);
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('shortshort');
    });

    test('does not deduplicate when length is not evenly divisible', () => {
        // Use a string whose total length is not divisible by 2, 3, or 4
        const longUnit = 'This is long enough!'; // 20 chars
        const notEven = longUnit + longUnit + 'x'; // 41 chars, not div by 2/3/4
        const output = captureStdout(() => {
            renderStreamChunk(notEven);
        });
        const plain = stripAnsi(output);
        // Both copies should remain
        expect(plain).toContain(longUnit);
    });
});

// ─── renderStreamChunk ──────────────────────────────────────────────────────

describe('renderStreamChunk', () => {
    beforeEach(() => {
        resetStreamState();
    });

    test('prepends border prefix at the start of a line', () => {
        const output = captureStdout(() => {
            renderStreamChunk('Hello');
        });
        const plain = stripAnsi(output);
        expect(plain).toMatch(/^│ Hello/);
    });

    test('handles newlines by adding border to next line', () => {
        const output = captureStdout(() => {
            renderStreamChunk('line1\nline2');
        });
        const plain = stripAnsi(output);
        const lines = plain.split('\n');
        expect(lines[0]).toMatch(/^│ line1/);
        expect(lines[1]).toMatch(/^│ line2/);
    });

    test('handles multiple sequential chunks', () => {
        const output = captureStdout(() => {
            renderStreamChunk('Hello ');
            renderStreamChunk('World');
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('Hello World');
        // Only one border prefix since they are on the same line
        const borderCount = (plain.match(/│/g) ?? []).length;
        expect(borderCount).toBe(1);
    });

    test('handles chunk starting with newline', () => {
        const output = captureStdout(() => {
            renderStreamChunk('First');
            renderStreamChunk('\nSecond');
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('First');
        expect(plain).toContain('Second');
    });

    test('returns empty for empty chunk after stripping and dedup', () => {
        const output = captureStdout(() => {
            renderStreamChunk('');
        });
        expect(output).toBe('');
    });

    test('strips tool calls before rendering', () => {
        const output = captureStdout(() => {
            renderStreamChunk('Result [{"name": "tool"}] done');
        });
        const plain = stripAnsi(output);
        expect(plain).not.toContain('"name"');
        expect(plain).toContain('Result');
        expect(plain).toContain('done');
    });

    test('wraps long lines at content width', () => {
        // Save and mock process.stdout.columns to force a narrow width
        const origColumns = process.stdout.columns;
        Object.defineProperty(process.stdout, 'columns', { value: 20, writable: true, configurable: true });
        try {
            const output = captureStdout(() => {
                // 18 chars for content area (20 - 2 border prefix)
                renderStreamChunk('A'.repeat(25));
            });
            const plain = stripAnsi(output);
            const lines = plain.split('\n');
            // Should have wrapped to at least 2 lines
            expect(lines.length).toBeGreaterThanOrEqual(2);
            // Each line should start with border prefix
            for (const line of lines) {
                if (line.trim()) {
                    expect(line).toMatch(/^│ /);
                }
            }
        } finally {
            Object.defineProperty(process.stdout, 'columns', { value: origColumns, writable: true, configurable: true });
        }
    });
});

// ─── Cross-chunk tool call stripping ─────────────────────────────────────────

describe('renderStreamChunk cross-chunk tool call stripping', () => {
    beforeEach(() => {
        resetStreamState();
    });

    test('strips tool call JSON split across two chunks', () => {
        const output = captureStdout(() => {
            renderStreamChunk('[{"name": "corvid_list');
            renderStreamChunk('_agents", "arguments": {}}]');
            flushStreamBuffer();
        });
        const plain = stripAnsi(output);
        // Tool call JSON should be completely stripped
        expect(plain).not.toContain('corvid_list_agents');
        expect(plain).not.toContain('"name"');
    });

    test('strips tool call JSON arriving one char at a time', () => {
        const toolCall = '[{"name": "read_file", "arguments": {"path": "/tmp"}}]';
        const output = captureStdout(() => {
            for (const ch of toolCall) {
                renderStreamChunk(ch);
            }
            flushStreamBuffer();
        });
        const plain = stripAnsi(output);
        expect(plain).not.toContain('read_file');
        expect(plain).not.toContain('"name"');
    });

    test('preserves text before and after tool call in separate chunks', () => {
        const output = captureStdout(() => {
            renderStreamChunk('Hello ');
            renderStreamChunk('[{"name": "tool", "arguments": {}}]');
            renderStreamChunk(' World');
            flushStreamBuffer();
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('Hello');
        expect(plain).toContain('World');
        expect(plain).not.toContain('"name"');
    });

    test('flushes partial non-tool bracket content on flush', () => {
        const output = captureStdout(() => {
            renderStreamChunk('items [1, 2, 3]');
            flushStreamBuffer();
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('items [1, 2, 3]');
    });

    test('handles normal brackets without false buffering', () => {
        const output = captureStdout(() => {
            renderStreamChunk('array[0] = value');
            flushStreamBuffer();
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('array[0] = value');
    });

    test('strips multiple tool calls in sequence', () => {
        const output = captureStdout(() => {
            renderStreamChunk('start [{"name": "a", "arguments": {}}]');
            renderStreamChunk(' middle [{"name": "b", "arguments": {}}]');
            renderStreamChunk(' end');
            flushStreamBuffer();
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('start');
        expect(plain).toContain('middle');
        expect(plain).toContain('end');
        expect(plain).not.toContain('"name"');
    });
});

// ─── renderAgentPrefix / renderAgentSuffix ──────────────────────────────────

describe('renderAgentPrefix', () => {
    beforeEach(() => {
        resetStreamState();
    });

    test('outputs top border with Agent label', () => {
        const lines = captureConsoleLog(() => {
            renderAgentPrefix();
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('Agent');
        expect(plain).toContain('┌');
        expect(plain).toContain('─');
    });

    test('border width matches FRAME_WIDTH (48)', () => {
        const lines = captureConsoleLog(() => {
            renderAgentPrefix();
        });
        const plain = stripAnsi(lines[0]);
        // The template literal starts with \n so strip that for the width check
        const trimmed = plain.replace(/^\n/, '');
        // "┌─ Agent " is 9 chars, then (FRAME_WIDTH - 9) = 39 dashes = 48 total
        expect(trimmed.length).toBe(48);
    });
});

describe('renderAgentSuffix', () => {
    beforeEach(() => {
        resetStreamState();
    });

    test('outputs bottom border', () => {
        const lines = captureConsoleLog(() => {
            // First render some content so _atLineStart is true
            renderAgentSuffix();
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('└');
        expect(plain).toContain('─');
    });

    test('bottom border width matches FRAME_WIDTH (48)', () => {
        const lines = captureConsoleLog(() => {
            renderAgentSuffix();
        });
        const plain = stripAnsi(lines[0]);
        // "└" + 47 dashes = 48 total
        expect(plain.length).toBe(48);
    });

    test('writes newline if not at line start', () => {
        // Simulate being mid-line by rendering a chunk without newline
        captureStdout(() => {
            renderStreamChunk('partial');
        });

        const stdoutOutput = captureStdout(() => {
            captureConsoleLog(() => {
                renderAgentSuffix();
            });
        });
        // Should have written a newline to stdout before the border
        expect(stdoutOutput).toContain('\n');
    });
});

// ─── renderToolUse ──────────────────────────────────────────────────────────

describe('renderToolUse', () => {
    test('displays tool name and input', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('run_command', 'ls -la');
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('│');
        expect(plain).toContain('run_command');
        expect(plain).toContain('ls -la');
    });

    test('extracts command from JSON input', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('bash', JSON.stringify({ command: 'git status' }));
        });
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('git status');
    });

    test('extracts path from JSON input', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('read_file', JSON.stringify({ path: '/src/index.ts' }));
        });
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('/src/index.ts');
    });

    test('extracts query from JSON input', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('search', JSON.stringify({ query: 'find bugs' }));
        });
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('find bugs');
    });

    test('falls back to truncated JSON when no known keys', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('custom', JSON.stringify({ foo: 'bar' }));
        });
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('foo');
    });

    test('truncates long input to 200 chars', () => {
        const longInput = 'x'.repeat(300);
        const lines = captureConsoleLog(() => {
            renderToolUse('tool', longInput);
        });
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('...');
        // The input portion should be at most ~203 chars (200 + "...")
    });

    test('filters "Done" status messages', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('run_command', 'Done');
        });
        expect(lines.length).toBe(0);
    });

    test('filters "done" status messages (lowercase)', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('run_command', 'done');
        });
        expect(lines.length).toBe(0);
    });

    test('filters "Running tool_name..." status messages', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('run_command', 'Running run_command...');
        });
        expect(lines.length).toBe(0);
    });

    test('does not filter partial "Running" messages', () => {
        const lines = captureConsoleLog(() => {
            renderToolUse('tool', 'Running some longer description');
        });
        expect(lines.length).toBe(1);
    });
});

// ─── renderThinking ─────────────────────────────────────────────────────────

describe('renderThinking', () => {
    test('writes thinking indicator when active', () => {
        const output = captureStderr(() => {
            renderThinking(true);
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('thinking...');
        expect(plain).toContain('│');
    });

    test('clears line when inactive', () => {
        const output = captureStderr(() => {
            renderThinking(false);
        });
        // Should write carriage return and clear line escape
        expect(output).toContain('\r');
        expect(output).toContain('\x1b[K');
    });
});

// ─── renderMarkdown ─────────────────────────────────────────────────────────

describe('renderMarkdown', () => {
    test('converts h1 headers', () => {
        const result = renderMarkdown('# Main Title');
        const plain = stripAnsi(result);
        expect(plain).toContain('Main Title');
        // Should have green color
        expect(result).toContain('\x1b[32m');
    });

    test('converts h2 headers', () => {
        const result = renderMarkdown('## Section');
        const plain = stripAnsi(result);
        expect(plain).toContain('Section');
        // Should have cyan color
        expect(result).toContain('\x1b[36m');
    });

    test('converts h3 headers', () => {
        const result = renderMarkdown('### Subsection');
        const plain = stripAnsi(result);
        expect(plain).toContain('Subsection');
        // Should have yellow color
        expect(result).toContain('\x1b[33m');
    });

    test('converts bold text', () => {
        const result = renderMarkdown('This is **bold** text');
        const plain = stripAnsi(result);
        expect(plain).toContain('bold');
        expect(result).toContain(c.bold);
    });

    test('converts italic text', () => {
        const result = renderMarkdown('This is *italic* text');
        const plain = stripAnsi(result);
        expect(plain).toContain('italic');
        expect(result).toContain(c.italic);
    });

    test('converts inline code', () => {
        const result = renderMarkdown('Use `console.log()` for output');
        const plain = stripAnsi(result);
        expect(plain).toContain('console.log()');
        // Should have cyan color from c.cyan()
        expect(result).toContain('\x1b[36m');
    });

    test('converts bullet lists with dash prefix', () => {
        const result = renderMarkdown('- first\n- second');
        const plain = stripAnsi(result);
        expect(plain).toContain('first');
        expect(plain).toContain('second');
        // Gray bullet character
        expect(result).toContain('\x1b[90m');
    });

    test('converts bullet lists with asterisk prefix', () => {
        const result = renderMarkdown('* item a\n* item b');
        const plain = stripAnsi(result);
        expect(plain).toContain('item a');
        expect(plain).toContain('item b');
    });

    test('handles multiple markdown elements together', () => {
        const input = '# Title\n\nSome **bold** and `code` here.\n\n- item 1\n- item 2';
        const result = renderMarkdown(input);
        const plain = stripAnsi(result);
        expect(plain).toContain('Title');
        expect(plain).toContain('bold');
        expect(plain).toContain('code');
        expect(plain).toContain('item 1');
        expect(plain).toContain('item 2');
    });

    test('passes through plain text unchanged', () => {
        const result = renderMarkdown('Just plain text');
        expect(result).toBe('Just plain text');
    });

    test('handles empty string', () => {
        expect(renderMarkdown('')).toBe('');
    });
});

// ─── Spinner ────────────────────────────────────────────────────────────────

describe('Spinner', () => {
    test('can be constructed with a message', () => {
        const spinner = new Spinner('Loading...');
        expect(spinner).toBeDefined();
    });

    test('start creates an interval', () => {
        const spinner = new Spinner('test');
        // Capture stderr to prevent output
        captureStderr(() => {
            spinner.start();
        });
        // Stop immediately to clean up
        captureStderr(() => {
            spinner.stop();
        });
    });

    test('update changes the message', () => {
        const spinner = new Spinner('initial');
        captureStderr(() => {
            spinner.start();
        });
        spinner.update('updated');
        captureStderr(() => {
            spinner.stop();
        });
    });

    test('stop clears the line', () => {
        const spinner = new Spinner('test');
        captureStderr(() => {
            spinner.start();
        });
        const output = captureStderr(() => {
            spinner.stop();
        });
        // Should clear the line with carriage return + clear escape
        expect(output).toContain('\r');
        expect(output).toContain('\x1b[K');
    });

    test('stop with final message writes it', () => {
        const spinner = new Spinner('test');
        captureStderr(() => {
            spinner.start();
        });
        const output = captureStderr(() => {
            spinner.stop('All done!');
        });
        expect(output).toContain('All done!');
    });

    test('stop without final message does not write extra text', () => {
        const spinner = new Spinner('test');
        captureStderr(() => {
            spinner.start();
        });
        const output = captureStderr(() => {
            spinner.stop();
        });
        // Only the clear sequence, no extra text
        expect(output).toBe('\r\x1b[K');
    });

    test('stop is idempotent when called without start', () => {
        const spinner = new Spinner('test');
        const output = captureStderr(() => {
            spinner.stop();
        });
        // Should still write the clear line sequence
        expect(output).toBe('\r\x1b[K');
    });
});

// ─── Output Helpers ─────────────────────────────────────────────────────────

describe('printError', () => {
    test('outputs error message with red prefix', () => {
        const lines = captureConsoleError(() => {
            printError('something broke');
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('error');
        expect(plain).toContain('something broke');
    });
});

describe('printSuccess', () => {
    test('outputs message with green checkmark', () => {
        const lines = captureConsoleLog(() => {
            printSuccess('completed');
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('completed');
    });
});

describe('printWarning', () => {
    test('outputs message with yellow exclamation', () => {
        const lines = captureConsoleLog(() => {
            printWarning('watch out');
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('watch out');
    });
});

describe('printHeader', () => {
    test('outputs bold header', () => {
        const lines = captureConsoleLog(() => {
            printHeader('My Section');
        });
        expect(lines.length).toBe(1);
        const plain = stripAnsi(lines[0]);
        expect(plain).toContain('My Section');
        // Contains bold escape
        expect(lines[0]).toContain(c.bold);
    });
});

// ─── printTable ─────────────────────────────────────────────────────────────

describe('printTable', () => {
    test('renders headers and rows', () => {
        const lines = captureConsoleLog(() => {
            printTable(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']]);
        });
        // header + separator + 2 data rows = 4 lines
        expect(lines.length).toBe(4);
        const plainHeader = stripAnsi(lines[0]);
        expect(plainHeader).toContain('Name');
        expect(plainHeader).toContain('Age');
    });

    test('calculates column widths based on data', () => {
        const lines = captureConsoleLog(() => {
            printTable(['ID', 'Description'], [['1', 'A very long description']]);
        });
        const plainHeader = stripAnsi(lines[0]);
        // "Description" column should be padded to at least length of data
        expect(plainHeader).toContain('Description');
    });

    test('separator uses dash characters', () => {
        const lines = captureConsoleLog(() => {
            printTable(['Col'], [['val']]);
        });
        const plainSep = stripAnsi(lines[1]);
        expect(plainSep).toContain('─');
    });

    test('handles empty rows', () => {
        const lines = captureConsoleLog(() => {
            printTable(['X', 'Y'], []);
        });
        // header + separator, no data rows
        expect(lines.length).toBe(2);
    });

    test('handles missing cells in rows', () => {
        const lines = captureConsoleLog(() => {
            printTable(['A', 'B', 'C'], [['only-a']]);
        });
        // Should not crash, missing cells treated as ''
        expect(lines.length).toBe(3);
    });

    test('pads columns to equal widths', () => {
        const lines = captureConsoleLog(() => {
            printTable(['Short', 'LongerHeader'], [['x', 'y']]);
        });
        const plainHeader = stripAnsi(lines[0]);
        // Each column should be padded
        expect(plainHeader).toContain('Short');
        expect(plainHeader).toContain('LongerHeader');
    });
});

// ─── printPrompt ────────────────────────────────────────────────────────────

describe('printPrompt', () => {
    test('writes prompt with "You" and ">" symbols', () => {
        const output = captureStdout(() => {
            printPrompt();
        });
        const plain = stripAnsi(output);
        expect(plain).toContain('You');
        expect(plain).toContain('>');
    });
});

// ─── resetStreamState ───────────────────────────────────────────────────────

describe('resetStreamState', () => {
    test('resets line tracking so next chunk gets border prefix', () => {
        // Render a chunk to change internal state
        captureStdout(() => {
            renderStreamChunk('partial');
        });
        // Reset
        resetStreamState();
        // Next chunk should start with border again
        const output = captureStdout(() => {
            renderStreamChunk('fresh');
        });
        const plain = stripAnsi(output);
        expect(plain).toMatch(/^│ fresh/);
    });
});
