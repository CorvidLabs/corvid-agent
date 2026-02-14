/**
 * Tool definitions for the direct execution engine.
 *
 * The SDK tools in sdk-tools.ts produce SDK-specific objects via the `tool()` helper.
 * Direct mode needs plain JSON Schema definitions with handler functions that wrap
 * the same handlers from tool-handlers.ts.
 */

import type { McpToolContext } from './tool-handlers';
import {
    handleSendMessage,
    handleSaveMemory,
    handleRecallMemory,
    handleListAgents,
    handleExtendTimeout,
    handleCheckCredits,
    handleGrantCredits,
    handleCreditConfig,
    handleCreateWorkTask,
    handleManageSchedule,
    handleWebSearch,
    handleDeepResearch,
    handleGitHubStarRepo,
    handleGitHubForkRepo,
    handleGitHubListPrs,
    handleGitHubCreatePr,
    handleGitHubReviewPr,
    handleGitHubCreateIssue,
    handleGitHubListIssues,
    handleGitHubRepoInfo,
    handleGitHubUnstarRepo,
    handleGitHubGetPrDiff,
    handleGitHubCommentOnPr,
    handleGitHubFollowUser,
} from './tool-handlers';
import { buildCodingTools, type CodingToolContext } from './coding-tools';
import { getAgent } from '../db/agents';
import type { LlmToolDefinition } from '../providers/types';

export interface DirectToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
    handler: (args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;
}

/** Tools available to all agents by default (when mcp_tool_permissions is NULL). */
const DEFAULT_ALLOWED_TOOLS = new Set([
    'corvid_send_message',
    'corvid_save_memory',
    'corvid_recall_memory',
    'corvid_list_agents',
    'corvid_extend_timeout',
    'corvid_check_credits',
    'corvid_create_work_task',
    'corvid_manage_schedule',
    'corvid_web_search',
    'corvid_deep_research',
    'corvid_github_star_repo',
    'corvid_github_fork_repo',
    'corvid_github_list_prs',
    'corvid_github_create_pr',
    'corvid_github_review_pr',
    'corvid_github_create_issue',
    'corvid_github_list_issues',
    'corvid_github_repo_info',
    'corvid_github_unstar_repo',
    'corvid_github_get_pr_diff',
    'corvid_github_comment_on_pr',
    'corvid_github_follow_user',
    'read_file',
    'write_file',
    'edit_file',
    'run_command',
    'list_files',
    'search_files',
]);

/** Tools blocked during scheduler-initiated sessions. */
const SCHEDULER_BLOCKED_TOOLS = new Set([
    'corvid_send_message',
    'corvid_grant_credits',
    'corvid_credit_config',
    'corvid_github_fork_repo',
    'corvid_github_create_pr',
    'corvid_github_create_issue',
    'corvid_github_comment_on_pr',
]);

/** Validate that required fields exist and are non-empty strings/numbers in the args object. */
function validateRequired(
    toolName: string,
    args: Record<string, unknown>,
    fields: string[],
): { text: string; isError: true } | null {
    const missing: string[] = [];
    for (const field of fields) {
        const val = args[field];
        if (val === undefined || val === null || val === '') {
            missing.push(field);
        }
    }
    if (missing.length > 0) {
        return {
            text: `Missing required argument(s) for ${toolName}: ${missing.join(', ')}`,
            isError: true,
        };
    }
    return null;
}

/** Convert a CallToolResult to our simple { text, isError } format. */
function unwrapResult(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }): { text: string; isError?: boolean } {
    const text = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('');
    return { text, isError: result.isError };
}

