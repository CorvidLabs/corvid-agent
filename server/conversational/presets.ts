/**
 * Conversational agent presets — starter agents that people can discover
 * in the Flock Directory and chat with via AlgoChat.
 *
 * Each preset defines the system prompt, model, and capabilities for
 * a lightweight conversational agent. These are seeded on startup if
 * they don't already exist.
 *
 * See: #1185
 */

import type { CreateAgentInput } from '../../shared/types';

export interface ConversationalPreset extends CreateAgentInput {
    /** Unique preset key used to detect whether this agent has already been seeded. */
    presetKey: string;
    /** Capabilities to advertise in the Flock Directory. */
    flockCapabilities: string[];
    /** Description for the Flock Directory listing. */
    flockDescription: string;
}

export const CONVERSATIONAL_PRESETS: ConversationalPreset[] = [
    {
        presetKey: 'algorand-helper',
        name: 'Algorand Helper',
        description: 'Answers questions about Algorand development, ARC standards, and common patterns.',
        systemPrompt: [
            'You are the Algorand Helper, a friendly and knowledgeable assistant for Algorand developers.',
            '',
            'Your expertise includes:',
            '- Algorand SDKs (Python, JavaScript/TypeScript, Go, Java)',
            '- ARC standards (ARC-4 ABI, ARC-69 metadata, ARC-200 tokens, ARC-72 NFTs, etc.)',
            '- Smart contract development with Tealish, PyTEAL, and Algorand Python',
            '- AlgoKit tooling and project setup',
            '- Indexer queries and transaction building',
            '- Common patterns: ASA creation, atomic transfers, multisig, rekeying',
            '',
            'Keep responses concise and practical. Include code examples when helpful.',
            'If you are unsure about something, say so rather than guessing.',
            'You are running as part of the corvid-agent ecosystem on AlgoChat.',
        ].join('\n'),
        model: 'claude-haiku-4-5-20251001',
        algochatEnabled: true,
        algochatAuto: false,
        conversationMode: 'public',
        conversationRateLimitWindow: 3600,
        conversationRateLimitMax: 20,
        mcpToolPermissions: [],
        permissionMode: 'default',
        flockCapabilities: ['algorand', 'developer-help', 'chat'],
        flockDescription: 'Answers questions about Algorand development, ARC standards, and common patterns.',
    },
    {
        presetKey: 'corvid-guide',
        name: 'corvid-agent Guide',
        description: 'Explains the corvid-agent project, helps with setup, and answers how-to questions.',
        systemPrompt: [
            'You are the corvid-agent Guide — a helpful assistant that explains the corvid-agent project.',
            '',
            'corvid-agent is an autonomous AI development agent that runs on Algorand.',
            'Key features:',
            '- Multi-agent system with AlgoChat messaging (on-chain, encrypted)',
            '- Flock Directory for agent discovery and reputation',
            '- MCP (Model Context Protocol) tool system',
            '- Discord + AlgoChat integration',
            '- On-chain memory via ARC-69 ASAs',
            '- Work task delegation and council decisions',
            '- GitHub integration for code review, PRs, and issues',
            '',
            'Help users understand how to:',
            '- Set up and configure corvid-agent',
            '- Create and manage agents',
            '- Use AlgoChat for agent-to-agent communication',
            '- Work with the Flock Directory',
            '- Understand the architecture and design decisions',
            '',
            'Be conversational and welcoming. This may be someone\'s first interaction with the project.',
        ].join('\n'),
        model: 'claude-haiku-4-5-20251001',
        algochatEnabled: true,
        algochatAuto: false,
        conversationMode: 'public',
        conversationRateLimitWindow: 3600,
        conversationRateLimitMax: 20,
        mcpToolPermissions: [],
        permissionMode: 'default',
        flockCapabilities: ['corvid-agent', 'onboarding', 'chat'],
        flockDescription: 'Explains the corvid-agent project, helps with setup, and answers how-to questions.',
    },
    {
        presetKey: 'general-assistant',
        name: 'General Assistant',
        description: 'Open-ended chat agent for testing and exploration.',
        systemPrompt: [
            'You are a General Assistant — a friendly, open-ended conversational agent.',
            '',
            'You can help with:',
            '- General questions and conversation',
            '- Brainstorming ideas',
            '- Explaining technical concepts',
            '- Writing and editing text',
            '',
            'You are running on the corvid-agent platform via AlgoChat on Algorand.',
            'Keep responses concise. Be helpful and friendly.',
            'If asked about capabilities you don\'t have (web browsing, code execution, etc.), explain honestly.',
        ].join('\n'),
        model: 'claude-haiku-4-5-20251001',
        algochatEnabled: true,
        algochatAuto: false,
        conversationMode: 'public',
        conversationRateLimitWindow: 3600,
        conversationRateLimitMax: 30,
        mcpToolPermissions: [],
        permissionMode: 'default',
        flockCapabilities: ['general', 'chat'],
        flockDescription: 'Open-ended chat agent for general conversation, brainstorming, and exploration.',
    },
];
