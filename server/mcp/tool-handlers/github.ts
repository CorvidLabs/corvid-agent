import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolContext } from './types';
import { textResult, errorResult } from './types';
import * as github from '../../github/operations';
import { assertRepoAllowed } from '../../github/off-limits';
import { isRepoAllowedForScheduler, checkSchedulerRateLimit, SCHEDULER_ESCALATION_LABEL } from '../scheduler-tool-gating';
import { getAgent } from '../../db/agents';
import { checkInternPrGuard } from '../../work/intern-guard';

/** Enforce scheduler org restriction + rate limit for a gated tool. Returns error result or null. */
function enforceSchedulerGuards(ctx: McpToolContext, toolName: string, repo: string): CallToolResult | null {
    if (!ctx.schedulerMode) return null;
    if (!isRepoAllowedForScheduler(repo)) {
        return errorResult(`Scheduler sessions can only target allowed orgs. Repo "${repo}" is not permitted.`);
    }
    if (ctx.schedulerToolUsage) {
        const err = checkSchedulerRateLimit(toolName, ctx.schedulerToolUsage);
        if (err) return errorResult(err);
    }
    return null;
}


export async function handleGitHubStarRepo(
    _ctx: McpToolContext,
    args: { repo: string },
): Promise<CallToolResult> {
    try {
        const result = await github.starRepo(args.repo);
        return result.ok ? textResult(result.message) : errorResult(result.message);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to star repo: ${message}`);
    }
}

export async function handleGitHubUnstarRepo(
    _ctx: McpToolContext,
    args: { repo: string },
): Promise<CallToolResult> {
    try {
        const result = await github.unstarRepo(args.repo);
        return result.ok ? textResult(result.message) : errorResult(result.message);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to unstar repo: ${message}`);
    }
}

export async function handleGitHubForkRepo(
    _ctx: McpToolContext,
    args: { repo: string; org?: string },
): Promise<CallToolResult> {
    try {
        assertRepoAllowed(args.repo);
        const result = await github.forkRepo(args.repo, args.org);
        if (!result.ok) return errorResult(result.message);
        const extra = result.forkUrl ? ` (${result.forkUrl})` : '';
        return textResult(`${result.message}${extra}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to fork repo: ${message}`);
    }
}

export async function handleGitHubListPrs(
    _ctx: McpToolContext,
    args: { repo: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const result = await github.listOpenPrs(args.repo, args.limit ?? 10);
        if (!result.ok) return errorResult(result.error ?? 'Failed to list PRs');
        if (result.prs.length === 0) return textResult(`No open PRs in ${args.repo}.`);

        const lines = result.prs.map((pr) =>
            `#${pr.number} ${pr.title} (by ${pr.author}, +${pr.additions}/-${pr.deletions}, ${pr.changedFiles} files)\n   ${pr.url}`
        );
        return textResult(`Open PRs in ${args.repo}:\n\n${lines.join('\n\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list PRs: ${message}`);
    }
}

export async function handleGitHubCreatePr(
    ctx: McpToolContext,
    args: { repo: string; title: string; body: string; head: string; base?: string },
): Promise<CallToolResult> {
    try {
        assertRepoAllowed(args.repo);
        const guard = enforceSchedulerGuards(ctx, 'corvid_github_create_pr', args.repo);
        if (guard) return guard;
        // Intern model guard — block PR creation for low-capability models (#1542)
        try {
            const agent = getAgent(ctx.db, ctx.agentId);
            if (agent) {
                const internGuard = checkInternPrGuard(agent.model, ctx.sessionId);
                if (internGuard.blocked) {
                    return errorResult(internGuard.reason ?? 'Intern-tier models cannot create PRs (issue #1542).');
                }
            }
        } catch {
            // Fail open: if the agent lookup fails, allow the operation to proceed.
        }
        const result = await github.createPr(args.repo, args.title, args.body, args.head, args.base ?? 'main');
        if (!result.ok) return errorResult(result.error ?? 'Failed to create PR');
        return textResult(`PR created: ${result.prUrl ?? 'success'}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to create PR: ${message}`);
    }
}

