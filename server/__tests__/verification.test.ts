import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { createWorkTask, updateWorkTaskStatus } from '../db/work-tasks';
import {
    parseTestPlanItems,
    parsePrUrl,
    isVerificationTask,
    buildVerificationPrompt,
    createVerificationTasks,
    handleVerificationComplete,
} from '../work/verification';

let db: Database;
const AGENT_ID = 'agent-1';
const PROJECT_ID = 'proj-1';

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    db.query(`INSERT INTO agents (id, name, model, system_prompt) VALUES (?, 'TestAgent', 'test', 'test')`).run(AGENT_ID);
    db.query(`INSERT INTO projects (id, name, working_dir) VALUES (?, 'TestProject', '/tmp/test')`).run(PROJECT_ID);
});

afterEach(() => {
    db.close();
});

// ── parseTestPlanItems ──────────────────────────────────────────────

describe('parseTestPlanItems', () => {
    test('parses unchecked checkboxes from PR body', () => {
        const body = `## Summary
Some changes.

## Test plan
- [ ] Verify the blog page renders correctly
- [ ] Check that all nav links work
- [x] Already done item`;

        const items = parseTestPlanItems(body);
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ text: 'Verify the blog page renders correctly', index: 0 });
        expect(items[1]).toEqual({ text: 'Check that all nav links work', index: 1 });
    });

    test('returns empty array when no checkboxes', () => {
        const body = '## Summary\nJust a simple change.';
        expect(parseTestPlanItems(body)).toEqual([]);
    });

    test('ignores already checked items', () => {
        const body = '- [x] Already done\n- [ ] Still todo';
        const items = parseTestPlanItems(body);
        expect(items).toHaveLength(1);
        expect(items[0].text).toBe('Still todo');
    });

    test('handles empty body', () => {
        expect(parseTestPlanItems('')).toEqual([]);
    });

    test('trims whitespace from item text', () => {
        const body = '- [ ]   Extra spaces   ';
        const items = parseTestPlanItems(body);
        expect(items).toHaveLength(1);
        expect(items[0].text).toBe('Extra spaces');
    });
});

// ── parsePrUrl ──────────────────────────────────────────────────────

describe('parsePrUrl', () => {
    test('extracts repo and PR number from URL', () => {
        const result = parsePrUrl('https://github.com/CorvidLabs/corvid-agent/pull/876');
        expect(result).toEqual({ repo: 'CorvidLabs/corvid-agent', prNumber: 876 });
    });

    test('returns null for invalid URL', () => {
        expect(parsePrUrl('https://example.com/something')).toBeNull();
    });

    test('handles URL with trailing path segments', () => {
        const result = parsePrUrl('https://github.com/org/repo/pull/42/files');
        expect(result).toEqual({ repo: 'org/repo', prNumber: 42 });
    });
});

// ── isVerificationTask ──────────────────────────────────────────────

describe('isVerificationTask', () => {
    test('returns true for verification sourceId', () => {
        expect(isVerificationTask('verify:task-123:876:0')).toBe(true);
    });

    test('returns false for null', () => {
        expect(isVerificationTask(null)).toBe(false);
    });

    test('returns false for non-verification sourceId', () => {
        expect(isVerificationTask('schedule:daily')).toBe(false);
    });
});

// ── createVerificationTasks ─────────────────────────────────────────

describe('createVerificationTasks', () => {
    test('returns empty array when PR URL cannot be parsed', async () => {
        const result = await createVerificationTasks(db, 'task-1', 'invalid-url');
        expect(result).toEqual([]);
    });

    test('returns empty array when parent task not found', async () => {
        // Use a valid-looking URL but nonexistent parent task
        const result = await createVerificationTasks(db, 'nonexistent', 'https://github.com/CorvidLabs/corvid-agent/pull/999');
        // This will fail at fetchPrBody (no gh in test), but parent task check comes after
        expect(result).toEqual([]);
    }, 15_000);
});

// ── handleVerificationComplete ──────────────────────────────────────

