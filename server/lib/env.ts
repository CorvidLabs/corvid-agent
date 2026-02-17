/**
 * Safe environment variable builders for subprocess spawning.
 *
 * Prevents leaking sensitive env vars (API keys, mnemonics, secrets)
 * to child processes that only need PATH + auth tokens.
 */

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
    return safe;
}
