import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { getAgent } from '../db/agents';
import { isToolBlockedForScheduler } from './scheduler-tool-gating';
import { filterToolsByGuardrail, resolveToolAccessPolicy, type ToolAccessConfig } from './tool-guardrails';
import type { McpToolContext } from './tool-handlers';
import {
  handleAskOwner,
  handleBrowser,
  handleCheckCredits,
  handleCheckHealthTrends,
  handleCheckReputation,
  handleCheckWorkStatus,
  handleCodeSymbols,
  handleConfigureNotifications,
  handleCreateWorkTask,
  handleCreditConfig,
  handleCurrentProject,
  handleDeepResearch,
  handleDeleteMemory,
  handleDiscoverAgent,
  handleExtendTimeout,
  handleFindReferences,
  handleFlockDirectory,
  handleGitHubCommentOnPr,
  handleGitHubCreateIssue,
  handleGitHubCreatePr,
  handleGitHubFollowUser,
  handleGitHubForkRepo,
  handleGitHubGetPrDiff,
  handleGitHubListIssues,
  handleGitHubListPrs,
  handleGitHubRepoInfo,
  handleGitHubReviewPr,
  handleGitHubStarRepo,
  handleGitHubUnstarRepo,
  handleGrantCredits,
  handleInvokeRemoteAgent,
  handleLaunchCouncil,
  handleListAgents,
  handleListProjects,
  handleListWorkTasks,
  handleManageSchedule,
  handleManageWorkflow,
  handleNotifyOwner,
  handlePromoteMemory,
  handlePublishAttestation,
  handleReadOnChainMemories,
  handleRecallMemory,
  handleRestartServer,
  handleSaveMemory,
  handleSendMessage,
  handleSyncOnChainMemories,
  handleVerifyAgentReputation,
  handleWebSearch,
} from './tool-handlers';
import { handleLookupContact } from './tool-handlers/contacts';
import { handleDiscordSendImage, handleDiscordSendMessage } from './tool-handlers/discord';
import {
  handleLibraryDelete,
  handleLibraryListOnChain,
  handleLibraryRead,
  handleLibraryWrite,
} from './tool-handlers/library';
import { handleManageRepoBlocklist } from './tool-handlers/repo-blocklist';
import { resolveAllowedTools } from './tool-permissions';

/** Tools that require an explicit grant in mcp_tool_permissions. */
// corvid_grant_credits, corvid_credit_config

// Scheduler tool gating is handled by isToolBlockedForScheduler() — see scheduler-tool-gating.ts

