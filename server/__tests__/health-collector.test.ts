/**
 * Tests for CodebaseHealthCollector parsing functions.
 *
 * Validates TSC error parsing, test output parsing, TODO counting,
 * large file detection, and outdated dependency parsing.
 */
import { test, expect, describe } from 'bun:test';
import {
    parseTscOutput,
    parseTestOutput,
    parseTodoOutput,
    parseLargeFiles,
    parseOutdatedOutput,
} from '../improvement/health-collector';

// ─── TSC Error Parsing ───────────────────────────────────────────────────────

describe('parseTscOutput', () => {
    test('parses standard TSC errors', () => {
        const output = `server/foo.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
server/bar.ts(25,12): error TS7006: Parameter 'x' implicitly has an 'any' type.`;
        const errors = parseTscOutput(output);
        expect(errors).toHaveLength(2);
        expect(errors[0]).toEqual({
            file: 'server/foo.ts',
            line: 10,
            col: 5,
            code: 'TS2345',
            message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
        });
        expect(errors[1]).toEqual({
            file: 'server/bar.ts',
            line: 25,
            col: 12,
            code: 'TS7006',
            message: "Parameter 'x' implicitly has an 'any' type.",
        });
    });

    test('returns empty array for clean compilation', () => {
        const errors = parseTscOutput('');
        expect(errors).toHaveLength(0);
    });

    test('returns empty array for non-error output', () => {
        const output = `Found 0 errors.\n`;
        const errors = parseTscOutput(output);
        expect(errors).toHaveLength(0);
    });

    test('handles errors with complex file paths', () => {
        const output = `client/src/app/components/dashboard.component.ts(142,23): error TS2339: Property 'foo' does not exist on type 'Bar'.`;
        const errors = parseTscOutput(output);
        expect(errors).toHaveLength(1);
        expect(errors[0].file).toBe('client/src/app/components/dashboard.component.ts');
        expect(errors[0].line).toBe(142);
        expect(errors[0].col).toBe(23);
    });

    test('ignores non-error lines mixed in output', () => {
        const output = `Version 5.4.2
server/foo.ts(1,1): error TS1005: ';' expected.
Found 1 error.`;
        const errors = parseTscOutput(output);
        expect(errors).toHaveLength(1);
    });
});

// ─── Test Output Parsing ─────────────────────────────────────────────────────

describe('parseTestOutput', () => {
    test('detects passing tests', () => {
        const output = `bun test v1.0.0\n\n42 pass\n0 fail\n`;
        const result = parseTestOutput(output, 0);
        expect(result.passed).toBe(true);
        expect(result.failureCount).toBe(0);
    });

    test('detects failing tests', () => {
        const output = `bun test v1.0.0\n\n40 pass\n3 fail\n`;
        const result = parseTestOutput(output, 1);
        expect(result.passed).toBe(false);
        expect(result.failureCount).toBe(3);
    });

    test('ensures at least 1 failure when exit code non-zero', () => {
        const output = `error: module not found\n`;
        const result = parseTestOutput(output, 1);
        expect(result.passed).toBe(false);
        expect(result.failureCount).toBeGreaterThanOrEqual(1);
    });

    test('captures last 30 lines as summary', () => {
        const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
        const result = parseTestOutput(lines, 0);
        expect(result.summary).toContain('line 50');
        expect(result.summary).not.toContain('line 10');
    });
});

// ─── TODO Counting ───────────────────────────────────────────────────────────

describe('parseTodoOutput', () => {
    test('counts TODOs, FIXMEs, and HACKs', () => {
        const output = `server/foo.ts:10: // TODO: fix this
server/bar.ts:20: // FIXME: broken
server/baz.ts:30: // HACK: temporary workaround
server/qux.ts:40: // TODO: another todo`;
        const result = parseTodoOutput(output);
        expect(result.todoCount).toBe(2);
        expect(result.fixmeCount).toBe(1);
        expect(result.hackCount).toBe(1);
    });

    test('returns zeros for empty output', () => {
        const result = parseTodoOutput('');
        expect(result.todoCount).toBe(0);
        expect(result.fixmeCount).toBe(0);
        expect(result.hackCount).toBe(0);
        expect(result.samples).toHaveLength(0);
    });

    test('limits samples to 10', () => {
        const lines = Array.from({ length: 20 }, (_, i) => `server/f${i}.ts:1: // TODO: item ${i}`).join('\n');
        const result = parseTodoOutput(lines);
        expect(result.samples).toHaveLength(10);
    });

    test('truncates long sample lines to 200 chars', () => {
        const longLine = `server/foo.ts:1: // TODO: ${'x'.repeat(300)}`;
        const result = parseTodoOutput(longLine);
        expect(result.samples[0].length).toBeLessThanOrEqual(200);
    });
});

// ─── Large File Detection ────────────────────────────────────────────────────

describe('parseLargeFiles', () => {
    test('identifies files over threshold', () => {
        const output = `   150 server/small.ts
   800 server/big.ts
   300 server/medium.ts
  1200 server/huge.ts
  2450 total`;
        const files = parseLargeFiles(output, 500);
        expect(files).toHaveLength(2);
        expect(files[0].file).toBe('server/huge.ts');
        expect(files[0].lines).toBe(1200);
        expect(files[1].file).toBe('server/big.ts');
        expect(files[1].lines).toBe(800);
    });

    test('returns empty for no files over threshold', () => {
        const output = `   100 server/a.ts\n   200 server/b.ts`;
        const files = parseLargeFiles(output, 500);
        expect(files).toHaveLength(0);
    });

    test('ignores non-.ts files', () => {
        const output = `   800 server/big.js\n   900 server/big.ts`;
        const files = parseLargeFiles(output, 500);
        expect(files).toHaveLength(1);
        expect(files[0].file).toBe('server/big.ts');
    });

    test('sorts by line count descending', () => {
        const output = `   600 server/a.ts\n   900 server/b.ts\n   700 server/c.ts`;
        const files = parseLargeFiles(output, 500);
        expect(files[0].lines).toBe(900);
        expect(files[1].lines).toBe(700);
        expect(files[2].lines).toBe(600);
    });
});

// ─── Outdated Dependency Parsing ─────────────────────────────────────────────

describe('parseOutdatedOutput', () => {
    test('parses tabular outdated output', () => {
        const output = `Package          Current  Latest
typescript       5.3.0    5.4.2
@types/node      20.10.0  20.11.5`;
        const deps = parseOutdatedOutput(output);
        expect(deps).toHaveLength(2);
        expect(deps[0]).toEqual({ name: 'typescript', current: '5.3.0', latest: '5.4.2' });
        expect(deps[1]).toEqual({ name: '@types/node', current: '20.10.0', latest: '20.11.5' });
    });

    test('returns empty for no outdated deps', () => {
        const deps = parseOutdatedOutput('');
        expect(deps).toHaveLength(0);
    });

    test('filters out header and separator lines', () => {
        const output = `Package          Current  Latest
─────────────────────────────────
typescript       5.3.0    5.4.2`;
        const deps = parseOutdatedOutput(output);
        expect(deps).toHaveLength(1);
        expect(deps[0].name).toBe('typescript');
    });

    test('skips entries where current equals latest', () => {
        const output = `Package          Current  Latest
typescript       5.4.2    5.4.2`;
        const deps = parseOutdatedOutput(output);
        expect(deps).toHaveLength(0);
    });
});
