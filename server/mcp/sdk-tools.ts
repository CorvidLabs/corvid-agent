import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { McpToolContext } from './tool-handlers';
import { handleSendMessage, handleSaveMemory, handleRecallMemory, handleListAgents, handleCreateWorkTask, handleExtendTimeout, handleCheckCredits, handleGrantCredits, handleCreditConfig, handleManageSchedule } from './tool-handlers';
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
]);

/** Tools that require an explicit grant in mcp_tool_permissions. */
// corvid_grant_credits, corvid_credit_config

/** Tools blocked during scheduler-initiated sessions to prevent financial/messaging side effects. */
const SCHEDULER_BLOCKED_TOOLS = new Set([
    'corvid_send_message',
    'corvid_grant_credits',
    'corvid_credit_config',
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
            'Actions include: star_repo, fork_repo, review_prs, work_task, council_launch, send_message, github_suggest, custom. ' +
            'Use action="list" to view schedules, "create" to make one, "pause"/"resume" to control, "history" for logs.',
            {
                action: z.enum(['list', 'create', 'pause', 'resume', 'history']).describe('What to do'),
                name: z.string().optional().describe('Schedule name (for create)'),
                description: z.string().optional().describe('Schedule description (for create)'),
                cron_expression: z.string().optional().describe('Cron expression e.g. "0 9 * * 1-5" for weekdays at 9am (for create)'),
                interval_minutes: z.number().optional().describe('Run every N minutes as alternative to cron (for create)'),
                schedule_actions: z.array(z.object({
                    type: z.string().describe('Action type: star_repo, fork_repo, review_prs, work_task, send_message, github_suggest, custom'),
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
