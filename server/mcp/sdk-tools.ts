import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { McpToolContext } from './tool-handlers';
import { handleSendMessage, handleSaveMemory, handleRecallMemory, handleListAgents, handleCreateWorkTask, handleExtendTimeout, handleCheckCredits, handleGrantCredits, handleCreditConfig } from './tool-handlers';
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
]);

/** Tools that require an explicit grant in mcp_tool_permissions. */
// corvid_grant_credits, corvid_credit_config

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
            'Save a private encrypted note to your memory. ' +
            'Memories persist across sessions and are stored on-chain for audit. ' +
            'Use a descriptive key for easy recall later.',
            {
                key: z.string().describe('A short descriptive key for this memory (e.g. "user-preferences", "project-status")'),
                content: z.string().describe('The content to remember'),
            },
            async (args) => handleSaveMemory(ctx, args),
        ),
        tool(
            'corvid_recall_memory',
            'Recall previously saved memories. ' +
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
    ];

    // Filter tools by agent's mcp_tool_permissions
    const agent = getAgent(ctx.db, ctx.agentId);
    const permissions = agent?.mcpToolPermissions;
    const allowedSet = permissions ? new Set(permissions) : DEFAULT_ALLOWED_TOOLS;
    const filteredTools = tools.filter((t) => allowedSet.has(t.name));

    return createSdkMcpServer({
        name: 'corvid-agent-tools',
        version: '1.0.0',
        tools: filteredTools,
    });
}
