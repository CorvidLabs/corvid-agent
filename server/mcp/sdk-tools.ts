import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { McpToolContext } from './tool-handlers';
import { handleSendMessage, handleSaveMemory, handleRecallMemory, handleListAgents, handleCreateWorkTask } from './tool-handlers';

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

    return createSdkMcpServer({
        name: 'corvid-agent-tools',
        version: '1.0.0',
        tools,
    });
}
