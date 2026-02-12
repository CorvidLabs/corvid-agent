/**
 * Tests for the coding tools (read_file, write_file, edit_file, run_command, list_files, search_files).
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildCodingTools, buildSafeEnvForCoding, type CodingToolContext } from '../mcp/coding-tools';
import { buildDirectTools, type DirectToolDefinition } from '../mcp/direct-tools';

let workDir: string;
let ctx: CodingToolContext;
let tools: DirectToolDefinition[];
let toolMap: Map<string, DirectToolDefinition>;

function getTool(name: string): DirectToolDefinition {
    const t = toolMap.get(name);
    if (!t) throw new Error(`Tool not found: ${name}`);
    return t;
}

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'coding-tools-test-'));
    ctx = { workingDir: workDir, env: buildSafeEnvForCoding() };
    tools = buildCodingTools(ctx);
    toolMap = new Map(tools.map((t) => [t.name, t]));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

// ── Tool registration ───────────────────────────────────────────────────

describe('tool registration', () => {
    test('buildCodingTools returns all 6 tools', () => {
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual(['edit_file', 'list_files', 'read_file', 'run_command', 'search_files', 'write_file']);
    });

    test('buildDirectTools merges coding tools when codingCtx is provided', () => {
        const allTools = buildDirectTools(null, ctx);
        const names = allTools.map((t) => t.name);
        expect(names).toContain('read_file');
        expect(names).toContain('write_file');
        expect(names).toContain('run_command');
    });

    test('buildDirectTools returns no MCP tools when ctx is null', () => {
        const allTools = buildDirectTools(null, ctx);
        const names = allTools.map((t) => t.name);
        expect(names).not.toContain('corvid_send_message');
        expect(names).not.toContain('corvid_save_memory');
    });
});

// ── buildSafeEnvForCoding ───────────────────────────────────────────────

describe('buildSafeEnvForCoding', () => {
    test('includes PATH and HOME', () => {
        const env = buildSafeEnvForCoding();
        expect(env.PATH).toBeDefined();
        // Windows uses USERPROFILE instead of HOME
        const hasHome = env.HOME !== undefined || env.USERPROFILE !== undefined;
        expect(hasHome).toBe(true);
    });

    test('excludes secret-like env vars', () => {
        // Set a secret env var temporarily
        const origKey = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'sk-test-secret';
        const env = buildSafeEnvForCoding();
        expect(env.ANTHROPIC_API_KEY).toBeUndefined();
        // Restore
        if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
        else delete process.env.ANTHROPIC_API_KEY;
    });
});

// ── read_file ───────────────────────────────────────────────────────────

describe('read_file', () => {
    test('reads a file with line numbers', async () => {
        await Bun.write(join(workDir, 'hello.txt'), 'line one\nline two\nline three\n');
        const result = await getTool('read_file').handler({ path: 'hello.txt' });
        expect(result.isError).toBeUndefined();
        expect(result.text).toContain('1\tline one');
        expect(result.text).toContain('2\tline two');
        expect(result.text).toContain('3\tline three');
    });

    test('supports offset and limit', async () => {
        await Bun.write(join(workDir, 'lines.txt'), 'a\nb\nc\nd\ne\n');
        const result = await getTool('read_file').handler({ path: 'lines.txt', offset: 2, limit: 2 });
        expect(result.text).toContain('2\tb');
        expect(result.text).toContain('3\tc');
        expect(result.text).not.toContain('1\ta');
        expect(result.text).not.toContain('4\td');
    });

    test('returns error for nonexistent file', async () => {
        const result = await getTool('read_file').handler({ path: 'nope.txt' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('not found');
    });

    test('rejects path traversal', async () => {
        const result = await getTool('read_file').handler({ path: '../../etc/passwd' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('traversal denied');
    });
});

// ── write_file ──────────────────────────────────────────────────────────

describe('write_file', () => {
    test('creates a new file', async () => {
        const result = await getTool('write_file').handler({ path: 'new.txt', content: 'hello world' });
        expect(result.isError).toBeUndefined();
        expect(result.text).toContain('File written');
        const content = await Bun.file(join(workDir, 'new.txt')).text();
        expect(content).toBe('hello world');
    });

    test('creates parent directories', async () => {
        const result = await getTool('write_file').handler({ path: 'sub/dir/file.txt', content: 'nested' });
        expect(result.isError).toBeUndefined();
        const content = await Bun.file(join(workDir, 'sub/dir/file.txt')).text();
        expect(content).toBe('nested');
    });

    test('rejects protected paths', async () => {
        const result = await getTool('write_file').handler({ path: 'CLAUDE.md', content: 'hacked' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('Protected file');
    });

    test('rejects path traversal', async () => {
        const result = await getTool('write_file').handler({ path: '../outside.txt', content: 'bad' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('traversal denied');
    });
});

// ── edit_file ───────────────────────────────────────────────────────────

describe('edit_file', () => {
    test('replaces a unique string', async () => {
        await Bun.write(join(workDir, 'edit.txt'), 'hello world\ngoodbye world\n');
        const result = await getTool('edit_file').handler({
            path: 'edit.txt',
            old_string: 'hello world',
            new_string: 'hi there',
        });
        expect(result.isError).toBeUndefined();
        const content = await Bun.file(join(workDir, 'edit.txt')).text();
        expect(content).toBe('hi there\ngoodbye world\n');
    });

    test('rejects non-unique match', async () => {
        await Bun.write(join(workDir, 'dup.txt'), 'foo bar\nfoo baz\n');
        const result = await getTool('edit_file').handler({
            path: 'dup.txt',
            old_string: 'foo',
            new_string: 'qux',
        });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('appears 2 times');
    });

    test('rejects when old_string not found', async () => {
        await Bun.write(join(workDir, 'miss.txt'), 'hello\n');
        const result = await getTool('edit_file').handler({
            path: 'miss.txt',
            old_string: 'nope',
            new_string: 'yes',
        });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('not found');
    });

    test('rejects identical old and new strings', async () => {
        await Bun.write(join(workDir, 'same.txt'), 'hello\n');
        const result = await getTool('edit_file').handler({
            path: 'same.txt',
            old_string: 'hello',
            new_string: 'hello',
        });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('identical');
    });

    test('rejects protected paths', async () => {
        await Bun.write(join(workDir, 'package.json'), '{}');
        const result = await getTool('edit_file').handler({
            path: 'package.json',
            old_string: '{}',
            new_string: '{"hacked": true}',
        });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('Protected file');
    });
});

// ── run_command ──────────────────────────────────────────────────────────

describe('run_command', () => {
    test('runs a simple command', async () => {
        const result = await getTool('run_command').handler({ command: 'echo hello' });
        expect(result.isError).toBeUndefined();
        expect(result.text.trim()).toBe('hello');
    });

    test('returns exit code on failure', async () => {
        const result = await getTool('run_command').handler({ command: 'exit 42' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('Exit code 42');
    });

    test('blocks sudo', async () => {
        const result = await getTool('run_command').handler({ command: 'sudo rm -rf /' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('blocked');
    });

    test('blocks rm -rf /', async () => {
        const result = await getTool('run_command').handler({ command: 'rm -rf /' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('blocked');
    });

    test('runs in the project directory', async () => {
        // Always use `pwd` since run_command uses `sh -c` on all platforms
        const result = await getTool('run_command').handler({ command: 'pwd' });
        const output = result.text.trim().replace(/\r\n/g, '\n').trim();
        // macOS: /var → /private/var symlink; normalize both sides
        const normalizePrivate = (p: string) => p.replace(/^\/private/, '');
        expect(normalizePrivate(output)).toEndWith(normalizePrivate(workDir));
    });

    test('respects timeout', async () => {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'ping -n 30 127.0.0.1' : 'sleep 30';
        const start = Date.now();
        await getTool('run_command').handler({ command, timeout: 2 });
        const elapsed = Date.now() - start;
        // Should be killed well before 30s (generous for slow CI runners)
        expect(elapsed).toBeLessThan(15_000);
    }, 20_000);

    test('blocks write operators targeting protected paths', async () => {
        const result = await getTool('run_command').handler({ command: 'rm CLAUDE.md' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('protected');
    });
});

// ── list_files ──────────────────────────────────────────────────────────

describe('list_files', () => {
    test('lists directory contents', async () => {
        await Bun.write(join(workDir, 'a.txt'), 'a');
        await Bun.write(join(workDir, 'b.txt'), 'b');
        const result = await getTool('list_files').handler({ path: '.' });
        expect(result.text).toContain('a.txt');
        expect(result.text).toContain('b.txt');
    });

    test('supports glob patterns', async () => {
        await Bun.write(join(workDir, 'foo.ts'), '');
        await Bun.write(join(workDir, 'bar.ts'), '');
        await Bun.write(join(workDir, 'baz.js'), '');
        const result = await getTool('list_files').handler({ path: '*.ts' });
        expect(result.text).toContain('foo.ts');
        expect(result.text).toContain('bar.ts');
        expect(result.text).not.toContain('baz.js');
    });

    test('returns message for no glob matches', async () => {
        const result = await getTool('list_files').handler({ path: '*.xyz' });
        expect(result.text).toContain('No files match');
    });
});

// ── search_files ────────────────────────────────────────────────────────

describe('search_files', () => {
    test('finds matching content', async () => {
        await Bun.write(join(workDir, 'haystack.txt'), 'needle in a haystack\nno match here\n');
        const result = await getTool('search_files').handler({ pattern: 'needle' });
        expect(result.text).toContain('needle');
        expect(result.text).toContain('haystack.txt');
    });

    test('returns no-match message', async () => {
        await Bun.write(join(workDir, 'empty.txt'), 'nothing here\n');
        const result = await getTool('search_files').handler({ pattern: 'zzz_no_match_zzz' });
        expect(result.text).toContain('No matches');
    });

    test('supports glob filter', async () => {
        await Bun.write(join(workDir, 'code.ts'), 'findme\n');
        await Bun.write(join(workDir, 'data.json'), 'findme\n');
        const result = await getTool('search_files').handler({ pattern: 'findme', glob: '*.ts' });
        expect(result.text).toContain('code.ts');
        expect(result.text).not.toContain('data.json');
    });

    test('rejects path traversal', async () => {
        const result = await getTool('search_files').handler({ pattern: 'test', path: '../../' });
        expect(result.isError).toBe(true);
        expect(result.text).toContain('traversal denied');
    });
});
