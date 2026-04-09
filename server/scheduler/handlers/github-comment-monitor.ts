/**
 * GitHub external comment monitor — checks for new issue and PR comments
 * from users outside the team allowlist and posts a Discord digest.
 *
 * Uses just 2 API calls per check:
 *   GET /repos/{owner}/{repo}/issues/comments?since=<timestamp>
 *   GET /repos/{owner}/{repo}/pulls/comments?since=<timestamp>
 *
 * Stores the last-checked timestamp in the schedule's execution result
 * so each run only fetches what's new.
 */
import type { AgentSchedule, ScheduleAction } from '../../../shared/types';
import { listGitHubAllowlist } from '../../db/github-allowlist';
import { updateExecutionStatus } from '../../db/schedules';
import { createLogger } from '../../lib/logger';
import type { HandlerContext } from './types';

const log = createLogger('GitHubCommentMonitor');

const DEFAULT_REPO = 'CorvidLabs/corvid-agent';
const DISCORD_EMBED_COLOR = 0x5865f2; // blurple
const MAX_EMBED_DESCRIPTION = 4000;

interface GitHubComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  /** Present on issue comments — the issue URL (contains issue number). */
  issue_url?: string;
  /** Present on PR review comments — the PR URL. */
  pull_request_url?: string;
}

/** Fetch comments from a GitHub API endpoint with `since` filtering. */
async function fetchComments(url: string, token: string): Promise<GitHubComment[]> {
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 200)}`);
  }

  return (await response.json()) as GitHubComment[];
}

/** Extract a short reference (e.g. #123) from an issue or PR URL. */
function extractRef(comment: GitHubComment): string {
  const url = comment.issue_url ?? comment.pull_request_url ?? '';
  const match = url.match(/\/(\d+)$/);
  return match ? `#${match[1]}` : '';
}

/** Format a single comment into a digest line. */
function formatComment(comment: GitHubComment, kind: 'issue' | 'pr'): string {
  const user = comment.user?.login ?? 'unknown';
  const ref = extractRef(comment);
  const prefix = kind === 'issue' ? 'Issue' : 'PR';
  const body = comment.body.slice(0, 120).replace(/\n/g, ' ');
  return `**${user}** on ${prefix} ${ref}: ${body}${comment.body.length > 120 ? '...' : ''}\n[View comment](${comment.html_url})`;
}

export async function execGitHubCommentMonitor(
  ctx: HandlerContext,
  executionId: string,
  schedule: AgentSchedule,
  action: ScheduleAction,
): Promise<void> {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    updateExecutionStatus(ctx.db, executionId, 'failed', {
      result: 'GITHUB_TOKEN not configured',
    });
    return;
  }

  const repo = action.repos?.[0] ?? DEFAULT_REPO;
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    updateExecutionStatus(ctx.db, executionId, 'failed', {
      result: `Invalid repo format: ${repo} (expected owner/repo)`,
    });
    return;
  }

  // Build the team username set from the allowlist
  const allowlist = listGitHubAllowlist(ctx.db);
  const teamUsernames = new Set(allowlist.map((e) => e.username.toLowerCase()));

  // Also exclude common bot accounts
  const botSuffixes = ['[bot]'];
  const isTeamOrBot = (login: string): boolean => {
    const lower = login.toLowerCase();
    return teamUsernames.has(lower) || botSuffixes.some((s) => lower.endsWith(s));
  };

  // Determine the `since` timestamp — default to 4 hours ago if no prior run
  const fallbackSince = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const since = action.description ?? fallbackSince;

  const apiBase = `https://api.github.com/repos/${owner}/${repoName}`;
  const sinceParam = `since=${encodeURIComponent(since)}`;

  try {
    // Two API calls — that's it
    const [issueComments, prComments] = await Promise.all([
      fetchComments(`${apiBase}/issues/comments?${sinceParam}&per_page=100&sort=created&direction=asc`, ghToken),
      fetchComments(`${apiBase}/pulls/comments?${sinceParam}&per_page=100&sort=created&direction=asc`, ghToken),
    ]);

    // Filter to external-only comments
    const externalIssueComments = issueComments.filter((c) => c.user && !isTeamOrBot(c.user.login));
    const externalPrComments = prComments.filter((c) => c.user && !isTeamOrBot(c.user.login));
    const totalExternal = externalIssueComments.length + externalPrComments.length;

    // Update the since timestamp for next run — store as the action description
    // so the scheduler can pass it forward. Use the latest comment time or now.
    const allComments = [...issueComments, ...prComments];
    const latestTime =
      allComments.length > 0
        ? allComments.reduce((max, c) => (c.updated_at > max ? c.updated_at : max), allComments[0].updated_at)
        : new Date().toISOString();

    if (totalExternal === 0) {
      updateExecutionStatus(ctx.db, executionId, 'completed', {
        result: `No external comments since ${since}. Checked ${issueComments.length} issue + ${prComments.length} PR comments. Next since: ${latestTime}`,
      });
      log.info('No external comments found', {
        repo,
        since,
        issueComments: issueComments.length,
        prComments: prComments.length,
      });
      return;
    }

    // Build the digest
    const lines: string[] = [];
    for (const c of externalIssueComments) {
      lines.push(formatComment(c, 'issue'));
    }
    for (const c of externalPrComments) {
      lines.push(formatComment(c, 'pr'));
    }

    const description = lines.join('\n\n').slice(0, MAX_EMBED_DESCRIPTION);

    // Post to Discord
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = action.channelId;

    if (botToken && channelId) {
      const embed = {
        title: `${totalExternal} External Comment${totalExternal !== 1 ? 's' : ''} on ${repo}`,
        description,
        color: DISCORD_EMBED_COLOR,
        timestamp: new Date().toISOString(),
        footer: { text: `Since ${new Date(since).toLocaleString()} | Schedule: ${schedule.name}` },
      };

      const discordResp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ embeds: [embed] }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!discordResp.ok) {
        const errText = await discordResp.text().catch(() => '');
        log.warn('Discord notification failed', { status: discordResp.status, error: errText.slice(0, 200) });
      }
    } else {
      log.info('Discord notification skipped — no DISCORD_BOT_TOKEN or channelId configured');
    }

    updateExecutionStatus(ctx.db, executionId, 'completed', {
      result: `Found ${totalExternal} external comment(s) on ${repo}. Next since: ${latestTime}\n\n${lines.join('\n')}`,
    });

    log.info('External comments detected', { repo, count: totalExternal, since });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('GitHub comment monitor failed', { repo, error: message });
    updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
  }
}
