// ─── ANSI Colors ────────────────────────────────────────────────────────────

const ESC = '\x1b[';

export const c = {
    reset: `${ESC}0m`,
    bold: `${ESC}1m`,
    dim: `${ESC}2m`,
    italic: `${ESC}3m`,

    red: (s: string) => `${ESC}31m${s}${ESC}0m`,
    green: (s: string) => `${ESC}32m${s}${ESC}0m`,
    yellow: (s: string) => `${ESC}33m${s}${ESC}0m`,
    blue: (s: string) => `${ESC}34m${s}${ESC}0m`,
    magenta: (s: string) => `${ESC}35m${s}${ESC}0m`,
    cyan: (s: string) => `${ESC}36m${s}${ESC}0m`,
    gray: (s: string) => `${ESC}90m${s}${ESC}0m`,
    white: (s: string) => `${ESC}97m${s}${ESC}0m`,

    bgRed: (s: string) => `${ESC}41m${s}${ESC}0m`,
    bgGreen: (s: string) => `${ESC}42m${s}${ESC}0m`,
    bgBlue: (s: string) => `${ESC}44m${s}${ESC}0m`,
};

// ─── Spinner ────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
    private frame = 0;
    private interval: ReturnType<typeof setInterval> | null = null;
    private message: string;

    constructor(message: string) {
        this.message = message;
    }

    start(): void {
        this.interval = setInterval(() => {
            const f = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
            process.stderr.write(`\r${c.cyan(f)} ${this.message}`);
            this.frame++;
        }, 80);
    }

    update(message: string): void {
        this.message = message;
    }

    stop(finalMessage?: string): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        process.stderr.write('\r\x1b[K'); // Clear line
        if (finalMessage) {
            process.stderr.write(`${finalMessage}\n`);
        }
    }
}

// ─── Output Helpers ─────────────────────────────────────────────────────────

export function printError(message: string): void {
    console.error(`${c.red('error')}: ${message}`);
}

export function printSuccess(message: string): void {
    console.log(`${c.green('✓')} ${message}`);
}

export function printWarning(message: string): void {
    console.log(`${c.yellow('!')} ${message}`);
}

export function printHeader(title: string): void {
    console.log(`\n${c.bold}${title}${c.reset}\n`);
}

// ─── Table Rendering ────────────────────────────────────────────────────────

export function printTable(headers: string[], rows: string[][]): void {
    const widths = headers.map((h, i) => {
        const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0);
        return Math.max(h.length, maxData);
    });

    const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
    const separator = widths.map(w => '─'.repeat(w)).join('──');

    console.log(c.gray(headerLine));
    console.log(c.gray(separator));
    for (const row of rows) {
        console.log(row.map((cell, i) => (cell ?? '').padEnd(widths[i])).join('  '));
    }
}

// ─── Markdown to Terminal ───────────────────────────────────────────────────