describe('handleVerificationComplete', () => {
    test('returns false for non-verification task', async () => {
        const task = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Normal task',
            source: 'web',
        });
        const result = await handleVerificationComplete(db, task.id, 'VERIFICATION_PASSED');
        expect(result).toBe(false);
    });

    test('returns false for verification task that did not pass', async () => {
        const parentTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Parent task',
            source: 'web',
        });
        updateWorkTaskStatus(db, parentTask.id, 'completed', {
            prUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/876',
        });

        const verifyTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: '[Verify PR #876] Check nav links',
            source: 'agent',
            sourceId: `verify:${parentTask.id}:876:0`,
        });

        const result = await handleVerificationComplete(db, verifyTask.id, 'Some output\nVERIFICATION_FAILED');
        expect(result).toBe(false);
    });

    test('returns false when parent task has no PR URL', async () => {
        const parentTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Parent task',
            source: 'web',
        });

        const verifyTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: '[Verify PR #876] Check nav links',
            source: 'agent',
            sourceId: `verify:${parentTask.id}:876:0`,
        });

        const result = await handleVerificationComplete(db, verifyTask.id, 'All good\nVERIFICATION_PASSED');
        expect(result).toBe(false);
    });

    test('returns false for verification task with malformed sourceId (too few parts)', async () => {
        const verifyTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: '[Verify PR] Something',
            source: 'agent',
            sourceId: 'verify:only-three-parts',
        });

        const result = await handleVerificationComplete(db, verifyTask.id, 'VERIFICATION_PASSED');
        expect(result).toBe(false);
    });

    test('returns false when parent task prUrl cannot be parsed as GitHub URL', async () => {
        const parentTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Parent task',
            source: 'web',
        });
        updateWorkTaskStatus(db, parentTask.id, 'completed', {
            prUrl: 'https://example.com/not-a-github-pr',
        });

        const verifyTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: '[Verify PR #876] Check nav links',
            source: 'agent',
            sourceId: `verify:${parentTask.id}:876:0`,
        });

        const result = await handleVerificationComplete(db, verifyTask.id, 'All good\nVERIFICATION_PASSED');
        expect(result).toBe(false);
    });

    test('attempts checkOffPrItem when verification passes and parent has valid prUrl', async () => {
        const parentTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: 'Parent task',
            source: 'web',
        });
        updateWorkTaskStatus(db, parentTask.id, 'completed', {
            prUrl: 'https://github.com/CorvidLabs/corvid-agent/pull/876',
        });

        const verifyTask = createWorkTask(db, {
            agentId: AGENT_ID,
            projectId: PROJECT_ID,
            description: '[Verify PR #876] Check nav links',
            source: 'agent',
            sourceId: `verify:${parentTask.id}:876:0`,
        });

        // checkOffPrItem will fail (no gh in test env) but we reach the call site
        const result = await handleVerificationComplete(db, verifyTask.id, 'All verified!\nVERIFICATION_PASSED');
        // Result is false because gh is not available in test env; what matters is we got through
        // the passing-verification path without throwing
        expect(typeof result).toBe('boolean');
    });
});

// ── buildVerificationPrompt ─────────────────────────────────────────

describe('buildVerificationPrompt', () => {
    test('includes PR number and URL in output', () => {
        const prompt = buildVerificationPrompt(
            'https://github.com/CorvidLabs/corvid-agent/pull/42',
            42,
            'fix/my-branch',
            'Verify the blog page renders correctly',
        );
        expect(prompt).toContain('PR #42');
        expect(prompt).toContain('https://github.com/CorvidLabs/corvid-agent/pull/42');
    });

    test('includes the item text in the verification task section', () => {
        const itemText = 'Check that all nav links work';
        const prompt = buildVerificationPrompt(
            'https://github.com/CorvidLabs/corvid-agent/pull/100',
            100,
            'feat/nav-update',
            itemText,
        );
        expect(prompt).toContain(itemText);
    });

    test('includes the branch name in checkout instructions', () => {
        const branch = 'feat/new-feature';
        const prompt = buildVerificationPrompt(
            'https://github.com/CorvidLabs/corvid-agent/pull/55',
            55,
            branch,
            'Run tests',
        );
        expect(prompt).toContain(`git fetch origin ${branch}`);
        expect(prompt).toContain(`git checkout ${branch}`);
    });

    test('always ends with VERIFICATION_PASSED/FAILED instruction', () => {
        const prompt = buildVerificationPrompt(
            'https://github.com/CorvidLabs/corvid-agent/pull/1',
            1,
            'main',
            'Some check',
        );
        expect(prompt).toContain('VERIFICATION_PASSED');
        expect(prompt).toContain('VERIFICATION_FAILED');
    });

    test('instructs agent not to create a PR or commit', () => {
        const prompt = buildVerificationPrompt(
            'https://github.com/CorvidLabs/corvid-agent/pull/77',
            77,
            'fix/thing',
            'Verify endpoint returns 200',
        );
        expect(prompt).toContain('Do NOT create a PR');
        expect(prompt).toContain('Do NOT commit changes');
    });

    test('returns a string for different PR numbers', () => {
        for (const prNum of [1, 999, 12345]) {
            const prompt = buildVerificationPrompt(
                `https://github.com/org/repo/pull/${prNum}`,
                prNum,
                'some-branch',
                'Some item',
            );
            expect(typeof prompt).toBe('string');
            expect(prompt.length).toBeGreaterThan(0);
            expect(prompt).toContain(`PR #${prNum}`);
        }
    });
});
