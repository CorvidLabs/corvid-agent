/**
 * PR Verification Tasks — automatically creates work tasks to verify
 * test plan items in PR bodies, then checks them off on success.
 *
 * Flow:
 * 1. Work task completes → PR created → finalizeTask() captures PR URL
 * 2. Parse `- [ ]` test plan items from PR body via GitHub API
 * 3. Create a verification work task for each item
 * 4. On pass: check off the checkbox via `gh pr edit`
 * 5. On fail: silent (no comment, no noise — CI will catch it)
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { createWorkTask, getWorkTask } from '../db/work-tasks';
import { buildSafeGhEnv } from '../lib/env';

const log = createLogger('PRVerification');

/** Matches unchecked markdown checkbox items: `- [ ] Some task here` */
const CHECKBOX_REGEX = /^- \[ \] (.+)$/gm;

/** Extracts owner/repo and PR number from a GitHub PR URL */
const PR_PARTS_REGEX = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;

export interface TestPlanItem {
    /** The raw text of the checkbox item (without the `- [ ] ` prefix) */
    text: string;
    /** 0-based index of this item among all checkboxes in the body */
    index: number;
}

/**
 * Parse unchecked test plan items from a PR body.
 */
export function parseTestPlanItems(prBody: string): TestPlanItem[] {
    const items: TestPlanItem[] = [];
    let match: RegExpExecArray | null;
    let index = 0;

    // Reset regex state
    CHECKBOX_REGEX.lastIndex = 0;
    while ((match = CHECKBOX_REGEX.exec(prBody)) !== null) {
        items.push({ text: match[1].trim(), index });
        index++;
    }

    return items;
}

/**
 * Extract repo (owner/name) and PR number from a PR URL.
 */
export function parsePrUrl(prUrl: string): { repo: string; prNumber: number } | null {
    const match = prUrl.match(PR_PARTS_REGEX);
    if (!match) return null;
    return { repo: match[1], prNumber: parseInt(match[2], 10) };
}

/**
 * Fetch the PR body from GitHub.
 */