export function buildDirectTools(ctx: McpToolContext | null, codingCtx?: CodingToolContext): DirectToolDefinition[] {
    const tools: DirectToolDefinition[] = [];

    // MCP-based tools require a valid McpToolContext
    if (ctx) {
    tools.push(
        {
            name: 'corvid_send_message',
            description: 'Send a message to another agent and wait for their response. Use corvid_list_agents first to discover available agents.',
            parameters: {
                type: 'object',
                properties: {
                    to_agent: { type: 'string', description: 'Agent name or ID to message' },
                    message: { type: 'string', description: 'The message to send' },
                    thread: { type: 'string', description: 'Thread ID to continue a conversation. Omit to start new.' },
                },
                required: ['to_agent', 'message'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_send_message', args, ['to_agent', 'message']);
                if (err) return err;
                return unwrapResult(await handleSendMessage(ctx, args as { to_agent: string; message: string; thread?: string }));
            },
        },
        {
            name: 'corvid_save_memory',
            description: 'Save an encrypted memory by sending a message to yourself on Algorand. Cached locally for fast recall.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'A short descriptive key for this memory' },
                    content: { type: 'string', description: 'The content to remember' },
                },
                required: ['key', 'content'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_save_memory', args, ['key', 'content']);
                if (err) return err;
                return unwrapResult(await handleSaveMemory(ctx, args as { key: string; content: string }));
            },
        },
        {
            name: 'corvid_recall_memory',
            description: 'Recall on-chain memories. Includes blockchain status. Key for exact lookup, query for search, or neither to list recent.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Exact key to look up' },
                    query: { type: 'string', description: 'Search term to find across keys and content' },
                },
            },
            handler: async (args) => unwrapResult(await handleRecallMemory(ctx, args as { key?: string; query?: string })),
        },
        {
            name: 'corvid_list_agents',
            description: 'List all available agents you can communicate with.',
            parameters: { type: 'object', properties: {} },
            handler: async () => unwrapResult(await handleListAgents(ctx)),
        },
        {
            name: 'corvid_extend_timeout',
            description: 'Request more time for your current session. Maximum extension is 120 minutes.',
            parameters: {
                type: 'object',
                properties: {
                    minutes: { type: 'number', description: 'Number of additional minutes to request (1-120)' },
                },
                required: ['minutes'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_extend_timeout', args, ['minutes']);
                if (err) return err;
                return unwrapResult(await handleExtendTimeout(ctx, args as { minutes: number }));
            },
        },
        {
            name: 'corvid_check_credits',
            description: 'Check the credit balance for a wallet address.',
            parameters: {
                type: 'object',
                properties: {
                    wallet_address: { type: 'string', description: 'Wallet address to check. Omit to see your own.' },
                },
            },
            handler: async (args) => unwrapResult(await handleCheckCredits(ctx, args as { wallet_address?: string })),
        },
        {
            name: 'corvid_grant_credits',
            description: 'Grant free credits to a wallet address. Maximum 1,000,000 per grant.',
            parameters: {
                type: 'object',
                properties: {
                    wallet_address: { type: 'string', description: 'Wallet address to grant credits to' },
                    amount: { type: 'number', description: 'Number of credits to grant' },
                    reason: { type: 'string', description: 'Reason for the grant' },
                },
                required: ['wallet_address', 'amount'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_grant_credits', args, ['wallet_address', 'amount']);
                if (err) return err;
                return unwrapResult(await handleGrantCredits(ctx, args as { wallet_address: string; amount: number; reason?: string }));
            },
        },
        {
            name: 'corvid_credit_config',
            description: 'View or update credit system configuration.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'Config key to update' },
                    value: { type: 'string', description: 'New value for the config key' },
                },
            },
            handler: async (args) => unwrapResult(await handleCreditConfig(ctx, args as { key?: string; value?: string })),
        },
    );

    // Conditionally add work task tool
    if (ctx.workTaskService) {
        tools.push({
            name: 'corvid_create_work_task',
            description: 'Create a work task that spawns a new agent session on a dedicated branch.',
            parameters: {
                type: 'object',
                properties: {
                    description: { type: 'string', description: 'A clear description of the work to be done' },
                    project_id: { type: 'string', description: 'Project ID to work on. Omit to use agent default.' },
                },
                required: ['description'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_create_work_task', args, ['description']);
                if (err) return err;
                return unwrapResult(await handleCreateWorkTask(ctx, args as { description: string; project_id?: string }));
            },
        });
    }

    tools.push({
        name: 'corvid_manage_schedule',
        description: 'Manage automated schedules for this agent. Use action="list" to view, "create" to make, "pause"/"resume" to control, "history" for logs.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['list', 'create', 'pause', 'resume', 'history'], description: 'What to do' },
                name: { type: 'string', description: 'Schedule name (for create)' },
                description: { type: 'string', description: 'Schedule description (for create)' },
                cron_expression: { type: 'string', description: 'Cron expression (for create)' },
                interval_minutes: { type: 'number', description: 'Run every N minutes (for create)' },
                schedule_actions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' },
                            repos: { type: 'array', items: { type: 'string' } },
                            description: { type: 'string' },
                            project_id: { type: 'string' },
                            to_agent_id: { type: 'string' },
                            message: { type: 'string' },
                            prompt: { type: 'string' },
                        },
                        required: ['type'],
                    },
                    description: 'Actions to perform (for create)',
                },
                approval_policy: { type: 'string', description: 'auto, owner_approve, or council_approve' },
                schedule_id: { type: 'string', description: 'Schedule ID (for pause/resume/history)' },
            },
            required: ['action'],
        },
        handler: async (args) => {
            const err = validateRequired('corvid_manage_schedule', args, ['action']);
            if (err) return err;
            return unwrapResult(await handleManageSchedule(ctx, args as Parameters<typeof handleManageSchedule>[1]));
        },
    });

    tools.push(
        {
            name: 'corvid_web_search',
            description: 'Search the web for current information using Brave Search. Returns titles, URLs, and descriptions.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query' },
                    count: { type: 'number', description: 'Number of results to return (1-20, default 5)' },
                    freshness: { type: 'string', enum: ['pd', 'pw', 'pm', 'py'], description: 'Freshness filter: pd (past day), pw (past week), pm (past month), py (past year)' },
                },
                required: ['query'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_web_search', args, ['query']);
                if (err) return err;
                return unwrapResult(await handleWebSearch(ctx, args as { query: string; count?: number; freshness?: string }));
            },
        },
        {
            name: 'corvid_deep_research',
            description: 'Research a topic in depth by running multiple web searches from different angles. Returns deduplicated, organized results.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'The main topic to research' },
                    sub_questions: { type: 'array', items: { type: 'string' }, description: 'Custom sub-questions to search. If omitted, auto-generates angles.' },
                },
                required: ['topic'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_deep_research', args, ['topic']);
                if (err) return err;
                return unwrapResult(await handleDeepResearch(ctx, args as { topic: string; sub_questions?: string[] }));
            },
        },
    );

    // ─── GitHub tools ────────────────────────────────────────────────────
    tools.push(
        {
            name: 'corvid_github_star_repo',
            description: 'Star a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format (e.g. "CorvidLabs/corvid-agent")' },
                },
                required: ['repo'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_star_repo', args, ['repo']);
                if (err) return err;
                return unwrapResult(await handleGitHubStarRepo(ctx, args as { repo: string }));
            },
        },
        {
            name: 'corvid_github_fork_repo',
            description: 'Fork a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    org: { type: 'string', description: 'Organization to fork into. Omit to fork to personal account.' },
                },
                required: ['repo'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_fork_repo', args, ['repo']);
                if (err) return err;
                return unwrapResult(await handleGitHubForkRepo(ctx, args as { repo: string; org?: string }));
            },
        },
        {
            name: 'corvid_github_list_prs',
            description: 'List open pull requests for a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    limit: { type: 'number', description: 'Maximum number of PRs to return (default 10)' },
                },
                required: ['repo'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_list_prs', args, ['repo']);
                if (err) return err;
                return unwrapResult(await handleGitHubListPrs(ctx, args as { repo: string; limit?: number }));
            },
        },
        {
            name: 'corvid_github_create_pr',
            description: 'Create a pull request on a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    title: { type: 'string', description: 'PR title' },
                    body: { type: 'string', description: 'PR description/body' },
                    head: { type: 'string', description: 'Source branch name' },
                    base: { type: 'string', description: 'Target branch name (default "main")' },
                },
                required: ['repo', 'title', 'body', 'head'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_create_pr', args, ['repo', 'title', 'body', 'head']);
                if (err) return err;
                return unwrapResult(await handleGitHubCreatePr(ctx, args as { repo: string; title: string; body: string; head: string; base?: string }));
            },
        },
        {
            name: 'corvid_github_review_pr',
            description: 'Submit a review on a pull request.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    pr_number: { type: 'number', description: 'Pull request number' },
                    event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review action' },
                    body: { type: 'string', description: 'Review comment body' },
                },
                required: ['repo', 'pr_number', 'event', 'body'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_review_pr', args, ['repo', 'pr_number', 'event', 'body']);
                if (err) return err;
                return unwrapResult(await handleGitHubReviewPr(ctx, args as { repo: string; pr_number: number; event: string; body: string }));
            },
        },
        {
            name: 'corvid_github_create_issue',
            description: 'Create a new issue on a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    title: { type: 'string', description: 'Issue title' },
                    body: { type: 'string', description: 'Issue description/body' },
                    labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
                },
                required: ['repo', 'title', 'body'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_create_issue', args, ['repo', 'title', 'body']);
                if (err) return err;
                return unwrapResult(await handleGitHubCreateIssue(ctx, args as { repo: string; title: string; body: string; labels?: string[] }));
            },
        },
        {
            name: 'corvid_github_list_issues',
            description: 'List issues for a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state (default "open")' },
                    limit: { type: 'number', description: 'Maximum number of issues (default 30)' },
                },
                required: ['repo'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_list_issues', args, ['repo']);
                if (err) return err;
                return unwrapResult(await handleGitHubListIssues(ctx, args as { repo: string; state?: string; limit?: number }));
            },
        },
        {
            name: 'corvid_github_repo_info',
            description: 'Get information about a GitHub repository (name, description, stars, forks, etc).',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                },
                required: ['repo'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_repo_info', args, ['repo']);
                if (err) return err;
                return unwrapResult(await handleGitHubRepoInfo(ctx, args as { repo: string }));
            },
        },
        {
            name: 'corvid_github_unstar_repo',
            description: 'Remove a star from a GitHub repository.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format (e.g. "CorvidLabs/corvid-agent")' },
                },
                required: ['repo'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_unstar_repo', args, ['repo']);
                if (err) return err;
                return unwrapResult(await handleGitHubUnstarRepo(ctx, args as { repo: string }));
            },
        },
        {
            name: 'corvid_github_get_pr_diff',
            description: 'Get the full diff/patch for a pull request.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    pr_number: { type: 'number', description: 'Pull request number' },
                },
                required: ['repo', 'pr_number'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_get_pr_diff', args, ['repo', 'pr_number']);
                if (err) return err;
                return unwrapResult(await handleGitHubGetPrDiff(ctx, args as { repo: string; pr_number: number }));
            },
        },
        {
            name: 'corvid_github_comment_on_pr',
            description: 'Add a comment to a pull request.',
            parameters: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'Repository in owner/name format' },
                    pr_number: { type: 'number', description: 'Pull request number' },
                    body: { type: 'string', description: 'Comment body text' },
                },
                required: ['repo', 'pr_number', 'body'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_comment_on_pr', args, ['repo', 'pr_number', 'body']);
                if (err) return err;
                return unwrapResult(await handleGitHubCommentOnPr(ctx, args as { repo: string; pr_number: number; body: string }));
            },
        },
        {
            name: 'corvid_github_follow_user',
            description: 'Follow a GitHub user.',
            parameters: {
                type: 'object',
                properties: {
                    username: { type: 'string', description: 'GitHub username to follow' },
                },
                required: ['username'],
            },
            handler: async (args) => {
                const err = validateRequired('corvid_github_follow_user', args, ['username']);
                if (err) return err;
                return unwrapResult(await handleGitHubFollowUser(ctx, args as { username: string }));
            },
        },
    );
    } // end if (ctx)

    // Merge coding tools when a coding context is provided
    if (codingCtx) {
        tools.push(...buildCodingTools(codingCtx));
    }

    // Permission filtering — apply agent's explicit mcp_tool_permissions regardless
    // of session source. For non-web sessions without explicit permissions, fall back
    // to DEFAULT_ALLOWED_TOOLS. This is critical for small Ollama models that cannot
    // handle 10+ tool definitions efficiently.
    let filtered = tools;

    if (ctx) {
        const agent = getAgent(ctx.db, ctx.agentId);
        const permissions = agent?.mcpToolPermissions;
        if (permissions) {
            // Agent has explicit tool permissions — always apply
            const allowedSet = new Set(permissions);
            filtered = filtered.filter((t) => allowedSet.has(t.name));
        } else if (ctx.sessionSource !== 'web') {
            // Non-web sessions without explicit permissions get the default set
            const allowedSet = DEFAULT_ALLOWED_TOOLS;
            filtered = filtered.filter((t) => allowedSet.has(t.name));
        }

        if (ctx.schedulerMode) {
            filtered = filtered.filter((t) => !SCHEDULER_BLOCKED_TOOLS.has(t.name));
        }
    }

    return filtered;
}

/** Extract just the LlmToolDefinition (for sending to the provider) from DirectToolDefinitions. */
export function toProviderTools(tools: DirectToolDefinition[]): LlmToolDefinition[] {
    return tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
    }));
}
