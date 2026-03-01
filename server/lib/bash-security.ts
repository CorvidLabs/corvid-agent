/**
 * Bash command security analysis.
 *
 * Provides quote-aware tokenization, path extraction, and dangerous-pattern
 * detection for hardening the protected-path enforcement in run_command.
 */

// ── Tokenizer ───────────────────────────────────────────────────────────

/**
 * Quote-aware bash command tokenizer.
 * Handles single quotes, double quotes, and backslash escaping.
 * Strips quotes from tokens to expose the underlying value.
 */
export function tokenizeBashCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let i = 0;

    while (i < command.length) {
        const ch = command[i];

        if (ch === '\\' && i + 1 < command.length) {
            // Backslash escaping — take the next char literally
            current += command[i + 1];
            i += 2;
            continue;
        }

        if (ch === "'") {
            // Single-quoted string — no escaping inside, read until closing '
            i++; // skip opening quote
            while (i < command.length && command[i] !== "'") {
                current += command[i];
                i++;
            }
            i++; // skip closing quote
            continue;
        }

        if (ch === '"') {
            // Double-quoted string — backslash escaping works inside
            i++; // skip opening quote
            while (i < command.length && command[i] !== '"') {
                if (command[i] === '\\' && i + 1 < command.length) {
                    current += command[i + 1];
                    i += 2;
                } else {
                    current += command[i];
                    i++;
                }
            }
            i++; // skip closing quote
            continue;
        }

        if (/\s/.test(ch)) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            i++;
            continue;
        }

        // Shell operators — split them as separate tokens
        if (ch === '|' || ch === ';') {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            // Handle || and |
            if (ch === '|' && i + 1 < command.length && command[i + 1] === '|') {
                tokens.push('||');
                i += 2;
            } else {
                tokens.push(ch);
                i++;
            }
            continue;
        }

        if (ch === '&') {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            if (i + 1 < command.length && command[i + 1] === '&') {
                tokens.push('&&');
                i += 2;
            } else {
                tokens.push('&');
                i++;
            }
            continue;
        }

        if (ch === '>' || ch === '<') {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            if (i + 1 < command.length && command[i + 1] === ch) {
                tokens.push(ch + ch); // >> or <<
                i += 2;
            } else {
                tokens.push(ch);
                i++;
            }
            continue;
        }

        current += ch;
        i++;
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
}

// ── Path extraction ─────────────────────────────────────────────────────

const SHELL_OPERATORS = new Set(['|', '||', '&&', '&', ';', '>', '>>', '<', '<<']);
const COMMON_COMMANDS = new Set([
    'echo', 'cat', 'grep', 'find', 'ls', 'cd', 'pwd', 'mkdir', 'touch',
    'head', 'tail', 'wc', 'sort', 'uniq', 'diff', 'env', 'export', 'set',
    'true', 'false', 'test', 'sh', 'bash', 'zsh',
    'rm', 'mv', 'cp', 'chmod', 'chown', 'ln', 'tee', 'dd',
    'sed', 'awk', 'perl', 'python', 'python3', 'node', 'bun',
    'curl', 'wget', 'rsync', 'install', 'truncate', 'xargs', 'ed',
    'ruby', 'php', 'command',
]);

/**
 * Extract candidate file paths from a bash command.
 * Filters out flags, operators, and common command names.
 */
export function extractPathsFromCommand(command: string): string[] {
    const tokens = tokenizeBashCommand(command);
    const paths: string[] = [];

    for (const token of tokens) {
        // Skip flags
        if (token.startsWith('-')) continue;
        // Skip shell operators
        if (SHELL_OPERATORS.has(token)) continue;
        // Skip common command names
        if (COMMON_COMMANDS.has(token)) continue;
        // Skip empty
        if (token.length === 0) continue;
        // Looks like it could be a path if it contains / or . or is a filename
        paths.push(token);
    }

    return paths;
}

// ── Expanded write operators ────────────────────────────────────────────

/**
 * Enhanced regex covering write/destructive bash operators.
 * Superset of the original BASH_WRITE_OPERATORS.
 */
export const EXPANDED_WRITE_OPERATORS = /(?:>>?\s|rm\s|mv\s|cp\s|chmod\s|chown\s|sed\s+-i|tee\s|dd\s|ln\s|curl\s.*-o|wget\s|python[3]?\s+-c|node\s+-e|bun\s+-e|ed\s|awk\s.*>|perl\s+-|rsync\s|install\s|truncate\s|xargs\s.*rm|ruby\s+-[ie]|php\s+-r|command\s+-p\s+\w|find\s.*-(?:delete|exec))/;

// ── Dangerous pattern detection ─────────────────────────────────────────

export interface DangerousPatternResult {
    isDangerous: boolean;
    reason?: string;
}

/**
 * Detect bash patterns that could be used to bypass path protection:
 * variable expansion, heredoc redirection, eval/exec wrapping.
 */
export function detectDangerousPatterns(command: string): DangerousPatternResult {
    // Command substitution: $() or backticks
    if (/\$\(/.test(command)) {
        return { isDangerous: true, reason: 'Contains command substitution: $()' };
    }
    if (/`[^`]+`/.test(command)) {
        return { isDangerous: true, reason: 'Contains command substitution: backticks' };
    }

    // Variable expansion in paths: ${}
    if (/\$\{/.test(command)) {
        return { isDangerous: true, reason: 'Contains variable expansion: ${}' };
    }

    // Heredoc redirection
    if (/<</.test(command)) {
        return { isDangerous: true, reason: 'Contains heredoc redirection: <<' };
    }

    // eval / exec wrapping
    if (/\beval\b/.test(command)) {
        return { isDangerous: true, reason: 'Contains eval' };
    }
    if (/(?<![-.])exec\b/.test(command)) {
        return { isDangerous: true, reason: 'Contains exec' };
    }

    // bash -c / sh -c / zsh -c
    if (/\b(?:bash|sh|zsh)\s+-c\b/.test(command)) {
        return { isDangerous: true, reason: 'Contains shell -c invocation' };
    }

    // command -p bypass (runs PATH version, bypasses aliases/functions)
    if (/\bcommand\s+-p\b/.test(command)) {
        return { isDangerous: true, reason: 'Contains command -p bypass' };
    }

    // env as command wrapper bypass
    if (/\benv\s+(?:rm|mv|cp|chmod|chown|sed|perl|ruby|php|python|node|bun|awk|bash|sh|zsh)\b/.test(command)) {
        return { isDangerous: true, reason: 'Contains env command wrapper bypass' };
    }

    // find with destructive flags
    if (/\bfind\b.*\s-(?:delete|exec)\b/.test(command)) {
        return { isDangerous: true, reason: 'Contains find with -delete or -exec' };
    }

    return { isDangerous: false };
}

// ── Main entry point ────────────────────────────────────────────────────

export interface BashCommandAnalysis {
    tokens: string[];
    paths: string[];
    hasDangerousPatterns: boolean;
    reason?: string;
}

/**
 * Full analysis of a bash command: tokenize, extract paths, check for
 * dangerous patterns.
 */
export function analyzeBashCommand(command: string): BashCommandAnalysis {
    const tokens = tokenizeBashCommand(command);
    const paths = extractPathsFromCommand(command);
    const danger = detectDangerousPatterns(command);

    return {
        tokens,
        paths,
        hasDangerousPatterns: danger.isDangerous,
        reason: danger.reason,
    };
}
