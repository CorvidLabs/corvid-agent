/**
 * GitHub-related schedule action handlers: star_repo, fork_repo, review_prs, github_suggest.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { updateExecutionStatus } from '../../db/schedules';
import { getAgent } from '../../db/agents';
import { createSession } from '../../db/sessions';
import * as github from '../../github/operations';
import type { HandlerContext } from './types';

export async function execStarRepos(
    ctx: HandlerContext,
    executionId: string,
    action: ScheduleAction,
): Promise<void> {
    if (!action.repos?.length) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No repos specified' });
        return;
    }

    const results: string[] = [];
    for (const repo of action.repos) {
        const r = await github.starRepo(repo);
        results.push(r.message);
    }

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: results.join('\n'),
    });
}

export async function execForkRepos(
    ctx: HandlerContext,
    executionId: string,
    action: ScheduleAction,
): Promise<void> {
    if (!action.repos?.length) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No repos specified' });
        return;
    }

    const results: string[] = [];
    for (const repo of action.repos) {
        const r = await github.forkRepo(repo);
        results.push(r.message);
    }

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: results.join('\n'),
    });
}

export async function execReviewPrs(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
    if (!action.repos?.length) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No repos specified' });
        return;
    }

    const tenantId = ctx.resolveScheduleTenantId(schedule.agentId);
    const agent = getAgent(ctx.db, schedule.agentId, tenantId);
    if (!agent) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Agent not found' });
        return;
    }

    const maxPrs = action.maxPrs ?? 5;
    const results: string[] = [];

    for (const repo of action.repos) {
        const prList = await github.listOpenPrs(repo, maxPrs);
        if (!prList.ok) {
            results.push(`${repo}: Failed to list PRs — ${prList.error}`);
            continue;
        }

        if (prList.prs.length === 0) {
            results.push(`${repo}: No open PRs`);
            continue;
        }

        // Create a session for the agent to review the PRs
        const prSummary = prList.prs.map((pr) =>
            `- #${pr.number}: "${pr.title}" by ${pr.author} (+${pr.additions}/-${pr.deletions}, ${pr.changedFiles} files)`
        ).join('\n');

        const prompt = `You are reviewing open pull requests for ${repo}.\n\n` +
            `## Open PRs\n${prSummary}\n\n` +
            `## Instructions\n` +
            `1. BEFORE reviewing each PR, check if you (corvid-agent) have already left a review comment:\n` +
            `   \`gh pr view <number> --repo ${repo} --json comments --jq '.comments[] | select(.author.login == "corvid-agent") | .createdAt'\`\n` +
            `   If you already commented AND there are no new commits since your last comment, SKIP that PR.\n` +
            `   Only re-review if there are new commits since your last review.\n` +
            `2. For PRs that need review, use \`gh pr diff <number> --repo ${repo}\` to review the changes.\n` +
            `3. Analyze code quality, potential issues, and improvements.\n` +
            `4. Leave ONE concise review comment. Do not leave multiple comments on the same PR.\n` +
            `5. Summarize your review findings at the end.`;

        const projectId = action.projectId ?? agent.defaultProjectId;
        if (!projectId) {
            results.push(`${repo}: No project configured for agent`);
            continue;
        }

        const session = createSession(ctx.db, {
            projectId,
            agentId: schedule.agentId,
            name: `Scheduled PR Review: ${repo}`,
            initialPrompt: prompt,
            source: 'agent',
        }, tenantId);

        updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
        ctx.processManager.startProcess(session, prompt, { schedulerMode: true, schedulerActionType: action.type });
        results.push(`${repo}: Reviewing ${prList.prs.length} PR(s) in session ${session.id}`);
    }

    // Mark completed (the session may still be running)
    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: results.join('\n'),
    });
}

export async function execGithubSuggest(
    ctx: HandlerContext,
    executionId: string,
    schedule: AgentSchedule,
    action: ScheduleAction,
): Promise<void> {
    if (!action.repos?.length) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No repos specified' });
        return;
    }

    const tenantId = ctx.resolveScheduleTenantId(schedule.agentId);
    const agent = getAgent(ctx.db, schedule.agentId, tenantId);
    if (!agent) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'Agent not found' });
        return;
    }

    const projectId = action.projectId ?? agent.defaultProjectId;
    if (!projectId) {
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: 'No project configured for agent' });
        return;
    }

    // Create a session for the agent to analyze repos and suggest improvements
    const repoList = action.repos.join(', ');
    const prompt = `You are analyzing the following repositories for potential improvements: ${repoList}\n\n` +
        `## Instructions\n` +
        `1. For each repo, examine the codebase structure, README, issues, and recent PRs.\n` +
        `2. Identify potential improvements: documentation, code quality, performance, testing, CI/CD.\n` +
        `3. Prioritize suggestions by impact and feasibility.\n` +
        `4. For each suggestion, provide a clear description of the change.\n` +
        (action.autoCreatePr
            ? `5. If you have high-confidence suggestions, create work tasks using corvid_create_work_task.\n`
            : `5. Summarize your findings — do NOT create PRs automatically.\n`) +
        `\nBe thorough but focused. Quality over quantity.`;

    const session = createSession(ctx.db, {
        projectId,
        agentId: schedule.agentId,
        name: `Scheduled Suggestions: ${repoList.slice(0, 50)}`,
        initialPrompt: prompt,
        source: 'agent',
    }, tenantId);

    updateExecutionStatus(ctx.db, executionId, 'running', { sessionId: session.id });
    ctx.processManager.startProcess(session, prompt, { schedulerMode: true, schedulerActionType: action.type });

    updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `Analysis session started: ${session.id}`,
        sessionId: session.id,
    });
}
