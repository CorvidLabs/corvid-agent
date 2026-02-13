/**
 * Shared path-protection utilities used by both SDK and direct execution engines.
 * Agents must never modify these paths, even in full-auto mode.
 */

import { analyzeBashCommand } from '../lib/bash-security';

// Paths that agents must never modify, even in full-auto mode.
// Uses basename matching to avoid false positives (e.g. "manager.ts" matching "task-manager.ts").
export const PROTECTED_BASENAMES = new Set([
    'spending.ts',
    'sdk-process.ts',
    'manager.ts',
    'sdk-tools.ts',
    'tool-handlers.ts',
    'CLAUDE.md',
    'schema.ts',
    'package.json',
]);

// Paths matched by substring (for files/dirs without unique basenames).
export const PROTECTED_SUBSTRINGS = [
    '.env',
    'corvid-agent.db',
    'wallet-keystore.json',
    'server/index.ts',
    'server/algochat/bridge.ts',
    'server/algochat/config.ts',
    'server/selftest/',
];

// Shell operators/commands that indicate write/destructive file operations.
export const BASH_WRITE_OPERATORS = /(?:>>?\s|rm\s|mv\s|cp\s|chmod\s|chown\s|sed\s+-i|tee\s|dd\s|ln\s|curl\s.*-o|wget\s|python[3]?\s+-c|node\s+-e|bun\s+-e|ed\s|perl\s+-|rsync\s|install\s|truncate\s)/;

export function isProtectedPath(filePath: string): boolean {
    // Normalize to forward slashes for cross-platform matching
    const normalized = filePath.replace(/\\/g, '/');
    const basename = normalized.split('/').pop() ?? '';

    // Exact basename match (e.g. "manager.ts" only matches ".../server/process/manager.ts",
    // not ".../task-manager.ts")
    if (PROTECTED_BASENAMES.has(basename)) return true;

    // Substring match for paths without unique basenames
    return PROTECTED_SUBSTRINGS.some((p) => normalized.includes(p));
}

export function extractFilePathsFromInput(input: Record<string, unknown>): string[] {
    // Write / Edit use `file_path`; MultiEdit uses `files` array — return ALL paths
    const paths: string[] = [];
    if (typeof input.file_path === 'string') paths.push(input.file_path);
    if (Array.isArray(input.files)) {
        for (const f of input.files) {
            if (typeof f === 'object' && f !== null && typeof (f as { file_path?: string }).file_path === 'string') {
                paths.push((f as { file_path: string }).file_path);
            }
        }
    }
    return paths;
}

// ── Quote-aware bash command protection ─────────────────────────────────

export interface ProtectedBashResult {
    blocked: boolean;
    path?: string;
    reason?: string;
}

/**
 * Analyze a bash command for protected-path violations using quote-aware
 * tokenization and dangerous-pattern detection.
 */
export function isProtectedBashCommand(command: string): ProtectedBashResult {
    const analysis = analyzeBashCommand(command);

    // Check if any extracted path targets a protected file
    for (const path of analysis.paths) {
        if (isProtectedPath(path)) {
            return { blocked: true, path, reason: `Targets protected path "${path}"` };
        }
    }

    // If the command has dangerous patterns (eval, $(), etc.) AND write operators,
    // block it — we can't reliably determine the target paths
    if (analysis.hasDangerousPatterns && BASH_WRITE_OPERATORS.test(command)) {
        return {
            blocked: true,
            reason: `${analysis.reason} — combined with write operator, cannot verify target paths`,
        };
    }

    return { blocked: false };
}
