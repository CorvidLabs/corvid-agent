/**
 * Safe environment variable builders for subprocess spawning.
 *
 * Prevents leaking sensitive env vars (API keys, mnemonics, secrets)
 * to child processes that only need PATH + auth tokens.
 */

// Remove CLAUDECODE env var so spawned agent sessions don't think they're nested.
// This is set when running inside a Claude Code CLI session, but the server itself
// isn't a nested session — it spawns independent agent processes.
delete process.env.CLAUDECODE;

// On Windows, Bun may not inherit the full user PATH (e.g. ~/.local/bin, GitHub CLI).
// Patch process.env.PATH at module load so that `Bun.which()` and the SDK's internal
// `which` calls can find `claude`, `gh`, `git`, etc.
if (process.platform === 'win32' && process.env.PATH) {
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const extraPaths = [
        `${home}\\.local\\bin`,
        'C:\\Program Files\\GitHub CLI',
        'C:\\Program Files\\Git\\cmd',
    ];
    const current = process.env.PATH;
    const missing = extraPaths.filter(p => p && !current.includes(p));
    if (missing.length > 0) {
        process.env.PATH = current + ';' + missing.join(';');
    }
}

/** Allowlisted env vars safe for gh CLI and other git/GitHub commands. */
const GH_SAFE_KEYS = [
    'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
    'TERM', 'TMPDIR', 'XDG_RUNTIME_DIR',
    'GH_TOKEN', 'GITHUB_TOKEN',
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
    'NO_COLOR',
    // Windows equivalents
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
    'SystemRoot', 'COMSPEC', 'PATHEXT',
];

/**
 * Resolve the path to the `gh` CLI executable.
 * Bun.which() is broken on Windows for dynamically appended PATH entries,
 * so we check common locations directly.
 */
/** @deprecated Use resolveExecutable('gh') instead */
export function resolveGhExecutable(): string {
    return resolveExecutable('gh');
}

/**
 * Resolve a command to its full path on Windows where Bun.which() is broken.
 * On non-Windows, delegates to Bun.which() which works fine.
 * Results are cached for performance.
 */
const _resolvedPaths = new Map<string, string>();
export function resolveExecutable(name: string): string {
    const cached = _resolvedPaths.get(name);
    if (cached) return cached;

    const found = Bun.which(name);
    if (found) { _resolvedPaths.set(name, found); return found; }

    if (process.platform === 'win32') {
        const { existsSync } = require('node:fs');
        const { join } = require('node:path');
        const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
        const bunHome = process.env.BUN_INSTALL ?? join(home, '.bun');

        // Map of command names to candidate locations
        const candidates: Record<string, string[]> = {
            bun: [join(bunHome, 'bin', 'bun.exe'), join(home, '.bun', 'bin', 'bun.exe')],
            bunx: [join(bunHome, 'bin', 'bunx.exe'), join(home, '.bun', 'bin', 'bunx.exe')],
            claude: [join(home, '.local', 'bin', 'claude.exe')],
            gh: ['C:\\Program Files\\GitHub CLI\\gh.exe', 'C:\\Program Files (x86)\\GitHub CLI\\gh.exe'],
            git: ['C:\\Program Files\\Git\\cmd\\git.exe'],
            node: ['C:\\Program Files\\nodejs\\node.exe'],
            tsc: [join(home, '.bun', 'bin', 'bunx.exe')], // tsc runs via bunx
        };

        const paths = candidates[name];
        if (paths) {
            for (const p of paths) {
                if (existsSync(p)) { _resolvedPaths.set(name, p); return p; }
            }
        }
    }

    _resolvedPaths.set(name, name); // fallback to name
    return name;
}

/**
 * Build a safe environment for `gh` CLI subprocesses.
 * Only includes vars needed for git/GitHub operations — no API keys, secrets, or mnemonics.
 */
export function buildSafeGhEnv(): Record<string, string> {
    const safe: Record<string, string> = {};
    for (const key of GH_SAFE_KEYS) {
        const val = process.env[key];
        if (val !== undefined) {
            safe[key] = val;
        }
    }

    // On Windows, ensure common CLI tool directories are in PATH
    // so that `gh`, `git`, etc. can be found by Bun subprocesses.
    if (process.platform === 'win32' && safe['PATH']) {
        const extraPaths = [
            'C:\\Program Files\\GitHub CLI',
            'C:\\Program Files\\Git\\cmd',
        ];
        const currentPath = safe['PATH'];
        const missing = extraPaths.filter(p => !currentPath.includes(p));
        if (missing.length > 0) {
            safe['PATH'] = currentPath + ';' + missing.join(';');
        }
    }

    return safe;
}
