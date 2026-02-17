import { test, expect, describe, mock } from 'bun:test';
import { c, printTable, renderMarkdown, Spinner } from '../../cli/render';

describe('CLI Render', () => {
    test('color functions return strings', () => {
        expect(typeof c.red('test')).toBe('string');
        expect(typeof c.green('test')).toBe('string');
        expect(typeof c.yellow('test')).toBe('string');
        expect(typeof c.blue('test')).toBe('string');
        expect(typeof c.magenta('test')).toBe('string');
        expect(typeof c.cyan('test')).toBe('string');
        expect(typeof c.gray('test')).toBe('string');
        expect(typeof c.white('test')).toBe('string');
    });

    test('color functions include ANSI escape codes', () => {
        const red = c.red('hello');
        expect(red).toContain('\x1b[31m');
        expect(red).toContain('\x1b[0m');
        expect(red).toContain('hello');
    });

    test('renderMarkdown converts headers', () => {
        const result = renderMarkdown('# Title');
        expect(result).toContain('Title');
    });

    test('renderMarkdown converts bold', () => {
        const result = renderMarkdown('**bold text**');
        expect(result).toContain('bold text');
    });

    test('renderMarkdown converts inline code', () => {
        const result = renderMarkdown('use `foo()` here');
        expect(result).toContain('foo()');
    });

    test('renderMarkdown converts bullet lists', () => {
        const result = renderMarkdown('- item one\n- item two');
        expect(result).toContain('item one');
        expect(result).toContain('item two');
    });

    test('Spinner can be created and stopped', () => {
        const spinner = new Spinner('loading');
        spinner.start();
        spinner.update('still loading');
        spinner.stop();
    });

    test('Spinner stop with final message', () => {
        const spinner = new Spinner('test');
        spinner.start();
        spinner.stop('Done!');
    });

    test('printTable outputs formatted table', () => {
        const origLog = console.log;
        const lines: string[] = [];
        console.log = mock((s: string) => lines.push(s));

        try {
            printTable(
                ['ID', 'Name'],
                [['1', 'Alice'], ['2', 'Bob']],
            );

            expect(lines.length).toBeGreaterThanOrEqual(4);
            expect(lines[2]).toContain('Alice');
            expect(lines[3]).toContain('Bob');
        } finally {
            console.log = origLog;
        }
    });
});

describe('CLI Command Modules', () => {
    test('render module exports', async () => {
        const render = await import('../../cli/render');
        expect(render.c).toBeDefined();
        expect(render.printError).toBeDefined();
        expect(render.printSuccess).toBeDefined();
        expect(render.printTable).toBeDefined();
        expect(render.renderMarkdown).toBeDefined();
        expect(render.Spinner).toBeDefined();
    });

    test('config command module exports', async () => {
        const { configCommand } = await import('../../cli/commands/config');
        expect(typeof configCommand).toBe('function');
    });

    test('status command module exports', async () => {
        const { statusCommand } = await import('../../cli/commands/status');
        expect(typeof statusCommand).toBe('function');
    });

    test('chat command module exports', async () => {
        const { chatCommand } = await import('../../cli/commands/chat');
        expect(typeof chatCommand).toBe('function');
    });

    test('session command module exports', async () => {
        const { sessionCommand } = await import('../../cli/commands/session');
        expect(typeof sessionCommand).toBe('function');
    });

    test('agent command module exports', async () => {
        const { agentCommand } = await import('../../cli/commands/agent');
        expect(typeof agentCommand).toBe('function');
    });
});
