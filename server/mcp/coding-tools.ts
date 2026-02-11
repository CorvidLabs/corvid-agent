/**
 * Coding tools for the direct execution engine.
 *
 * Provides file read/write, command execution, and search capabilities
 * so Ollama agents can do real coding work without Claude SDK.
 */

import { resolve, relative } from 'path';
import { isProtectedPath, BASH_WRITE_OPERATORS } from '../process/protected-paths';
import type { DirectToolDefinition } from './direct-tools';

export interface CodingToolContext {
    workingDir: string;          // Project working directory (absolute)
    env: Record<string, string>; // Safe env vars for spawned commands
}

// ── Safety helpers ──────────────────────────────────────────────────────

/**
 * Resolve a file path relative to workingDir and reject traversal outside it.
 * Returns the absolute resolved path, or throws if the path escapes.
 */
function resolveSafePath(workingDir: string, filePath: string): string {
    const abs = resolve(workingDir, filePath);
    const rel = relative(workingDir, abs);
    if (rel.startsWith('..') || resolve(abs) !== abs && rel.startsWith('..')) {
        throw new Error(`Path traversal denied: "${filePath}" resolves outside the project directory`);
    }
    // Double-check: the resolved path must start with workingDir
    if (!abs.startsWith(workingDir)) {
        throw new Error(`Path traversal denied: "${filePath}" resolves outside the project directory`);
    }
    return abs;
}

/**
 * Middle-truncate text to protect small context windows.
 * Keeps beginning and end so the model sees file structure.
 */
function truncateOutput(text: string, limit = 8000): string {
    if (text.length <= limit) return text;
    const half = Math.floor(limit / 2) - 30;
    const omitted = text.length - limit + 60;
    return text.slice(0, half) + `\n\n... [${omitted} characters truncated] ...\n\n` + text.slice(-half);
}

/** Allowlisted env vars safe for spawned coding commands. */
export function buildSafeEnvForCoding(): Record<string, string> {
    const ALLOWED_KEYS = [
        'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
        'TERM', 'EDITOR', 'VISUAL', 'TMPDIR', 'XDG_RUNTIME_DIR',
        'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
        'GH_TOKEN', 'GITHUB_TOKEN',
        'NODE_PATH', 'BUN_INSTALL',
        // Windows equivalents
        'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
        'SystemRoot', 'COMSPEC', 'PATHEXT',
    ];

    const safe: Record<string, string> = {};
    for (const key of ALLOWED_KEYS) {
        const val = process.env[key];
        if (val !== undefined) {
            safe[key] = val;
        }
    }
    return safe;
}

// Dangerous command patterns that are always blocked
const BLOCKED_COMMAND_PATTERNS = [
    /\bsudo\b/,
    /\brm\s+-rf\s+\//,        // rm -rf /
    /\bmkfs\b/,
    /\bdd\s+.*of=\/dev\//,    // dd to device
    /\bshutdown\b/,
    /\breboot\b/,
    /\bkillall\b/,
    /\bchmod\s+777\s+\//,     // chmod 777 /
];

// ── Tool definitions ────────────────────────────────────────────────────