export async function handleGitHubReviewPr(
    _ctx: McpToolContext,
    args: { repo: string; pr_number: number; event: string; body: string },
): Promise<CallToolResult> {
    try {
        assertRepoAllowed(args.repo);
        const event = args.event.toUpperCase() as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
            return errorResult(`Invalid review event: ${args.event}. Use APPROVE, REQUEST_CHANGES, or COMMENT.`);
        }
        const result = await github.addPrReview(args.repo, args.pr_number, event, args.body);
        if (!result.ok) return errorResult(result.error ?? 'Failed to review PR');
        return textResult(`PR #${args.pr_number} reviewed with ${event}.`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to review PR: ${message}`);
    }
}

export async function handleGitHubCreateIssue(
    ctx: McpToolContext,
    args: { repo: string; title: string; body: string; labels?: string[] },
): Promise<CallToolResult> {
    try {
        assertRepoAllowed(args.repo);
        const guard = enforceSchedulerGuards(ctx, 'corvid_github_create_issue', args.repo);
        if (guard) return guard;
        // Auto-label issues created by scheduler sessions
        let effectiveLabels = args.labels;
        if (ctx.schedulerMode) {
            effectiveLabels = effectiveLabels ? [...effectiveLabels] : [];
            if (!effectiveLabels.includes(SCHEDULER_ESCALATION_LABEL)) {
                effectiveLabels.push(SCHEDULER_ESCALATION_LABEL);
            }
        }
        const result = await github.createIssue(args.repo, args.title, args.body, effectiveLabels);
        if (!result.ok) return errorResult(result.error ?? 'Failed to create issue');
        return textResult(`Issue created: ${result.issueUrl ?? 'success'}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to create issue: ${message}`);
    }
}

export async function handleGitHubListIssues(
    _ctx: McpToolContext,
    args: { repo: string; state?: string; limit?: number },
): Promise<CallToolResult> {
    try {
        const state = (args.state ?? 'open') as 'open' | 'closed' | 'all';
        const result = await github.listIssues(args.repo, state, args.limit ?? 30);
        if (!result.ok) return errorResult(result.error ?? 'Failed to list issues');
        if (result.issues.length === 0) return textResult(`No ${state} issues in ${args.repo}.`);

        const lines = result.issues.map((issue) => {
            const labels = issue.labels.length > 0 ? ` [${issue.labels.map((l) => l.name).join(', ')}]` : '';
            return `#${issue.number} ${issue.title}${labels}\n   ${issue.url}`;
        });
        return textResult(`${state.charAt(0).toUpperCase() + state.slice(1)} issues in ${args.repo}:\n\n${lines.join('\n\n')}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list issues: ${message}`);
    }
}

export async function handleGitHubRepoInfo(
    _ctx: McpToolContext,
    args: { repo: string },
): Promise<CallToolResult> {
    try {
        const result = await github.getRepoInfo(args.repo);
        if (!result.ok) return errorResult(result.error ?? 'Failed to get repo info');
        return textResult(JSON.stringify(result.info, null, 2));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get repo info: ${message}`);
    }
}

export async function handleGitHubGetPrDiff(
    _ctx: McpToolContext,
    args: { repo: string; pr_number: number },
): Promise<CallToolResult> {
    try {
        const result = await github.getPrDiff(args.repo, args.pr_number);
        if (!result.ok) return errorResult(result.error ?? 'Failed to get PR diff');
        if (!result.diff) return textResult(`PR #${args.pr_number} has no diff (empty).`);
        return textResult(result.diff);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get PR diff: ${message}`);
    }
}

export async function handleGitHubCommentOnPr(
    ctx: McpToolContext,
    args: { repo: string; pr_number: number; body: string },
): Promise<CallToolResult> {
    try {
        assertRepoAllowed(args.repo);
        const guard = enforceSchedulerGuards(ctx, 'corvid_github_comment_on_pr', args.repo);
        if (guard) return guard;
        const result = await github.addPrComment(args.repo, args.pr_number, args.body);
        if (!result.ok) return errorResult(result.error ?? 'Failed to comment on PR');
        return textResult(`Comment added to PR #${args.pr_number} in ${args.repo}.`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to comment on PR: ${message}`);
    }
}

export async function handleGitHubFollowUser(
    _ctx: McpToolContext,
    args: { username: string },
): Promise<CallToolResult> {
    try {
        const result = await github.followUser(args.username);
        return result.ok ? textResult(result.message) : errorResult(result.message);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to follow user: ${message}`);
    }
}
