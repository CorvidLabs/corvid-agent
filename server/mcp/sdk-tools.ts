import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { McpToolContext } from './tool-handlers';
import { handleSendMessage, handleSaveMemory, handleRecallMemory, handleListAgents, handleCreateWorkTask, handleExtendTimeout, handleCheckCredits, handleGrantCredits, handleCreditConfig, handleManageSchedule, handleManageWorkflow, handleWebSearch, handleDeepResearch, handleDiscoverAgent, handleNotifyOwner, handleAskOwner, handleGitHubStarRepo, handleGitHubUnstarRepo, handleGitHubForkRepo, handleGitHubListPrs, handleGitHubCreatePr, handleGitHubReviewPr, handleGitHubCreateIssue, handleGitHubListIssues, handleGitHubRepoInfo, handleGitHubGetPrDiff, handleGitHubCommentOnPr, handleGitHubFollowUser } from './tool-handlers';
import { getAgent } from '../db/agents';

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
    'corvid_discover_agent',
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
    'corvid_manage_workflow',
    'corvid_notify_owner',
    'corvid_ask_owner',
]);

/** Tools that require an explicit grant in mcp_tool_permissions. */
// corvid_grant_credits, corvid_credit_config

/** Tools blocked during scheduler-initiated sessions to prevent financial/messaging side effects. */
const SCHEDULER_BLOCKED_TOOLS = new Set([
    'corvid_send_message',
    'corvid_grant_credits',
    'corvid_credit_config',
    'corvid_github_fork_repo',
    'corvid_github_create_pr',
    'corvid_github_create_issue',
    'corvid_github_comment_on_pr',
    'corvid_ask_owner',
]);

