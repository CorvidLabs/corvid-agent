import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAgent } from '../../db/agents';
import { type ContactPlatform, findContactByPlatformId } from '../../db/contacts';
import { assertRepoAllowed } from '../../github/off-limits';
import * as github from '../../github/operations';
import { checkInternPrGuard } from '../../work/intern-guard';
import {
  checkSchedulerRateLimit,
  isRepoAllowedForScheduler,
  SCHEDULER_ESCALATION_LABEL,
} from '../scheduler-tool-gating';
import type { McpToolContext } from './types';
import { errorResult, textResult } from './types';

export interface HumanCollaborator {
  displayName: string;
  githubUsername?: string;
}

export function resolveCollaborator(
  db: import('bun:sqlite').Database,
  platform: ContactPlatform,
  platformId: string,
): HumanCollaborator | null {
  const contact = findContactByPlatformId(db, '', platform, platformId);
  if (!contact) return null;
  const githubLink = contact.links?.find((l) => l.platform === 'github');
  return { displayName: contact.displayName, githubUsername: githubLink?.platformId };
}

export function formatHumanCoAuthoredBy(collaborator: HumanCollaborator): string {
  if (collaborator.githubUsername) {
    return `Co-Authored-By: ${collaborator.displayName} <${collaborator.githubUsername}@users.noreply.github.com>`;
  }
  return `Co-Authored-By: ${collaborator.displayName}`;
}

/** Map a raw model ID to a human-friendly name for GitHub signatures. */
export function friendlyModelName(model: string): string {
  // claude-opus-4-6 → Opus 4.6
  // claude-sonnet-4-6 → Sonnet 4.6
  // claude-haiku-4-5-20251001 → Haiku 4.5
  // claude-sonnet-4-20250514 → Sonnet 4
  const m = model.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8,})?$/i);
  if (m) {
    const family = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const major = m[2];
    const minor = m[3];
    return minor ? `${family} ${major}.${minor}` : `${family} ${major}`;
  }
  return model;
}

/** Format an agent identity signature footer for GitHub write operations (#1555, #1576). */
export function formatAgentSignature(
  agent: { name: string; model: string } | null | undefined,
  taskId?: string,
  collaborators?: HumanCollaborator[],
): string {
  if (!agent) return '';
  const modelDisplay = friendlyModelName(agent.model);
  const parts = [`Agent: ${agent.name}`, `Model: ${modelDisplay}`];
  if (taskId) parts.push(`Task: ${taskId}`);
  let sig = `\n\n---\n\u{1F916} ${parts.join(' | ')}`;
  if (collaborators?.length) {
    const names = collaborators.map((c) => (c.githubUsername ? `@${c.githubUsername}` : c.displayName));
    sig += `\n\u{1F464} Requested by: ${names.join(', ')}`;
  }
  return sig;
}

/** Format a Co-Authored-By trailer for git commits (#1576). */
export function formatCoAuthoredBy(agent: { name: string; model: string } | null | undefined): string {
  if (!agent) return '';
  const modelDisplay = friendlyModelName(agent.model);
  return `Co-Authored-By: ${agent.name} (${modelDisplay})`;
}

const COMMIT_TYPES = ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'ci', 'build', 'chore'] as const;
type CommitType = (typeof COMMIT_TYPES)[number];

const TYPE_PATTERNS: Record<CommitType, RegExp> = {
  feat: /\b(feat|feature|add|implement|introduce|support|new|create)\b/i,
  fix: /\b(fix|bug|patch|correct|resolve|repair|broken)\b/i,
  docs: /\b(docs?|document|readme|changelog)\b/i,
  test: /\b(test|spec|coverage)\b/i,
  refactor: /\b(refactor|restructure|reorganize|rewrite|cleanup)\b/i,
  perf: /\b(perf|performance|optimize|speed|faster)\b/i,
  ci: /\b(ci|workflow|pipeline|action)\b/i,
  build: /\b(build|bundle|compile|package)\b/i,
  chore: /\b(chore|update|upgrade|bump|lint|format|config|version)\b/i,
};

/** Infer a conventional commit type from branch name and task description (#2274). */
export function inferCommitType(branchName: string, description: string): CommitType {
  // Conventional prefix wins (e.g., "fix/...", "feat/...", "fix-...")
  for (const type of COMMIT_TYPES) {
    if (branchName === type || branchName.startsWith(`${type}/`) || branchName.startsWith(`${type}-`)) {
      return type;
    }
  }
  // Keyword search in branch slug (last path segment)
  const branchSlug = branchName.split('/').pop() ?? branchName;
  for (const type of COMMIT_TYPES) {
    if (TYPE_PATTERNS[type].test(branchSlug)) return type;
  }
  // Keyword search in task description
  for (const type of COMMIT_TYPES) {
    if (TYPE_PATTERNS[type].test(description)) return type;
  }
  return 'chore';
}

/**
 * Format a conventional commit message with optional Co-Authored-By trailers (#2274).
 * Used by the service-level fallback commit in work task PR creation.
 */
