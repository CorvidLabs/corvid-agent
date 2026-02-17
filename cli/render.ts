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
    const truncated = input.length > 200 ? input.slice(0, 200) + '...' : input;
    console.log(`  ${c.gray('┃')} ${c.magenta(toolName)} ${c.dim}${truncated}${c.reset}`);
}

export function renderThinking(active: boolean): void {
    if (active) {
        process.stderr.write(`  ${c.gray('┃')} ${c.yellow('thinking...')}\r`);
    } else {
        process.stderr.write('\r\x1b[K');
    }
}

// ─── Stream Chunk Display ───────────────────────────────────────────────────

export function renderStreamChunk(chunk: string): void {
    process.stdout.write(chunk);
}