export function createCorvidMcpServer(ctx: McpToolContext, pluginTools?: ReturnType<typeof tool>[]) {
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
      'Save a memory to short-term local storage (SQLite). ' +
        'New memories are short-term by default — use corvid_promote_memory to promote to long-term on-chain storage (ARC-69 ASA). ' +
        'Use this for ANY "remember this" request regardless of channel. Use a descriptive key for easy recall later.',
      {
        key: z.string().describe('A short descriptive key for this memory (e.g. "user-preferences", "project-status")'),
        content: z.string().describe('The content to remember'),
      },
      async (args) => handleSaveMemory(ctx, args),
    ),
    tool(
      'corvid_recall_memory',
      'Recall memories from short-term cache (SQLite) with long-term storage status. ' +
        'Results show whether the memory is confirmed on-chain (long-term) or still pending sync. ' +
        'Provide a key for exact lookup, a query for search, or neither to list recent memories.',
      {
        key: z.string().optional().describe('Exact key to look up'),
        query: z.string().optional().describe('Search term to find across keys and content'),
      },
      async (args) => handleRecallMemory(ctx, args),
    ),
    tool(
      'corvid_read_on_chain_memories',
      'Read memories directly from on-chain storage (Algorand blockchain). ' +
        'Use this to browse your permanent long-term memories stored on-chain. ' +
        'Unlike corvid_recall_memory (which reads from local SQLite cache), this reads the blockchain directly. ' +
        'Useful for verifying on-chain state or when local cache may be stale/empty.',
      {
        search: z.string().optional().describe('Optional search term to filter memories by key or content'),
        limit: z.number().optional().describe('Maximum number of memories to return (default: 50)'),
      },
      async (args) => handleReadOnChainMemories(ctx, args),
    ),
    tool(
      'corvid_sync_on_chain_memories',
      'Sync memories from on-chain storage back to local SQLite cache. ' +
        'Use this to recover memories after a database reset or to ensure local cache matches on-chain state. ' +
        'Reads all on-chain memories (both ARC-69 ASAs and plain transactions) and restores any missing from the local database.',
      {
        limit: z.number().optional().describe('Maximum number of on-chain memories to scan (default: 200)'),
      },
      async (args) => handleSyncOnChainMemories(ctx, args),
    ),
    tool(
      'corvid_delete_memory',
      'Delete (forget) a long-term ARC-69 memory. Only works for memories stored as ASAs on localnet. ' +
        'Soft delete (default) archives the memory and clears the on-chain content but preserves the ASA. ' +
        'Hard delete destroys the ASA entirely. Permanent (plain transaction) memories cannot be deleted.',
      {
        key: z.string().describe('Memory key to delete'),
        mode: z
          .enum(['soft', 'hard'])
          .optional()
          .describe('Delete mode: "soft" (default, archives) or "hard" (destroys ASA)'),
      },
      async (args) => handleDeleteMemory(ctx, args),
    ),
    tool(
      'corvid_promote_memory',
      'Promote a short-term (SQLite) memory to long-term on-chain storage (ARC-69 ASA). ' +
        'After promotion the memory is durable, encrypted, and stored on the Algorand blockchain. ' +
        'Use this after corvid_save_memory when you want to make a memory permanent.',
      {
        key: z.string().describe('Memory key to promote to long-term on-chain storage'),
      },
      async (args) => handlePromoteMemory(ctx, args),
    ),
    // ── Shared Library (CRVLIB) ──────────────────────────────────────────
    tool(
      'corvid_library_write',
      'Publish or update an entry in the shared agent library (CRVLIB). ' +
        'Library entries are plaintext ARC-69 ASAs on localnet — readable by ALL agents. ' +
        'Use this for shared knowledge: guides, standards, decisions, runbooks, and reference docs. ' +
        'Unlike private memories (corvid_save_memory), library entries are a shared commons. ' +
        'Large content is automatically split into a multi-page book (linked ASA chain).',
      {
        key: z
          .string()
          .describe(
            'Unique key for this entry (e.g. "coding-standards", "deploy-runbook"). For auto-split books, pages are keyed as {key}/page-1, {key}/page-2, etc.',
          ),
        content: z
          .string()
          .describe(
            'The content to publish (plaintext). No size limit — content exceeding ~700 chars is auto-split into a multi-page book.',
          ),
        category: z
          .enum(['guide', 'reference', 'decision', 'standard', 'runbook'])
          .optional()
          .describe('Entry category (default: reference)'),
        tags: z.array(z.string()).optional().describe('Tags for discovery (e.g. ["typescript", "testing"])'),
      },
      async (args) => handleLibraryWrite(ctx, args),
    ),
    tool(
      'corvid_library_read',
      'Read entries from the shared agent library. ' +
        'Provide a key for exact lookup, or use query/category/tag to search. ' +
        'Reads from local SQLite cache (synced from on-chain every 2 minutes).',
      {
        key: z.string().optional().describe('Exact key to look up'),
        query: z.string().optional().describe('Search term to filter by key or content'),
        category: z
          .enum(['guide', 'reference', 'decision', 'standard', 'runbook'])
          .optional()
          .describe('Filter by category'),
        tag: z.string().optional().describe('Filter by tag'),
        limit: z.number().optional().describe('Max entries to return (default: 20)'),
      },
      async (args) => handleLibraryRead(ctx, args),
    ),
    tool(
      'corvid_library_list',
      'List all shared library entries directly from the Algorand blockchain. ' +
        'Unlike corvid_library_read (which reads local cache), this queries on-chain CRVLIB ASAs. ' +
        'Useful for verifying on-chain state or discovering entries from other agents.',
      {
        category: z
          .enum(['guide', 'reference', 'decision', 'standard', 'runbook'])
          .optional()
          .describe('Filter by category'),
        tag: z.string().optional().describe('Filter by tag'),
        limit: z.number().optional().describe('Max entries to return (default: 50)'),
      },
      async (args) => handleLibraryListOnChain(ctx, args),
    ),
    tool(
      'corvid_library_delete',
      'Delete a shared library entry. Soft delete (default) archives it; hard delete destroys the ASA.',
      {
        key: z.string().describe('Library entry key to delete'),
        mode: z.enum(['soft', 'hard']).optional().describe('Delete mode: "soft" (default) or "hard" (destroys ASA)'),
      },
      async (args) => handleLibraryDelete(ctx, args),
    ),
    tool(
      'corvid_list_agents',
      'List all available agents you can communicate with. ' + 'Shows agent names, IDs, and wallet addresses.',
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
      'corvid_restart_server',
      'Restart the corvid-agent server. Use this when server-side changes require a restart ' +
        '(e.g. new environment variables, updated dependencies, config changes). ' +
        'This tool is idempotent — if the server was already restarted in this session, it returns ' +
        'a confirmation instead of restarting again, preventing restart loops.',
      {
        reason: z.string().optional().describe('Brief reason for the restart (e.g. "apply env var changes")'),
      },
      async (args) => handleRestartServer(ctx, args),
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
    tool(
      'corvid_list_projects',
      'List all available projects with their IDs, names, and working directories. ' +
        'Use this to discover projects before creating work tasks.',
      {},
      async () => handleListProjects(ctx),
    ),
    tool(
      'corvid_current_project',
      "Show the current agent's default project — the project used when no project_id is specified in corvid_create_work_task.",
      {},
      async () => handleCurrentProject(ctx),
    ),
    ...(ctx.workTaskService
      ? [
          tool(
            'corvid_create_work_task',
            'Create a work task that spawns a new agent session on a dedicated branch. ' +
              'The agent will implement the described changes, run validation, and open a PR. ' +
              'Use corvid_list_projects to discover available projects first. ' +
              'Set model_tier to control cost: "light" for trivial tasks, "standard" for normal work, "heavy" for complex architecture.',
            {
              description: z.string().describe('A clear description of the work to be done'),
              project_id: z
                .string()
                .optional()
                .describe('Project ID to work on. Omit to use the agent default project.'),
              project_name: z
                .string()
                .optional()
                .describe('Project name (alternative to project_id). Use corvid_list_projects to discover names.'),
              model_tier: z
                .string()
                .optional()
                .describe(
                  'Model tier: "light" (Haiku, trivial tasks), "standard" (Sonnet, normal work), "heavy" (Opus, complex architecture). Omit for auto-select.',
                ),
              agent_id: z
                .string()
                .optional()
                .describe(
                  'Agent ID to execute and be credited for this task. Defaults to the calling agent. Use corvid_list_agents to discover agent IDs.',
                ),
            },
            async (args) => handleCreateWorkTask(ctx, args),
          ),
          tool(
            'corvid_check_work_status',
            'Check the status of a work task by ID. Returns status, branch, iteration count, PR URL (if completed), and error (if failed).',
            {
              task_id: z.string().describe('The work task ID to check'),
            },
            async (args) => handleCheckWorkStatus(ctx, args),
          ),
          tool(
            'corvid_list_work_tasks',
            'List work tasks for this agent. Optionally filter by status (pending, branching, running, validating, completed, failed).',
            {
              status: z
                .string()
                .optional()
                .describe('Filter by status: pending, branching, running, validating, completed, failed'),
              limit: z.number().optional().describe('Maximum number of tasks to return (default 20, max 50)'),
            },
            async (args) => handleListWorkTasks(ctx, args),
          ),
        ]
      : []),
    tool(
      'corvid_manage_schedule',
      "Manage automated schedules for all agents. Omit agent_id in list/get to see all agents' schedules. Schedules run actions on a cron or interval basis. " +
        'Actions include: star_repo, fork_repo, review_prs, work_task, council_launch, send_message, github_suggest, codebase_review, dependency_audit, daily_review, custom. ' +
        'Use action="list" to view schedules, "get" to see full details of one, "create" to make one, "update" to modify, "pause"/"resume" to control, "history" for logs.',
      {
        action: z.enum(['list', 'create', 'update', 'get', 'pause', 'resume', 'history']).describe('What to do'),
        name: z.string().optional().describe('Schedule name (for create/update)'),
        description: z.string().optional().describe('Schedule description (for create/update)'),
        cron_expression: z
          .string()
          .optional()
          .describe('Cron expression e.g. "0 9 * * 1-5" for weekdays at 9am (for create/update)'),
        interval_minutes: z
          .number()
          .optional()
          .describe('Run every N minutes as alternative to cron (for create/update)'),
        schedule_actions: z
          .array(
            z.object({
              type: z
                .string()
                .describe(
                  'Action type: star_repo, fork_repo, review_prs, work_task, send_message, github_suggest, codebase_review, dependency_audit, daily_review, custom',
                ),
              repos: z.array(z.string()).optional().describe('Target repo(s) in owner/name format'),
              description: z.string().optional().describe('Work task description'),
              project_id: z.string().optional().describe('Project ID'),
              to_agent_id: z.string().optional().describe('Target agent ID (for send_message)'),
              message: z.string().optional().describe('Message content (for send_message)'),
              prompt: z.string().optional().describe('Arbitrary prompt (for custom action type)'),
            }),
          )
          .optional()
          .describe('Actions to perform (for create/update)'),
        approval_policy: z.string().optional().describe('auto, owner_approve, or council_approve (for create/update)'),
        max_executions: z.number().optional().describe('Maximum number of executions (for create/update)'),
        agent_id: z
          .string()
          .optional()
          .describe(
            'Agent ID — filter by agent (for list), or assign schedule to agent (for create/update). Omit on list to see all schedules.',
          ),
        schedule_id: z.string().optional().describe('Schedule ID (for get/update/pause/resume/history)'),
        output_destinations: z
          .array(
            z.object({
              type: z.string().describe('Destination type: discord_channel, algochat_agent, or algochat_address'),
              target: z.string().describe('Target: Discord channel ID, agent ID, or Algorand address'),
              format: z
                .string()
                .optional()
                .describe('Output format: summary (truncated), full (complete), or on_error_only (only on failure)'),
            }),
          )
          .optional()
          .describe('Where to deliver results after execution (for create/update)'),
      },
      async (args) => handleManageSchedule(ctx, args),
    ),
    tool(
      'corvid_manage_workflow',
      'Manage graph-based workflows for multi-step agent orchestration. ' +
        'Workflows chain agent sessions, work tasks, conditions, and delays into executable graphs. ' +
        'Use action="list" to view workflows, "create" to make one, "activate" to enable, "trigger" to run, "runs" for history, "run_status" for details.',
      {
        action: z
          .enum(['list', 'create', 'get', 'activate', 'pause', 'trigger', 'runs', 'run_status'])
          .describe('What to do'),
        workflow_id: z.string().optional().describe('Workflow ID (for get/activate/pause/trigger/runs)'),
        run_id: z.string().optional().describe('Run ID (for run_status)'),
        name: z.string().optional().describe('Workflow name (for create)'),
        description: z.string().optional().describe('Workflow description (for create)'),
        nodes: z
          .array(
            z.object({
              id: z.string().describe('Unique node ID'),
              type: z
                .string()
                .describe(
                  'Node type: start, agent_session, work_task, condition, delay, transform, parallel, join, end',
                ),
              label: z.string().describe('Human-readable label'),
              config: z
                .record(z.string(), z.unknown())
                .optional()
                .describe('Node configuration (agentId, prompt, expression, delayMs, etc.)'),
              position: z.object({ x: z.number(), y: z.number() }).optional().describe('UI position'),
            }),
          )
          .optional()
          .describe('Workflow nodes (for create)'),
        edges: z
          .array(
            z.object({
              id: z.string().describe('Unique edge ID'),
              sourceNodeId: z.string().describe('Source node ID'),
              targetNodeId: z.string().describe('Target node ID'),
              condition: z.string().optional().describe('Edge condition for condition nodes ("true" or "false")'),
              label: z.string().optional().describe('Edge label'),
            }),
          )
          .optional()
          .describe('Workflow edges (for create)'),
        default_project_id: z.string().optional().describe('Default project ID for nodes (for create)'),
        max_concurrency: z.number().optional().describe('Max concurrent node executions (for create, default 2)'),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Input data to pass to the workflow (for trigger)'),
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
        freshness: z
          .enum(['pd', 'pw', 'pm', 'py'])
          .optional()
          .describe('Freshness filter: pd (past day), pw (past week), pm (past month), py (past year)'),
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
        sub_questions: z
          .array(z.string())
          .optional()
          .describe(
            'Custom sub-questions to search. If omitted, auto-generates angles like "benefits", "challenges", "examples", "latest news".',
          ),
      },
      async (args) => handleDeepResearch(ctx, args),
    ),
    // ─── A2A discovery ───────────────────────────────────────────────
    tool(
      'corvid_discover_agent',
      'Discover a remote agent by fetching its A2A Agent Card from /.well-known/agent-card.json. ' +
        "Returns the agent's name, capabilities, skills, and supported protocols. " +
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
        level: z
          .enum(['info', 'warning', 'success', 'error'])
          .optional()
          .describe('Notification level (default "info")'),
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
    tool(
      'corvid_configure_notifications',
      'Manage notification channels for this agent. Channels control where corvid_notify_owner sends messages. ' +
        'Supported channel types: discord (webhook), telegram (bot), github (issues), algochat (on-chain), slack (bot). ' +
        'WebSocket is always active. Use action="list" to view, "set" to configure, "enable"/"disable" to toggle, "remove" to delete.',
      {
        action: z.enum(['list', 'set', 'enable', 'disable', 'remove']).describe('What to do'),
        channel_type: z.string().optional().describe('Channel type: discord, telegram, github, algochat, or slack'),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            'Channel configuration. Discord: {webhookUrl}. Telegram: {botToken, chatId}. GitHub: {repo, labels?}. AlgoChat: {toAddress}. Slack: {botToken, channel}.',
          ),
      },
      async (args) => handleConfigureNotifications(ctx, args),
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
    // ─── Reputation & trust tools ───────────────────────────────────
    tool(
      'corvid_check_reputation',
      'Check the reputation score and trust level for yourself or another agent. ' +
        'Shows overall score, component breakdown, and recent reputation events.',
      {
        agent_id: z.string().optional().describe('Agent ID to check. Omit to check your own.'),
      },
      async (args) => handleCheckReputation(ctx, args),
    ),
    tool(
      'corvid_check_health_trends',
      'View codebase health metric trends across recent improvement cycles. ' +
        'Shows whether metrics like TSC errors, test failures, and code markers are improving, stable, or regressing.',
      {
        agent_id: z.string().optional().describe('Agent ID. Omit to use your own.'),
        project_id: z.string().describe('Project ID to check health trends for'),
        limit: z.number().optional().describe('Number of recent snapshots to analyze (default 10)'),
      },
      async (args) => handleCheckHealthTrends(ctx, args),
    ),
    tool(
      'corvid_publish_attestation',
      'Compute your reputation score and publish a cryptographic attestation hash on the Algorand blockchain. ' +
        'This creates a verifiable, tamper-proof record of your trust level.',
      {
        agent_id: z.string().optional().describe('Agent ID. Omit to publish your own.'),
      },
      async (args) => handlePublishAttestation(ctx, args),
    ),
    tool(
      'corvid_verify_agent_reputation',
      "Verify a remote agent's reputation by scanning their on-chain attestation transactions. " +
        'Returns trust level derived from attestation count and details.',
      {
        wallet_address: z.string().optional().describe('Algorand wallet address to scan for attestations'),
      },
      async (args) => handleVerifyAgentReputation(ctx, args),
    ),
    tool(
      'corvid_invoke_remote_agent',
      'Send a task to a remote A2A-compatible agent and wait for the result. ' +
        'The remote agent must expose /a2a/tasks/send endpoint.',
      {
        agent_url: z.string().describe('Base URL of the remote agent (e.g. "https://agent.example.com")'),
        message: z.string().describe('The task message to send'),
        skill: z.string().optional().describe('Specific skill to invoke on the remote agent'),
        timeout_minutes: z.number().optional().describe('How long to wait for a response (default 5 minutes)'),
        min_trust: z.string().optional().describe('Minimum trust level required (untrusted/low/medium/high/verified)'),
      },
      async (args) => handleInvokeRemoteAgent(ctx, args),
    ),
    // ─── AST / Code navigation tools ─────────────────────────────────
    ...(ctx.astParserService
      ? [
          tool(
            'corvid_code_symbols',
            'Search for code symbols (functions, classes, interfaces, types, etc.) in a project using AST parsing. ' +
              'Returns symbol names, kinds, line ranges, and export status. Use this for structural code navigation.',
            {
              query: z.string().describe('Symbol name or partial name to search for'),
              project_dir: z
                .string()
                .optional()
                .describe('Project directory to search. Omit to use the agent default project.'),
              kinds: z
                .array(
                  z.enum([
                    'function',
                    'class',
                    'interface',
                    'type_alias',
                    'enum',
                    'import',
                    'export',
                    'variable',
                    'method',
                  ]),
                )
                .optional()
                .describe('Filter by symbol kind(s)'),
              limit: z.number().optional().describe('Maximum results to return (default 50)'),
            },
            async (args) => handleCodeSymbols(ctx, args),
          ),
          tool(
            'corvid_find_references',
            'Find all references to a symbol across the project. Combines AST-based definition lookup with text search. ' +
              'Returns both the definition location(s) and all file:line references.',
            {
              symbol_name: z.string().describe('Exact symbol name to find references for'),
              project_dir: z
                .string()
                .optional()
                .describe('Project directory to search. Omit to use the agent default project.'),
              limit: z.number().optional().describe('Maximum reference lines to return (default 50)'),
            },
            async (args) => handleFindReferences(ctx, args),
          ),
        ]
      : []),

    // ─── Repo Blocklist ──────────────────────────────────────────────
    tool(
      'corvid_repo_blocklist',
      'Manage the repo blocklist — repos the agent should not contribute to. ' +
        'Use action="list" to view blocked repos, "add" to block a repo, "remove" to unblock, "check" to test if blocked. ' +
        'Supports exact repos (owner/name) and org wildcards (owner/*).',
      {
        action: z.enum(['list', 'add', 'remove', 'check']).describe('What to do'),
        repo: z.string().optional().describe('Repository in owner/name format, or owner/* for org wildcard'),
        reason: z.string().optional().describe('Why this repo is blocked (for add)'),
        source: z
          .enum(['manual', 'pr_rejection', 'daily_review'])
          .optional()
          .describe('Block source (default: manual)'),
      },
      async (args) => handleManageRepoBlocklist(ctx, args),
    ),

    // ─── Council deliberation ───────────────────────────────────────
    ...(ctx.processManager
      ? [
          tool(
            'corvid_launch_council',
            'Launch a multi-agent council deliberation on a topic. Agents discuss, debate, and synthesize a decision. ' +
              'Creates a council configuration and immediately launches it. Returns the council ID and launch ID for tracking.',
            {
              topic: z.string().describe('The topic or question for the council to deliberate on'),
              agentIds: z
                .array(z.string())
                .optional()
                .describe('Agent IDs to participate. Omit to include all agents.'),
              chairmanAgentId: z
                .string()
                .optional()
                .describe('Agent ID for the chairman who synthesizes the final decision. Defaults to first agent.'),
              discussionRounds: z.number().optional().describe('Number of discussion rounds (default 2)'),
              governanceTier: z
                .string()
                .optional()
                .describe('Governance tier: "standard" (default) or "governance" for formal governance votes'),
            },
            async (args) => handleLaunchCouncil(ctx, args),
          ),
        ]
      : []),

    // ─── Flock Directory ────────────────────────────────────────────
    tool(
      'corvid_flock_directory',
      'Manage the Flock Directory — an on-chain agent registry for discovery and reputation. ' +
        'Actions: register, deregister, heartbeat, lookup, search, list, stats, compute_reputation.',
      {
        action: z
          .enum(['register', 'deregister', 'heartbeat', 'lookup', 'search', 'list', 'stats', 'compute_reputation'])
          .describe('Operation to perform'),
        agent_id: z.string().optional().describe('Agent ID (for deregister, heartbeat, lookup, compute_reputation)'),
        address: z.string().optional().describe('Algorand address (for register, lookup)'),
        name: z.string().optional().describe('Agent name (for register)'),
        description: z.string().optional().describe('Agent description (for register)'),
        instance_url: z.string().optional().describe('Agent instance URL (for register)'),
        capabilities: z.string().optional().describe('Comma-separated capabilities (for register)'),
        query: z.string().optional().describe('Search query (for search)'),
        capability: z.string().optional().describe('Filter by capability (for search)'),
        min_reputation: z.number().optional().describe('Minimum reputation score (for search)'),
        sort_by: z
          .enum(['reputation', 'name', 'uptime', 'registered', 'attestations'])
          .optional()
          .describe('Sort field (for search, default: reputation)'),
        sort_order: z.enum(['asc', 'desc']).optional().describe('Sort order (for search, default: desc)'),
        limit: z.number().optional().describe('Max results to return (default 20)'),
      },
      async (args) => handleFlockDirectory(ctx, args),
    ),

    // ─── Discord messaging ──────────────────────────────────────────
    tool(
      'corvid_discord_send_message',
      'Send a text message to a specific Discord channel. ' +
        'Requires the channel ID (numeric snowflake). ' +
        'Use this to proactively post messages, status updates, or replies to Discord channels.',
      {
        channel_id: z.string().describe('Discord channel ID (numeric snowflake)'),
        message: z.string().describe('The text message to send'),
        reply_to: z.string().optional().describe('Message ID to reply to (creates a threaded reply)'),
      },
      async (args) => handleDiscordSendMessage(ctx, args),
    ),
    tool(
      'corvid_discord_send_image',
      'Send an image or file to a specific Discord channel. ' +
        'Provide the image as a base64-encoded string. ' +
        'Optionally include a text message alongside the image.',
      {
        channel_id: z.string().describe('Discord channel ID (numeric snowflake)'),
        image_base64: z.string().describe('Base64-encoded image data'),
        filename: z.string().optional().describe('Filename for the attachment (default: "image.png")'),
        content_type: z.string().optional().describe('MIME type (default: "image/png")'),
        message: z.string().optional().describe('Optional text message to include with the image'),
      },
      async (args) => handleDiscordSendImage(ctx, args),
    ),

    // ─── Contact identity lookup ────────────────────────────────────
    tool(
      'corvid_lookup_contact',
      'Look up a contact by name or platform identifier to resolve cross-platform identities. ' +
        'Returns the contact with all linked platform identifiers (Discord, AlgoChat, GitHub).',
      {
        name: z.string().optional().describe('Display name to look up'),
        platform: z
          .enum(['discord', 'algochat', 'github'])
          .optional()
          .describe('Platform to search by (requires platform_id)'),
        platform_id: z.string().optional().describe('Platform-specific identifier (requires platform)'),
      },
      async (args) => handleLookupContact(ctx, args),
    ),

    // ─── Browser automation ─────────────────────────────────────────
    ...(ctx.browserService
      ? [
          tool(
            'corvid_browser',
            'Perform browser automation using a real Chrome browser. ' +
              'Always call tabs_context first to see open tabs, then tabs_create to open a new tab. ' +
              'Actions: tabs_context, tabs_create, close_tab, navigate, get_page_text, read_page, ' +
              'find, click, type, press, scroll, form_input, javascript, screenshot, wait.',
            {
              action: z
                .enum([
                  'tabs_context',
                  'tabs_create',
                  'close_tab',
                  'navigate',
                  'get_page_text',
                  'read_page',
                  'find',
                  'click',
                  'type',
                  'press',
                  'scroll',
                  'form_input',
                  'javascript',
                  'screenshot',
                  'wait',
                ])
                .describe('Browser action to perform'),
              tab_id: z.number().optional().describe('Tab ID (from tabs_context). Required for most actions.'),
              url: z.string().optional().describe('URL for navigate or tabs_create'),
              query: z.string().optional().describe('CSS selector or text to search for (find action)'),
              selector: z.string().optional().describe('CSS selector for click, type, form_input, read_page, wait'),
              code: z.string().optional().describe('JavaScript code to execute (javascript action)'),
              text: z.string().optional().describe('Text to type (type action)'),
              key: z.string().optional().describe('Key to press, e.g. "Enter", "Tab" (press action)'),
              value: z.string().optional().describe('Value for form_input'),
              direction: z.enum(['up', 'down']).optional().describe('Scroll direction (default: down)'),
              amount: z.number().optional().describe('Scroll amount in pixels (default: 500)'),
              x: z.number().optional().describe('X coordinate for click'),
              y: z.number().optional().describe('Y coordinate for click'),
              full_page: z.boolean().optional().describe('Take full-page screenshot (default: false)'),
              max_length: z.number().optional().describe('Max chars for read_page (default: 50000)'),
              ms: z.number().optional().describe('Wait duration in ms (wait action)'),
            },
            async (args) => handleBrowser(ctx, args),
          ),
        ]
      : []),
  ];

  // Merge plugin tools if provided
  if (pluginTools && pluginTools.length > 0) {
    tools.push(...pluginTools);
  }

  // Local (web) sessions get all tools — permission scoping only applies to
  // remote sessions (algochat, agent-to-agent) where untrusted input is possible.
  let filteredTools = tools;
  if (ctx.sessionSource !== 'web') {
    // Prefer pre-resolved permissions (includes skill bundle merging)
    const permissions =
      ctx.resolvedToolPermissions !== undefined
        ? ctx.resolvedToolPermissions
        : (getAgent(ctx.db, ctx.agentId)?.mcpToolPermissions ?? null);
    const allowedSet = resolveAllowedTools(permissions);
    filteredTools = tools.filter((t) => allowedSet.has(t.name));
  }

  // Scheduler-initiated sessions: tiered tool gating based on action type
  if (ctx.schedulerMode) {
    filteredTools = filteredTools.filter((t) => !isToolBlockedForScheduler(t.name, ctx.schedulerActionType));
  }

  // Tool guardrails: hide expensive networking tools from sessions that don't need them.
  // This prevents small models from autonomously attempting agent-to-agent networking (#1054).
  const toolAccessConfig: ToolAccessConfig = ctx.toolAccessConfig ?? {
    policy: resolveToolAccessPolicy(ctx.sessionSource),
  };
  filteredTools = filterToolsByGuardrail(filteredTools, toolAccessConfig);

  return createSdkMcpServer({
    name: 'corvid-agent-tools',
    version: '1.0.0',
    tools: filteredTools,
  });
}