export function formatCommitMessage(
  description: string,
  branchName: string,
  agent: { name: string; model: string } | null | undefined,
  collaborators?: HumanCollaborator[],
): string {
  const type = inferCommitType(branchName, description);
  const subject = description.slice(0, 60).trim();
  const headline = `${type}: ${subject}`;
  const trailers: string[] = [];
  if (agent) trailers.push(formatCoAuthoredBy(agent));
  for (const c of collaborators ?? []) trailers.push(formatHumanCoAuthoredBy(c));
  const trailerStr = trailers.filter(Boolean).join('\n');
  return trailerStr ? `${headline}\n\n${trailerStr}` : headline;
}

/** Build an agent identity signature footer by looking up the agent from the DB. */
export function buildAgentSignature(ctx: McpToolContext, collaborators?: HumanCollaborator[]): string {
  try {
    const agent = getAgent(ctx.db, ctx.agentId);
    return formatAgentSignature(agent, undefined, collaborators);
  } catch {
    return '';
  }
}

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

/**
 * Resolve a `requested_by` string into collaborator info.
 * Accepts a GitHub username (with or without @), a Discord ID, or a display name.
 */
export function resolveRequestedBy(ctx: McpToolContext, requestedBy?: string): HumanCollaborator[] | undefined {
  if (!requestedBy) return undefined;
  const names = requestedBy
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  const collaborators: HumanCollaborator[] = [];
  for (const name of names) {
    const cleaned = name.startsWith('@') ? name.slice(1) : name;
    const byGithub = resolveCollaborator(ctx.db, 'github', cleaned);
    if (byGithub) {
      collaborators.push(byGithub);
      continue;
    }
    const byDiscord = resolveCollaborator(ctx.db, 'discord', cleaned);
    if (byDiscord) {
      collaborators.push(byDiscord);
      continue;
    }
    // Numeric-only strings are platform IDs (e.g. Discord snowflakes) — not valid GitHub usernames.
    const githubUsername = /^\d+$/.test(cleaned) ? undefined : cleaned;
    collaborators.push({ displayName: cleaned, githubUsername });
  }
  return collaborators.length > 0 ? collaborators : undefined;
}

export async function handleGitHubStarRepo(_ctx: McpToolContext, args: { repo: string }): Promise<CallToolResult> {
  try {
    const result = await github.starRepo(args.repo);
    return result.ok ? textResult(result.message) : errorResult(result.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to star repo: ${message}`);
  }
}

export async function handleGitHubUnstarRepo(_ctx: McpToolContext, args: { repo: string }): Promise<CallToolResult> {
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

    const lines = result.prs.map(
      (pr) =>
        `#${pr.number} ${pr.title} (by ${pr.author}, +${pr.additions}/-${pr.deletions}, ${pr.changedFiles} files)\n   ${pr.url}`,
    );
    return textResult(`Open PRs in ${args.repo}:\n\n${lines.join('\n\n')}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to list PRs: ${message}`);
  }
}

export async function handleGitHubCreatePr(
  ctx: McpToolContext,
  args: { repo: string; title: string; body: string; head: string; base?: string; requested_by?: string },
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
    const collaborators = resolveRequestedBy(ctx, args.requested_by);
    const bodyWithSig = args.body + buildAgentSignature(ctx, collaborators);
    const result = await github.createPr(args.repo, args.title, bodyWithSig, args.head, args.base ?? 'main');
    if (!result.ok) return errorResult(result.error ?? 'Failed to create PR');
    return textResult(`PR created: ${result.prUrl ?? 'success'}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to create PR: ${message}`);
  }
}

export async function handleGitHubReviewPr(
  ctx: McpToolContext,
  args: { repo: string; pr_number: number; event: string; body: string },
): Promise<CallToolResult> {
  try {
    assertRepoAllowed(args.repo);
    const event = args.event.toUpperCase() as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
      return errorResult(`Invalid review event: ${args.event}. Use APPROVE, REQUEST_CHANGES, or COMMENT.`);
    }
    const bodyWithSig = args.body + buildAgentSignature(ctx);
    const result = await github.addPrReview(args.repo, args.pr_number, event, bodyWithSig);
    if (!result.ok) return errorResult(result.error ?? 'Failed to review PR');
    return textResult(`PR #${args.pr_number} reviewed with ${event}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to review PR: ${message}`);
  }
}

export async function handleGitHubCreateIssue(
  ctx: McpToolContext,
  args: { repo: string; title: string; body: string; labels?: string[]; requested_by?: string },
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
    const collaborators = resolveRequestedBy(ctx, args.requested_by);
    const bodyWithSig = args.body + buildAgentSignature(ctx, collaborators);
    const result = await github.createIssue(args.repo, args.title, bodyWithSig, effectiveLabels);
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
    return textResult(
      `${state.charAt(0).toUpperCase() + state.slice(1)} issues in ${args.repo}:\n\n${lines.join('\n\n')}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Failed to list issues: ${message}`);
  }
}

export async function handleGitHubRepoInfo(_ctx: McpToolContext, args: { repo: string }): Promise<CallToolResult> {
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
    const bodyWithSig = args.body + buildAgentSignature(ctx);
    const result = await github.addPrComment(args.repo, args.pr_number, bodyWithSig);
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
