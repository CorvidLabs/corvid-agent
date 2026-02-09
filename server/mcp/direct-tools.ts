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
} from './tool-handlers';
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
]);

/** Tools blocked during scheduler-initiated sessions. */
const SCHEDULER_BLOCKED_TOOLS = new Set([
    'corvid_send_message',
    'corvid_grant_credits',
    'corvid_credit_config',
]);

/** Convert a CallToolResult to our simple { text, isError } format. */
function unwrapResult(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }): { text: string; isError?: boolean } {
    const text = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('');
    return { text, isError: result.isError };
}

export function buildDirectTools(ctx: McpToolContext): DirectToolDefinition[] {
    const tools: DirectToolDefinition[] = [
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
            handler: async (args) => unwrapResult(await handleSendMessage(ctx, args as { to_agent: string; message: string; thread?: string })),
        },
        {
            name: 'corvid_save_memory',
            description: 'Save a private encrypted note to your memory. Memories persist across sessions.',
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', description: 'A short descriptive key for this memory' },
                    content: { type: 'string', description: 'The content to remember' },
                },
                required: ['key', 'content'],
            },
            handler: async (args) => unwrapResult(await handleSaveMemory(ctx, args as { key: string; content: string })),
        },
        {
            name: 'corvid_recall_memory',
            description: 'Recall previously saved memories. Provide a key for exact lookup, a query for search, or neither to list recent.',
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
            handler: async (args) => unwrapResult(await handleExtendTimeout(ctx, args as { minutes: number })),
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
            handler: async (args) => unwrapResult(await handleGrantCredits(ctx, args as { wallet_address: string; amount: number; reason?: string })),
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
    ];

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
            handler: async (args) => unwrapResult(await handleCreateWorkTask(ctx, args as { description: string; project_id?: string })),
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
        handler: async (args) => unwrapResult(await handleManageSchedule(ctx, args as Parameters<typeof handleManageSchedule>[1])),
    });

    // Permission filtering — same logic as sdk-tools.ts
    let filtered = tools;
    if (ctx.sessionSource !== 'web') {
        const agent = getAgent(ctx.db, ctx.agentId);
        const permissions = agent?.mcpToolPermissions;
        const allowedSet = permissions ? new Set(permissions) : DEFAULT_ALLOWED_TOOLS;
        filtered = filtered.filter((t) => allowedSet.has(t.name));
    }

    if (ctx.schedulerMode) {
        filtered = filtered.filter((t) => !SCHEDULER_BLOCKED_TOOLS.has(t.name));
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
