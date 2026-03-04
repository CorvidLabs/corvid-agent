/**
 * off-limits.ts — Enforces the repo blocklist from .claude/off-limits-repos.txt
 *
 * Loaded once at startup, cached in memory. Write operations (PR, issue,
 * comment, fork) must call assertRepoAllowed() before proceeding.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OFF_LIMITS_FILE = resolve(import.meta.dir, '../../.claude/off-limits-repos.txt');

let cachedRepos: Set<string> | null = null;

/** Parse the off-limits file and return lowercased owner/repo entries. */
function loadOffLimitsRepos(): Set<string> {
    if (cachedRepos) return cachedRepos;
    try {
        const content = readFileSync(OFF_LIMITS_FILE, 'utf-8');
        const repos = new Set<string>();
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                repos.add(trimmed.toLowerCase());
            }
        }
        cachedRepos = repos;
        return repos;
    } catch {
        cachedRepos = new Set();
        return cachedRepos;
    }
}

/** Returns true if the repo is on the off-limits blocklist. */
export function isRepoOffLimits(repo: string): boolean {
    const repos = loadOffLimitsRepos();
    return repos.has(repo.toLowerCase());
}

/**
 * Throws if the repo is off-limits. Call before any write operation
 * (create PR, create issue, comment, fork, push).
 */
export function assertRepoAllowed(repo: string): void {
    if (isRepoOffLimits(repo)) {
        throw new Error(`Repository ${repo} is off-limits — contributions are not allowed. See .claude/off-limits-repos.txt`);
    }
}

/** Reset the cache (for testing). */
export function _resetCache(): void {
    cachedRepos = null;
}
