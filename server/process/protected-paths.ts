/**
 * Shared path-protection utilities used by both SDK and direct execution engines.
 * Agents must never modify these paths, even in full-auto mode.
 *
 * For governance-tier classification of paths, see councils/governance.ts.
 */

import { realpathSync } from 'node:fs';
import {
  type AutomationCheckResult,
  checkAutomationAllowed,
  classifyPath,
  type GovernanceTier,
} from '../councils/governance';
import { analyzeBashCommand } from '../lib/bash-security';

// ─── Governance-annotated protected path entries ──────────────────────────────

export interface ProtectedPathEntry {
  /** The path pattern (basename or substring). */
  path: string;
  /** Governance tier: 0 = Constitutional, 1 = Structural, 2 = Operational. */
  tier: GovernanceTier;
  /** Human-readable reason this path is protected. */
  reason: string;
}

// Paths that agents must never modify, even in full-auto mode.
// Uses basename matching to avoid false positives (e.g. "manager.ts" matching "task-manager.ts").
export const PROTECTED_BASENAME_ENTRIES: readonly ProtectedPathEntry[] = [
  { path: 'sdk-process.ts', tier: 0, reason: 'Session execution engine — Layer 0 constitutional' },
  { path: 'CLAUDE.md', tier: 1, reason: 'Agent system instructions — Layer 1 structural' },
] as const;

// Paths matched by substring (for files/dirs without unique basenames).
export const PROTECTED_SUBSTRING_ENTRIES: readonly ProtectedPathEntry[] = [
  { path: '.env', tier: 0, reason: 'Environment secrets — Layer 0 constitutional' },
  { path: 'corvid-agent.db', tier: 0, reason: 'Database file — Layer 0 constitutional' },
  { path: 'wallet-keystore.json', tier: 0, reason: 'Wallet keys — Layer 0 constitutional' },
  { path: 'server/selftest/', tier: 0, reason: 'Self-test integrity — Layer 0 constitutional' },
] as const;

// Derived sets for backward-compatible matching (used by isProtectedPath and consumers).
export const PROTECTED_BASENAMES = new Set(PROTECTED_BASENAME_ENTRIES.map((e) => e.path));
export const PROTECTED_SUBSTRINGS = PROTECTED_SUBSTRING_ENTRIES.map((e) => e.path);

// Shell operators/commands that indicate write/destructive file operations.
export const BASH_WRITE_OPERATORS =
  /(?:>>?\s|rm\s|mv\s|cp\s|chmod\s|chown\s|sed\s+-i|tee\s|dd\s|ln\s|curl\s.*-o|wget\s|python[3]?\s+-c|node\s+-e|bun\s+-e|ed\s|perl\s+-|rsync\s|install\s|truncate\s|ruby\s+-[ie]|php\s+-r|command\s+-p\s+\w|find\s.*-(?:delete|exec))/;

export function isProtectedPath(filePath: string): boolean {
  // Resolve symlinks to prevent bypass via `ln -s protected.ts link.ts`
  let resolved = filePath;
  try {
    resolved = realpathSync(filePath);
  } catch {
    /* file may not exist yet */
  }

  // Normalize to forward slashes for cross-platform matching
  const normalized = resolved.replace(/\\/g, '/');
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

// ─── Governance tier integration ──────────────────────────────────────────────

export type { AutomationCheckResult, GovernanceTier };
/**
 * Get the governance tier for a file path.
 * Re-exported from councils/governance.ts for consumers that import from protected-paths.
 */
export { classifyPath as getGovernanceTier };

/**
 * Check whether automated workflows may modify a set of file paths.
 * Layer 0 (Constitutional) and Layer 1 (Structural) paths are blocked.
 */
export function isBlockedByGovernance(filePaths: string[]): AutomationCheckResult {
  return checkAutomationAllowed(filePaths);
}