export function createCorvidMcpServer(ctx: McpToolContext) {
    const tools = [
        tool(
            'corvid_send_message',
            'Send a message to another agent and wait for their response. ' +
            'Use corvid_list_agents first to discover available agents. ' +
            'The target agent will start a session, process your message, and return a response. ' +
            'To continue an existing conversation, pass the thread ID returned from a previous message.',
            {
                to_agent: z.string().describe('Agent name or ID to message'),
                message: z.string().describe('The message to send'),
                thread: z.string().optional().describe('Thread ID to continue a conversation. Omit to start new.'),
            },
            async (args) => handleSendMessage(ctx, args),
        ),
        tool(
            'corvid_save_memory',
            'Save an encrypted memory by sending a message to yourself on Algorand. ' +
            'Memories persist across sessions on the blockchain, with a local cache for fast recall. ' +
            'Use a descriptive key for easy recall later.',
            {
                key: z.string().describe('A short descriptive key for this memory (e.g. "user-preferences", "project-status")'),
                content: z.string().describe('The content to remember'),
            },
            async (args) => handleSaveMemory(ctx, args),
        ),
        tool(
            'corvid_recall_memory',
            'Recall previously saved on-chain memories. Results include blockchain confirmation status. ' +
            'Provide a key for exact lookup, a query for search, or neither to list recent memories.',
            {
                key: z.string().optional().describe('Exact key to look up'),
                query: z.string().optional().describe('Search term to find across keys and content'),
            },
            async (args) => handleRecallMemory(ctx, args),
        ),
        tool(
            'corvid_list_agents',
            'List all available agents you can communicate with. ' +
            'Shows agent names, IDs, and wallet addresses.',
            {},
            async () => handleListAgents(ctx),
        ),
        tool(
            'corvid_extend_timeout',
            'Request more time for your current session. Call this when you anticipate needing ' +
            'longer than the default timeout (e.g. multi-agent conversations, complex tasks). ' +
            'Maximum extension is 120 minutes. You can call this multiple times.',
            {
                minutes: z.number().describe('Number of additional minutes to request (1-120)'),
            },
            async (args) => handleExtendTimeout(ctx, args),
        ),
        tool(
            'corvid_check_credits',
            'Check the credit balance for a wallet address. Credits are purchased with ALGO ' +
            'and consumed per conversation turn. Use this to check how many credits a user has remaining.',
            {
                wallet_address: z.string().optional().describe('Wallet address to check. Omit to see your own agent wallet.'),
            },
            async (args) => handleCheckCredits(ctx, args),
        ),
        tool(
            'corvid_grant_credits',
            'Grant free credits to a wallet address. Use this for promotions, rewards, or compensating users. ' +
            'Maximum 1,000,000 credits per grant.',
            {
                wallet_address: z.string().describe('Wallet address to grant credits to'),
                amount: z.number().describe('Number of credits to grant'),
                reason: z.string().optional().describe('Reason for the grant (e.g. "welcome_bonus", "compensation")'),
            },
            async (args) => handleGrantCredits(ctx, args),
        ),
        tool(
            'corvid_credit_config',
            'View or update credit system configuration. Without arguments, shows current config. ' +
            'With key and value, updates a config setting.',
            {
                key: z.string().optional().describe('Config key to update (e.g. "credits_per_algo", "low_credit_threshold")'),
                value: z.string().optional().describe('New value for the config key'),
            },
            async (args) => handleCreditConfig(ctx, args),
        ),
        ...(ctx.workTaskService ? [
            tool(
                'corvid_create_work_task',
                'Create a work task that spawns a new agent session on a dedicated branch. ' +
                'The agent will implement the described changes, run validation, and open a PR. ' +
                'Use this to propose code improvements or fixes to the codebase.',
                {
                    description: z.string().describe('A clear description of the work to be done'),
                    project_id: z.string().optional().describe('Project ID to work on. Omit to use the agent default project.'),
                },
                async (args) => handleCreateWorkTask(ctx, args),
            ),
        ] : []),
        tool(
            'corvid_manage_schedule',
            'Manage automated schedules for this agent. Schedules run actions on a cron or interval basis. ' +
            'Actions include: star_repo, fork_repo, review_prs, work_task, council_launch, send_message, github_suggest, codebase_review, dependency_audit, custom. ' +
            'Use action="list" to view schedules, "create" to make one, "pause"/"resume" to control, "history" for logs.',
            {
                action: z.enum(['list', 'create', 'pause', 'resume', 'history']).describe('What to do'),
                name: z.string().optional().describe('Schedule name (for create)'),
                description: z.string().optional().describe('Schedule description (for create)'),
                cron_expression: z.string().optional().describe('Cron expression e.g. "0 9 * * 1-5" for weekdays at 9am (for create)'),
                interval_minutes: z.number().optional().describe('Run every N minutes as alternative to cron (for create)'),
                schedule_actions: z.array(z.object({
                    type: z.string().describe('Action type: star_repo, fork_repo, review_prs, work_task, send_message, github_suggest, codebase_review, dependency_audit, custom'),
                    repos: z.array(z.string()).optional().describe('Target repo(s) in owner/name format'),
                    description: z.string().optional().describe('Work task description'),
                    project_id: z.string().optional().describe('Project ID'),
                    to_agent_id: z.string().optional().describe('Target agent ID (for send_message)'),
                    message: z.string().optional().describe('Message content (for send_message)'),
                    prompt: z.string().optional().describe('Arbitrary prompt (for custom action type)'),
                })).optional().describe('Actions to perform (for create)'),
                approval_policy: z.string().optional().describe('auto, owner_approve, or council_approve (for create)'),
                schedule_id: z.string().optional().describe('Schedule ID (for pause/resume/history)'),
            },
            async (args) => handleManageSchedule(ctx, args),
        ),
        tool(
            'corvid_manage_workflow',
            'Manage graph-based workflows for multi-step agent orchestration. ' +
            'Workflows chain agent sessions, work tasks, conditions, and delays into executable graphs. ' +
            'Use action="list" to view workflows, "create" to make one, "activate" to enable, "trigger" to run, "runs" for history, "run_status" for details.',
            {
                action: z.enum(['list', 'create', 'get', 'activate', 'pause', 'trigger', 'runs', 'run_status']).describe('What to do'),
                workflow_id: z.string().optional().describe('Workflow ID (for get/activate/pause/trigger/runs)'),
                run_id: z.string().optional().describe('Run ID (for run_status)'),
                name: z.string().optional().describe('Workflow name (for create)'),
                description: z.string().optional().describe('Workflow description (for create)'),
                nodes: z.array(z.object({
                    id: z.string().describe('Unique node ID'),
                    type: z.string().describe('Node type: start, agent_session, work_task, condition, delay, transform, parallel, join, end'),
                    label: z.string().describe('Human-readable label'),
                    config: z.record(z.string(), z.unknown()).optional().describe('Node configuration (agentId, prompt, expression, delayMs, etc.)'),
                    position: z.object({ x: z.number(), y: z.number() }).optional().describe('UI position'),
                })).optional().describe('Workflow nodes (for create)'),
                edges: z.array(z.object({
                    id: z.string().describe('Unique edge ID'),
                    sourceNodeId: z.string().describe('Source node ID'),
                    targetNodeId: z.string().describe('Target node ID'),
                    condition: z.string().optional().describe('Edge condition for condition nodes ("true" or "false")'),
                    label: z.string().optional().describe('Edge label'),
                })).optional().describe('Workflow edges (for create)'),
                default_project_id: z.string().optional().describe('Default project ID for nodes (for create)'),
                max_concurrency: z.number().optional().describe('Max concurrent node executions (for create, default 2)'),
                input: z.record(z.string(), z.unknown()).optional().describe('Input data to pass to the workflow (for trigger)'),
            },
            async (args) => handleManageWorkflow(ctx, args),
        ),
        tool(
            'corvid_web_search',
            'Search the web for current information using Brave Search. ' +
            'Returns titles, URLs, and descriptions. Use freshness to filter by recency.',
            {
                query: z.string().describe('The search query'),
                count: z.number().optional().describe('Number of results to return (1-20, default 5)'),
                freshness: z.enum(['pd', 'pw', 'pm', 'py']).optional().describe('Freshness filter: pd (past day), pw (past week), pm (past month), py (past year)'),
            },
            async (args) => handleWebSearch(ctx, args),
        ),
        tool(
            'corvid_deep_research',
            'Research a topic in depth by running multiple web searches from different angles. ' +
            'Automatically generates sub-queries (or use your own) and returns deduplicated, organized results. ' +
            'Best for complex topics that benefit from multiple perspectives.',
            {
                topic: z.string().describe('The main topic to research'),
                sub_questions: z.array(z.string()).optional().describe('Custom sub-questions to search. If omitted, auto-generates angles like "benefits", "challenges", "examples", "latest news".'),
            },
            async (args) => handleDeepResearch(ctx, args),
        ),
        // ─── A2A discovery ───────────────────────────────────────────────
        tool(
            'corvid_discover_agent',
            'Discover a remote agent by fetching its A2A Agent Card from /.well-known/agent-card.json. ' +
            'Returns the agent\'s name, capabilities, skills, and supported protocols. ' +
            'Use this to learn what a remote agent can do before communicating with it.',
            {
                url: z.string().describe('Base URL of the remote agent (e.g. "https://agent.example.com")'),
            },
            async (args) => handleDiscoverAgent(ctx, args),
        ),
        // ─── Owner communication tools ───────────────────────────────────
        tool(
            'corvid_notify_owner',
            'Send a notification to the server owner/operator watching the dashboard. ' +
            'Use this for status updates, warnings, completion reports, or any non-blocking communication. ' +
            'The owner sees the notification in real-time but does not need to respond.',
            {
                title: z.string().optional().describe('Short notification title (optional)'),
                message: z.string().describe('The notification message'),
                level: z.enum(['info', 'warning', 'success', 'error']).optional().describe('Notification level (default "info")'),
            },
            async (args) => handleNotifyOwner(ctx, args),
        ),
        tool(
            'corvid_ask_owner',
            'Ask the server owner/operator a question and WAIT for their response. ' +
            'This blocks your execution until the owner responds or the timeout expires. ' +
            'Use this when you need human input, clarification, or a decision before proceeding. ' +
            'Provide options when the question has a fixed set of choices.',
            {
                question: z.string().describe('The question to ask the owner'),
                options: z.array(z.string()).optional().describe('Predefined answer options (if applicable)'),
                context: z.string().optional().describe('Additional context to help the owner understand the question'),
                timeout_minutes: z.number().optional().describe('How long to wait for a response (1-10 minutes, default 2)'),
            },
            async (args) => handleAskOwner(ctx, args),
        ),
        // ─── GitHub tools ────────────────────────────────────────────────
        tool(
            'corvid_github_star_repo',
            'Star a GitHub repository.',
            { repo: z.string().describe('Repository in owner/name format (e.g. "CorvidLabs/corvid-agent")') },
            async (args) => handleGitHubStarRepo(ctx, args),
        ),
        tool(
            'corvid_github_fork_repo',
            'Fork a GitHub repository.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                org: z.string().optional().describe('Organization to fork into. Omit to fork to your personal account.'),
            },
            async (args) => handleGitHubForkRepo(ctx, args),
        ),
        tool(
            'corvid_github_list_prs',
            'List open pull requests for a GitHub repository.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                limit: z.number().optional().describe('Maximum number of PRs to return (default 10)'),
            },
            async (args) => handleGitHubListPrs(ctx, args),
        ),
        tool(
            'corvid_github_create_pr',
            'Create a pull request on a GitHub repository.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                title: z.string().describe('PR title'),
                body: z.string().describe('PR description/body'),
                head: z.string().describe('Source branch name'),
                base: z.string().optional().describe('Target branch name (default "main")'),
            },
            async (args) => handleGitHubCreatePr(ctx, args),
        ),
        tool(
            'corvid_github_review_pr',
            'Submit a review on a pull request.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                pr_number: z.number().describe('Pull request number'),
                event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe('Review action'),
                body: z.string().describe('Review comment body'),
            },
            async (args) => handleGitHubReviewPr(ctx, args),
        ),
        tool(
            'corvid_github_create_issue',
            'Create a new issue on a GitHub repository.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                title: z.string().describe('Issue title'),
                body: z.string().describe('Issue description/body'),
                labels: z.array(z.string()).optional().describe('Labels to apply to the issue'),
            },
            async (args) => handleGitHubCreateIssue(ctx, args),
        ),
        tool(
            'corvid_github_list_issues',
            'List issues for a GitHub repository.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by state (default "open")'),
                limit: z.number().optional().describe('Maximum number of issues to return (default 30)'),
            },
            async (args) => handleGitHubListIssues(ctx, args),
        ),
        tool(
            'corvid_github_repo_info',
            'Get information about a GitHub repository (name, description, stars, forks, etc).',
            { repo: z.string().describe('Repository in owner/name format') },
            async (args) => handleGitHubRepoInfo(ctx, args),
        ),
        tool(
            'corvid_github_unstar_repo',
            'Remove a star from a GitHub repository.',
            { repo: z.string().describe('Repository in owner/name format (e.g. "CorvidLabs/corvid-agent")') },
            async (args) => handleGitHubUnstarRepo(ctx, args),
        ),
        tool(
            'corvid_github_get_pr_diff',
            'Get the full diff/patch for a pull request. Useful for reviewing code changes.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                pr_number: z.number().describe('Pull request number'),
            },
            async (args) => handleGitHubGetPrDiff(ctx, args),
        ),
        tool(
            'corvid_github_comment_on_pr',
            'Add a comment to a pull request.',
            {
                repo: z.string().describe('Repository in owner/name format'),
                pr_number: z.number().describe('Pull request number'),
                body: z.string().describe('Comment body (supports markdown)'),
            },
            async (args) => handleGitHubCommentOnPr(ctx, args),
        ),
        tool(
            'corvid_github_follow_user',
            'Follow a GitHub user.',
            { username: z.string().describe('GitHub username to follow') },
            async (args) => handleGitHubFollowUser(ctx, args),
        ),
    ];

    // Local (web) sessions get all tools — permission scoping only applies to
    // remote sessions (algochat, agent-to-agent) where untrusted input is possible.
    let filteredTools = tools;
    if (ctx.sessionSource !== 'web') {
        const agent = getAgent(ctx.db, ctx.agentId);
        const permissions = agent?.mcpToolPermissions;
        const allowedSet = permissions ? new Set(permissions) : DEFAULT_ALLOWED_TOOLS;
        filteredTools = tools.filter((t) => allowedSet.has(t.name));
    }

    // Scheduler-initiated sessions: block tools that could cause financial or messaging side effects
    if (ctx.schedulerMode) {
        filteredTools = filteredTools.filter((t) => !SCHEDULER_BLOCKED_TOOLS.has(t.name));
    }

    return createSdkMcpServer({
        name: 'corvid-agent-tools',
        version: '1.0.0',
        tools: filteredTools,
    });
}
