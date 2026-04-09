/**
 * off-limits.ts — Enforces the repo blocklist from .claude/off-limits-repos.txt
 *
 * Loaded once at startup, cached in memory. Write operations (PR, issue,
 * comment, fork) must call assertRepoAllowed() before proceeding.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OFF_LIMITS_FILE = resolve(import.meta.dir, '../../.claude/off-limits-repos.txt');

interface OffLimitsEntries {
  exact: Set<string>;
  orgWildcards: Set<string>;
}

let cached: OffLimitsEntries | null = null;

/** Parse the off-limits file, separating exact repos from org/* wildcards. */
function loadOffLimitsRepos(): OffLimitsEntries {
  if (cached) return cached;
  try {
    const content = readFileSync(OFF_LIMITS_FILE, 'utf-8');
    const exact = new Set<string>();
    const orgWildcards = new Set<string>();
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const lower = trimmed.toLowerCase();
        if (lower.endsWith('/*')) {
          orgWildcards.add(lower.slice(0, -2));
        } else {
          exact.add(lower);
        }
      }
    }
    cached = { exact, orgWildcards };
    return cached;
  } catch {
    cached = { exact: new Set(), orgWildcards: new Set() };
    return cached;
  }
}

/** Returns true if the repo is on the off-limits blocklist. */
export function isRepoOffLimits(repo: string): boolean {
  const { exact, orgWildcards } = loadOffLimitsRepos();
  const lower = repo.toLowerCase();
  if (exact.has(lower)) return true;
  const org = lower.split('/')[0];
  return orgWildcards.has(org);
}

/**
 * Throws if the repo is off-limits. Call before any write operation
 * (create PR, create issue, comment, fork, push).
 */
export function assertRepoAllowed(repo: string): void {
  if (isRepoOffLimits(repo)) {
    throw new Error(
      `Repository ${repo} is off-limits — contributions are not allowed. See .claude/off-limits-repos.txt`,
    );
  }
}

/** Reset the cache (for testing). */
export function _resetCache(): void {
  cached = null;
}