export function buildCodingTools(ctx: CodingToolContext): DirectToolDefinition[] {
    return [
        // ── read_file ───────────────────────────────────────────────
        {
            name: 'read_file',
            description: 'Read the contents of a file. Returns numbered lines. Use offset/limit for large files.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path relative to project directory' },
                    offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
                    limit: { type: 'number', description: 'Maximum number of lines to read' },
                },
                required: ['path'],
            },
            handler: async (args) => {
                try {
                    const absPath = resolveSafePath(ctx.workingDir, String(args.path));
                    const file = Bun.file(absPath);
                    if (!await file.exists()) {
                        return { text: `File not found: ${args.path}`, isError: true };
                    }

                    const content = await file.text();
                    let lines = content.split('\n');

                    const offset = typeof args.offset === 'number' ? Math.max(1, args.offset) : 1;
                    const limit = typeof args.limit === 'number' ? args.limit : lines.length;

                    lines = lines.slice(offset - 1, offset - 1 + limit);

                    // Number the lines
                    const numbered = lines.map((line, i) => `${offset + i}\t${line}`).join('\n');
                    return { text: truncateOutput(numbered) };
                } catch (err) {
                    return { text: String(err instanceof Error ? err.message : err), isError: true };
                }
            },
        },

        // ── write_file ──────────────────────────────────────────────
        {
            name: 'write_file',
            description: 'Create or overwrite a file with the given content.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path relative to project directory' },
                    content: { type: 'string', description: 'The content to write' },
                },
                required: ['path', 'content'],
            },
            handler: async (args) => {
                try {
                    const filePath = String(args.path);
                    const absPath = resolveSafePath(ctx.workingDir, filePath);

                    if (isProtectedPath(filePath) || isProtectedPath(absPath)) {
                        return { text: `Protected file — cannot write: ${filePath}`, isError: true };
                    }

                    // Ensure parent directory exists
                    const dir = absPath.substring(0, absPath.lastIndexOf('/'));
                    await Bun.spawn(['mkdir', '-p', dir], { cwd: ctx.workingDir }).exited;

                    await Bun.write(absPath, String(args.content));
                    return { text: `File written: ${filePath}` };
                } catch (err) {
                    return { text: String(err instanceof Error ? err.message : err), isError: true };
                }
            },
        },

        // ── edit_file ───────────────────────────────────────────────
        {
            name: 'edit_file',
            description: 'Edit a file by replacing an exact string match. The old_string must appear exactly once in the file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path relative to project directory' },
                    old_string: { type: 'string', description: 'The exact string to find (must be unique in the file)' },
                    new_string: { type: 'string', description: 'The replacement string' },
                },
                required: ['path', 'old_string', 'new_string'],
            },
            handler: async (args) => {
                try {
                    const filePath = String(args.path);
                    const absPath = resolveSafePath(ctx.workingDir, filePath);

                    if (isProtectedPath(filePath) || isProtectedPath(absPath)) {
                        return { text: `Protected file — cannot edit: ${filePath}`, isError: true };
                    }

                    const file = Bun.file(absPath);
                    if (!await file.exists()) {
                        return { text: `File not found: ${filePath}`, isError: true };
                    }

                    const content = await file.text();
                    const oldStr = String(args.old_string);
                    const newStr = String(args.new_string);

                    if (oldStr === newStr) {
                        return { text: 'old_string and new_string are identical — no change needed', isError: true };
                    }

                    // Count occurrences
                    let count = 0;
                    let idx = 0;
                    while ((idx = content.indexOf(oldStr, idx)) !== -1) {
                        count++;
                        idx += oldStr.length;
                    }

                    if (count === 0) {
                        return { text: `old_string not found in ${filePath}. Read the file first to see its current content.`, isError: true };
                    }
                    if (count > 1) {
                        return { text: `old_string appears ${count} times in ${filePath}. It must be unique — include more surrounding context.`, isError: true };
                    }

                    const updated = content.replace(oldStr, newStr);
                    await Bun.write(absPath, updated);
                    return { text: `File edited: ${filePath}` };
                } catch (err) {
                    return { text: String(err instanceof Error ? err.message : err), isError: true };
                }
            },
        },

        // ── run_command ─────────────────────────────────────────────
        {
            name: 'run_command',
            description: 'Execute a shell command in the project directory. Default timeout is 30 seconds.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Shell command to execute' },
                    timeout: { type: 'number', description: 'Timeout in seconds (max 120)' },
                },
                required: ['command'],
            },
            handler: async (args) => {
                try {
                    const command = String(args.command);

                    // Block dangerous patterns
                    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
                        if (pattern.test(command)) {
                            return { text: `Command blocked for safety: matches "${pattern.source}"`, isError: true };
                        }
                    }

                    // Check write operators against protected paths
                    if (BASH_WRITE_OPERATORS.test(command)) {
                        // Extract potential file paths from the command and check protection
                        const tokens = command.split(/\s+/);
                        for (const token of tokens) {
                            if (token.startsWith('-') || token.startsWith('|') || token.startsWith(';')) continue;
                            if (isProtectedPath(token)) {
                                return { text: `Command blocked: targets protected path "${token}"`, isError: true };
                            }
                        }
                    }

                    const timeoutSec = Math.min(typeof args.timeout === 'number' ? args.timeout : 30, 120);
                    const timeoutMs = timeoutSec * 1000;

                    const proc = Bun.spawn(['sh', '-c', command], {
                        cwd: ctx.workingDir,
                        env: ctx.env,
                        stdout: 'pipe',
                        stderr: 'pipe',
                    });

                    // Race between process completion and timeout
                    const timer = setTimeout(() => proc.kill(), timeoutMs);
                    const exitCode = await proc.exited;
                    clearTimeout(timer);

                    const stdout = await new Response(proc.stdout).text();
                    const stderr = await new Response(proc.stderr).text();

                    let output = '';
                    if (stdout) output += stdout;
                    if (stderr) output += (output ? '\n' : '') + `[stderr]\n${stderr}`;
                    if (!output) output = `(no output, exit code: ${exitCode})`;

                    output = truncateOutput(output);

                    if (exitCode !== 0) {
                        return { text: `Exit code ${exitCode}\n${output}`, isError: true };
                    }
                    return { text: output };
                } catch (err) {
                    return { text: String(err instanceof Error ? err.message : err), isError: true };
                }
            },
        },

        // ── list_files ──────────────────────────────────────────────
        {
            name: 'list_files',
            description: 'List files in a directory or matching a glob pattern (e.g. "src/**/*.ts").',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path or glob pattern relative to project directory. Defaults to "."' },
                },
            },
            handler: async (args) => {
                try {
                    const pathArg = String(args.path ?? '.');
                    const MAX_RESULTS = 500;

                    // Check if it looks like a glob pattern
                    if (pathArg.includes('*') || pathArg.includes('?') || pathArg.includes('{')) {
                        const glob = new Bun.Glob(pathArg);
                        const results: string[] = [];
                        for await (const match of glob.scan({ cwd: ctx.workingDir, dot: false })) {
                            results.push(match);
                            if (results.length >= MAX_RESULTS) break;
                        }

                        if (results.length === 0) {
                            return { text: `No files match pattern: ${pathArg}` };
                        }

                        results.sort();
                        let output = results.join('\n');
                        if (results.length >= MAX_RESULTS) {
                            output += `\n\n(truncated at ${MAX_RESULTS} results)`;
                        }
                        return { text: output };
                    }

                    // Plain directory listing
                    const absPath = resolveSafePath(ctx.workingDir, pathArg);

                    const proc = Bun.spawn(['ls', '-la', absPath], {
                        cwd: ctx.workingDir,
                        stdout: 'pipe',
                        stderr: 'pipe',
                    });

                    await proc.exited;
                    const stdout = await new Response(proc.stdout).text();
                    const stderr = await new Response(proc.stderr).text();

                    if (stderr && !stdout) {
                        return { text: stderr.trim(), isError: true };
                    }

                    return { text: truncateOutput(stdout.trim()) };
                } catch (err) {
                    return { text: String(err instanceof Error ? err.message : err), isError: true };
                }
            },
        },

        // ── search_files ────────────────────────────────────────────
        {
            name: 'search_files',
            description: 'Search for a text pattern across files in the project. Uses grep with regex support.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Search pattern (regex supported)' },
                    path: { type: 'string', description: 'Directory to search in, relative to project. Defaults to "."' },
                    glob: { type: 'string', description: 'File glob filter (e.g. "*.ts", "*.py")' },
                },
                required: ['pattern'],
            },
            handler: async (args) => {
                try {
                    const pattern = String(args.pattern);
                    const searchPath = String(args.path ?? '.');
                    const absPath = resolveSafePath(ctx.workingDir, searchPath);

                    const grepArgs = ['grep', '-rnI', '--color=never'];

                    if (args.glob) {
                        grepArgs.push(`--include=${String(args.glob)}`);
                    }

                    // Exclude common noise directories
                    grepArgs.push('--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist');

                    grepArgs.push(pattern, absPath);

                    const proc = Bun.spawn(grepArgs, {
                        cwd: ctx.workingDir,
                        stdout: 'pipe',
                        stderr: 'pipe',
                    });

                    const timer = setTimeout(() => proc.kill(), 15_000);
                    const exitCode = await proc.exited;
                    clearTimeout(timer);

                    const stdout = await new Response(proc.stdout).text();
                    const stderr = await new Response(proc.stderr).text();

                    if (exitCode === 1) {
                        return { text: `No matches found for: ${pattern}` };
                    }

                    if (exitCode !== 0 && exitCode !== 1) {
                        return { text: `grep error (exit ${exitCode}): ${stderr.trim()}`, isError: true };
                    }

                    // Cap results
                    const MAX_RESULTS = 200;
                    const lines = stdout.split('\n').filter(Boolean);
                    let output: string;
                    if (lines.length > MAX_RESULTS) {
                        output = lines.slice(0, MAX_RESULTS).join('\n') + `\n\n(${lines.length - MAX_RESULTS} more results truncated)`;
                    } else {
                        output = lines.join('\n');
                    }

                    // Make paths relative to workingDir for readability
                    output = output.replaceAll(ctx.workingDir + '/', '');

                    return { text: truncateOutput(output) };
                } catch (err) {
                    return { text: String(err instanceof Error ? err.message : err), isError: true };
                }
            },
        },
    ];
}