export function renderMarkdown(text: string): string {
    return text
        // Headers
        .replace(/^### (.+)$/gm, (_, h) => `${c.bold}${c.reset}${c.yellow(h as string)}`)
        .replace(/^## (.+)$/gm, (_, h) => `\n${c.bold}${c.reset}${c.cyan(h as string)}`)
        .replace(/^# (.+)$/gm, (_, h) => `\n${c.bold}${c.reset}${c.green(h as string)}`)
        // Bold and italic
        .replace(/\*\*(.+?)\*\*/g, (_, t) => `${c.bold}${t as string}${c.reset}`)
        .replace(/\*(.+?)\*/g, (_, t) => `${c.italic}${t as string}${c.reset}`)
        // Inline code
        .replace(/`([^`]+)`/g, (_, code) => c.cyan(code as string))
        // Bullet lists
        .replace(/^[*-] (.+)$/gm, (_, item) => `  ${c.gray('•')} ${item as string}`);
}

// ─── Tool Use Display ───────────────────────────────────────────────────────

export function renderToolUse(toolName: string, input: string): void {
    // Filter redundant status messages from direct-mode providers (Ollama).
    // These arrive as tool_status events like "Running run_command..." and "Done".
    if (input === 'Done' || input === 'done') return;
    if (/^Running \w+\.{3}$/.test(input)) return;

    // Try to extract a meaningful summary from JSON tool input (SDK mode)
    const detail = summarizeToolInput(toolName, input);
    console.log(`${c.cyan('│')} ${c.magenta(toolName)} ${c.dim}${detail}${c.reset}`);
}

function summarizeToolInput(_toolName: string, input: string): string {
    // Try parsing as JSON for SDK-mode tool calls
    try {
        const parsed = JSON.parse(input) as Record<string, unknown>;
        // Show the most relevant field based on tool name
        if (parsed.command && typeof parsed.command === 'string') {
            return truncateStr(parsed.command, 200);
        }
        if (parsed.path && typeof parsed.path === 'string') {
            return truncateStr(parsed.path, 200);
        }
        if (parsed.query && typeof parsed.query === 'string') {
            return truncateStr(parsed.query, 200);
        }
        // Fallback: show truncated JSON
        return truncateStr(input, 200);
    } catch {
        // Not JSON — plain text status message from direct-mode
        return truncateStr(input, 200);
    }
}

function truncateStr(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + '...' : s;
}

export function renderThinking(active: boolean): void {
    if (active) {
        process.stderr.write(`${c.cyan('│')} ${c.yellow('thinking...')}\r`);
    } else {
        process.stderr.write('\r\x1b[K');
    }
}

// ─── Agent Framing ─────────────────────────────────────────────────────────

const FRAME_WIDTH = 48;

export function renderAgentPrefix(): void {
    _atLineStart = true;
    _currentCol = 0;
    const bar = '─'.repeat(FRAME_WIDTH - 9);
    console.log(`\n${c.cyan(`┌─ Agent ${bar}`)}`);
}

export function renderAgentSuffix(): void {
    if (!_atLineStart) {
        process.stdout.write('\n');
        _atLineStart = true;
    }
    console.log(`${c.cyan(`└${'─'.repeat(FRAME_WIDTH - 1)}`)}`);
}

// ─── REPL Prompt ───────────────────────────────────────────────────────────

export function printPrompt(): void {
    process.stdout.write(`${c.green('You')} ${c.cyan('>')} `);
}

// ─── Stream Chunk Display ───────────────────────────────────────────────────

let _atLineStart = true;
let _currentCol = 0;

export function resetStreamState(): void {
    _atLineStart = true;
    _currentCol = 0;
}

const BORDER_PREFIX_WIDTH = 2; // "│ " is 2 visible columns

export function renderStreamChunk(chunk: string): void {
    const cleaned = deduplicateContent(stripLeakedToolCalls(chunk));
    if (!cleaned) return;

    const contentWidth = (process.stdout.columns || 80) - BORDER_PREFIX_WIDTH;
    let output = '';
    for (const ch of cleaned) {
        if (_atLineStart) {
            output += `${c.cyan('│')} `;
            _atLineStart = false;
            _currentCol = 0;
        }
        if (ch === '\n') {
            output += ch;
            _atLineStart = true;
        } else {
            if (_currentCol >= contentWidth) {
                // Soft-wrap: start a new bordered line
                output += `\n${c.cyan('│')} `;
                _currentCol = 0;
            }
            output += ch;
            _currentCol++;
        }
    }
    process.stdout.write(output);
}

// ─── Content Deduplication ─────────────────────────────────────────────────

/**
 * Detect if text consists of the same content repeated 2–4 times and
 * collapse it to a single copy. Handles the case where the server
 * accumulates duplicate assistant events into one response buffer.
 */
function deduplicateContent(text: string): string {
    const trimmed = text.trimEnd();
    if (trimmed.length < 20) return text;

    for (const n of [2, 3, 4]) {
        if (trimmed.length % n !== 0) continue;
        const unitLen = trimmed.length / n;
        if (unitLen < 10) continue;
        const unit = trimmed.slice(0, unitLen);
        if (unit.repeat(n) === trimmed) {
            return unit;
        }
    }
    return text;
}

// ─── Tool Call Stripping ───────────────────────────────────────────────────

/**
 * Safety net: remove JSON arrays that look like tool call objects from
 * displayed text. Uses bracket counting to handle nested braces.
 */
export function stripLeakedToolCalls(text: string): string {
    let result = text;
    let searchFrom = 0;
    while (searchFrom < result.length) {
        const start = result.indexOf('[', searchFrom);
        if (start === -1) break;

        // Quick check: does this look like a tool call array?
        const preview = result.slice(start, start + 50);
        if (!/^\[\s*\{\s*"name"\s*:/.test(preview)) {
            searchFrom = start + 1;
            continue;
        }

        // Count brackets to find the matching ]
        let depth = 0;
        let end = -1;
        for (let j = start; j < result.length; j++) {
            if (result[j] === '[') depth++;
            else if (result[j] === ']') {
                depth--;
                if (depth === 0) {
                    end = j;
                    break;
                }
            }
        }

        if (end === -1) {
            // Unmatched bracket — likely a partial chunk, leave it
            break;
        }

        // Strip the matched array. Don't require valid JSON — models often
        // produce malformed tool call JSON with unescaped quotes or broken
        // structure. The [{"name": pattern + balanced brackets is sufficient.
        const before = result.slice(0, start).replace(/\s+$/, '');
        const after = result.slice(end + 1).replace(/^\s+/, '');
        result = before + after;
        searchFrom = before.length;
    }
    return result;
}
