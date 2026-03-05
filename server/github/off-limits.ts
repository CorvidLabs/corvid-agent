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
let cachedOrgWildcards: Set<string> | null = null;

/** Parse the off-limits file and return lowercased owner/repo entries and org wildcards. */
function loadOffLimitsRepos(): { repos: Set<string>; orgWildcards: Set<string> } {
    if (cachedRepos && cachedOrgWildcards) return { repos: cachedRepos, orgWildcards: cachedOrgWildcards };
    try {
        const content = readFileSync(OFF_LIMITS_FILE, 'utf-8');
        const repos = new Set<string>();
        const orgWildcards = new Set<string>();
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const lower = trimmed.toLowerCase();
                if (lower.endsWith('/*')) {
                    orgWildcards.add(lower.slice(0, -2));
                } else {
                    repos.add(lower);
                }
            }
        }
        cachedRepos = repos;
        cachedOrgWildcards = orgWildcards;
        return { repos, orgWildcards };
    } catch {
        cachedRepos = new Set();
        cachedOrgWildcards = new Set();
        return { repos: cachedRepos, orgWildcards: cachedOrgWildcards };
    }
}

/** Returns true if the repo is on the off-limits blocklist (exact or org wildcard match). */
export function isRepoOffLimits(repo: string): boolean {
    const { repos, orgWildcards } = loadOffLimitsRepos();
    const lower = repo.toLowerCase();
    if (repos.has(lower)) return true;
    const owner = lower.split('/')[0];
    return orgWildcards.has(owner);
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
    cachedOrgWildcards = null;
}
