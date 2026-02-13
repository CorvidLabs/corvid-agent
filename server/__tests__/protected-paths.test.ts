import { describe, expect, test } from 'bun:test';
import {
    isProtectedPath,
    isProtectedBashCommand,
    BASH_WRITE_OPERATORS,
} from '../process/protected-paths';

// ── isProtectedPath (existing functionality) ────────────────────────────

describe('isProtectedPath', () => {
    test('detects basename-protected files', () => {
        expect(isProtectedPath('server/process/manager.ts')).toBe(true);
        expect(isProtectedPath('sdk-process.ts')).toBe(true);
        expect(isProtectedPath('/absolute/path/to/schema.ts')).toBe(true);
    });

    test('does not false-positive on partial basename matches', () => {
        expect(isProtectedPath('task-manager.ts')).toBe(false);
        expect(isProtectedPath('my-schema.ts')).toBe(false);
    });

    test('detects substring-protected paths', () => {
        expect(isProtectedPath('.env')).toBe(true);
        expect(isProtectedPath('server/selftest/foo.ts')).toBe(true);
        expect(isProtectedPath('corvid-agent.db')).toBe(true);
    });

    test('allows non-protected paths', () => {
        expect(isProtectedPath('server/lib/resilience.ts')).toBe(false);
        expect(isProtectedPath('server/mcp/coding-tools.ts')).toBe(false);
    });
});

// ── BASH_WRITE_OPERATORS (expanded) ─────────────────────────────────────

describe('BASH_WRITE_OPERATORS', () => {
    test('matches original operators', () => {
        expect(BASH_WRITE_OPERATORS.test('rm file')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('mv a b')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('sed -i pattern file')).toBe(true);
    });

    test('matches expanded operators', () => {
        expect(BASH_WRITE_OPERATORS.test('ed script.ed')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('perl -e "code"')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('rsync src dst')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('install file dest')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('truncate -s 0 file')).toBe(true);
    });

    test('does not match read-only commands', () => {
        expect(BASH_WRITE_OPERATORS.test('cat file')).toBe(false);
        expect(BASH_WRITE_OPERATORS.test('grep pattern file')).toBe(false);
        expect(BASH_WRITE_OPERATORS.test('ls -la')).toBe(false);
    });
});

// ── isProtectedBashCommand ──────────────────────────────────────────────

describe('isProtectedBashCommand', () => {
    test('blocks quoted protected path', () => {
        const result = isProtectedBashCommand(`rm '/some/path/manager.ts'`);
        expect(result.blocked).toBe(true);
        expect(result.path).toContain('manager.ts');
    });

    test('blocks double-quoted protected path', () => {
        const result = isProtectedBashCommand('rm "/path/to/sdk-process.ts"');
        expect(result.blocked).toBe(true);
        expect(result.path).toContain('sdk-process.ts');
    });

    test('blocks variable expansion combined with write operator', () => {
        const result = isProtectedBashCommand('rm ${TARGET}');
        expect(result.blocked).toBe(true);
        expect(result.reason).toContain('variable expansion');
    });

    test('blocks eval wrapping combined with write operator', () => {
        const result = isProtectedBashCommand('eval "rm manager.ts"');
        expect(result.blocked).toBe(true);
        expect(result.reason).toContain('eval');
    });

    test('allows innocent commands', () => {
        const result = isProtectedBashCommand('cat readme.md');
        expect(result.blocked).toBe(false);
    });

    test('allows non-protected file writes', () => {
        const result = isProtectedBashCommand('rm /tmp/scratch.txt');
        expect(result.blocked).toBe(false);
    });

    test('blocks bash -c targeting write operations', () => {
        const result = isProtectedBashCommand('bash -c "rm something"');
        expect(result.blocked).toBe(true);
    });
});