export async function fetchPrBody(repo: string, prNumber: number): Promise<string | null> {
    try {
        const proc = Bun.spawn(
            ['gh', 'pr', 'view', String(prNumber), '--repo', repo, '--json', 'body', '--jq', '.body'],
            { stdout: 'pipe', stderr: 'pipe', env: buildSafeGhEnv() },
        );
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            log.warn('Failed to fetch PR body', { repo, prNumber });
            return null;
        }
        return stdout.trim();
    } catch (err) {
        log.warn('Error fetching PR body', {
            repo,
            prNumber,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Check off a specific checkbox item in the PR body.
 * Replaces `- [ ] {text}` with `- [x] {text}`.
 */
export async function checkOffPrItem(repo: string, prNumber: number, itemText: string): Promise<boolean> {
    try {
        // Fetch current body
        const body = await fetchPrBody(repo, prNumber);
        if (!body) return false;

        const unchecked = `- [ ] ${itemText}`;
        const checked = `- [x] ${itemText}`;

        if (!body.includes(unchecked)) {
            log.warn('Checkbox item not found in PR body', { repo, prNumber, itemText });
            return false;
        }

        // Replace only the first occurrence of this exact checkbox
        const updatedBody = body.replace(unchecked, checked);

        const proc = Bun.spawn(
            ['gh', 'pr', 'edit', String(prNumber), '--repo', repo, '--body', updatedBody],
            { stdout: 'pipe', stderr: 'pipe', env: buildSafeGhEnv() },
        );
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            log.warn('Failed to check off PR item', { repo, prNumber, itemText, stderr: stderr.trim() });
            return false;
        }

        log.info('Checked off PR item', { repo, prNumber, itemText });
        return true;
    } catch (err) {
        log.warn('Error checking off PR item', {
            repo,
            prNumber,
            itemText,
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/**
 * Build the prompt for a verification work task.
 * The agent will check out the PR branch and verify the specific item.
 */
export function buildVerificationPrompt(
    prUrl: string,
    prNumber: number,
    branchName: string,
    itemText: string,
): string {
    return `You are verifying a test plan item for PR #${prNumber} (${prUrl}).

## Verification Task
${itemText}

## Instructions
1. Check out the PR branch: \`git fetch origin ${branchName} && git checkout ${branchName}\`
2. Verify the test plan item described above.
   - For UI/rendering checks: inspect the relevant files, ensure markup/styling is correct.
   - For functionality checks: run relevant tests, check endpoints, verify behavior.
   - For build checks: run \`bun x tsc --noEmit --skipLibCheck\` and/or \`bun test\`.
3. If the verification **passes**: output exactly \`VERIFICATION_PASSED\` as the final line.
4. If the verification **fails**: output exactly \`VERIFICATION_FAILED\` as the final line, with a brief explanation above it.

Important: Do NOT create a PR. Do NOT commit changes. This is a read-only verification task.
Output VERIFICATION_PASSED or VERIFICATION_FAILED as the very last line of your response.`;
}

export interface VerificationResult {
    itemText: string;
    taskId: string;
}

/**
 * Create verification work tasks for all unchecked test plan items in a PR.
 * Called from finalizeTask() after a PR is created.
 *
 * Returns the list of created verification tasks, or empty array if none needed.
 */
export async function createVerificationTasks(
    db: Database,
    parentTaskId: string,
    prUrl: string,
): Promise<VerificationResult[]> {
    const parsed = parsePrUrl(prUrl);
    if (!parsed) {
        log.warn('Could not parse PR URL for verification', { prUrl });
        return [];
    }

    const { repo, prNumber } = parsed;

    // Fetch the PR body to parse test plan items
    const body = await fetchPrBody(repo, prNumber);
    if (!body) {
        log.info('No PR body found, skipping verification', { prUrl });
        return [];
    }

    const items = parseTestPlanItems(body);
    if (items.length === 0) {
        log.info('No test plan items found in PR body', { prUrl });
        return [];
    }

    // Get parent task to inherit agent/project
    const parentTask = getWorkTask(db, parentTaskId);
    if (!parentTask) {
        log.warn('Parent task not found for verification', { parentTaskId });
        return [];
    }

    const results: VerificationResult[] = [];

    for (const item of items) {
        const description = `[Verify PR #${prNumber}] ${item.text}`;
        const task = createWorkTask(db, {
            agentId: parentTask.agentId,
            projectId: parentTask.projectId,
            description,
            source: 'agent',
            sourceId: `verify:${parentTaskId}:${prNumber}:${item.index}`,
        });

        log.info('Created verification task', {
            taskId: task.id,
            parentTaskId,
            prNumber,
            item: item.text,
        });

        results.push({ itemText: item.text, taskId: task.id });
    }

    log.info('Created verification tasks for PR', {
        prUrl,
        count: results.length,
        parentTaskId,
    });

    return results;
}

/**
 * Check if a completed verification task passed, and if so, check off the PR item.
 * Called when a verification work task completes.
 *
 * Returns true if the item was successfully checked off.
 */
export async function handleVerificationComplete(
    db: Database,
    taskId: string,
    sessionOutput: string,
): Promise<boolean> {
    const task = getWorkTask(db, taskId);
    if (!task?.sourceId?.startsWith('verify:')) return false;

    // Parse sourceId: verify:{parentTaskId}:{prNumber}:{itemIndex}
    const parts = task.sourceId.split(':');
    if (parts.length < 4) return false;

    const parentTaskId = parts[1];
    const prNumber = parseInt(parts[2], 10);

    // Check if verification passed
    const passed = sessionOutput.trimEnd().endsWith('VERIFICATION_PASSED');
    if (!passed) {
        log.info('Verification task did not pass, skipping checkbox', { taskId, prNumber });
        return false;
    }

    // Get parent task to find PR URL
    const parentTask = getWorkTask(db, parentTaskId);
    if (!parentTask?.prUrl) {
        log.warn('Parent task or PR URL not found', { taskId, parentTaskId });
        return false;
    }

    const parsed = parsePrUrl(parentTask.prUrl);
    if (!parsed) return false;

    // Extract the item text from the task description
    const itemText = task.description.replace(`[Verify PR #${prNumber}] `, '');

    return checkOffPrItem(parsed.repo, prNumber, itemText);
}

/**
 * Check if a work task is a verification task (by sourceId pattern).
 */
export function isVerificationTask(sourceId: string | null): boolean {
    return sourceId?.startsWith('verify:') ?? false;
}
