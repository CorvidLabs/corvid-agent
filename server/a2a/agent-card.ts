/**
 * A2A Protocol Agent Card builder.
 *
 * Generates an A2A-compliant Agent Card JSON document that describes
 * this agent's capabilities, skills, and supported protocols.
 *
 * Skills are auto-generated from registered MCP tools in sdk-tools.ts.
 */

import type { Database } from 'bun:sqlite';
import type {
    A2AAgentCard,
    A2AAgentSkill,
    A2AProtocolExtension,
    Agent,
} from '../../shared/types';
import { getPersona } from '../db/personas';
import { getAgentBundles } from '../db/skill-bundles';

// Package version is read once at module load time
const PKG_VERSION = (() => {
    try {
        const pkg = require('../../package.json');
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
})();

// ---------------------------------------------------------------------------
// Tool-to-skill mapping
// ---------------------------------------------------------------------------

/** Tag categories for MCP tools based on naming convention. */
const TOOL_TAG_MAP: Record<string, string[]> = {
    corvid_send_message:       ['messaging', 'communication'],
    corvid_save_memory:        ['memory', 'blockchain'],
    corvid_recall_memory:      ['memory', 'blockchain'],
    corvid_list_agents:        ['discovery', 'agents'],
    corvid_extend_timeout:     ['session', 'management'],
    corvid_check_credits:      ['credits', 'billing'],
    corvid_grant_credits:      ['credits', 'billing', 'admin'],
    corvid_credit_config:      ['credits', 'billing', 'admin'],
    corvid_create_work_task:   ['development', 'automation'],
    corvid_manage_schedule:    ['automation', 'scheduling'],
    corvid_web_search:         ['search', 'web'],
    corvid_deep_research:      ['search', 'research'],
    corvid_discover_agent:     ['discovery', 'a2a'],
    corvid_github_star_repo:   ['github', 'social'],
    corvid_github_unstar_repo: ['github', 'social'],
    corvid_github_fork_repo:   ['github', 'repository'],
    corvid_github_list_prs:    ['github', 'pull-requests'],
    corvid_github_create_pr:   ['github', 'pull-requests'],
    corvid_github_review_pr:   ['github', 'pull-requests', 'review'],
    corvid_github_create_issue: ['github', 'issues'],
    corvid_github_list_issues: ['github', 'issues'],
    corvid_github_repo_info:   ['github', 'repository'],
    corvid_github_get_pr_diff: ['github', 'pull-requests', 'review'],
    corvid_github_comment_on_pr: ['github', 'pull-requests', 'communication'],
    corvid_github_follow_user: ['github', 'social'],
    corvid_check_reputation: ['reputation', 'trust'],
    corvid_check_health_trends: ['health', 'monitoring'],
    corvid_publish_attestation: ['reputation', 'blockchain'],
    corvid_verify_agent_reputation: ['reputation', 'trust', 'blockchain'],
    corvid_invoke_remote_agent: ['a2a', 'communication'],
};

/** Tool descriptions used when building skills. Matches sdk-tools.ts. */
const TOOL_DESCRIPTIONS: Record<string, string> = {
    corvid_send_message:       'Send a message to another agent and wait for their response.',
    corvid_save_memory:        'Save an encrypted memory on the Algorand blockchain.',
    corvid_recall_memory:      'Recall previously saved on-chain memories.',
    corvid_list_agents:        'List all available agents for communication.',
    corvid_extend_timeout:     'Request more time for the current session.',
    corvid_check_credits:      'Check credit balance for a wallet address.',
    corvid_grant_credits:      'Grant free credits to a wallet address.',
    corvid_credit_config:      'View or update credit system configuration.',
    corvid_create_work_task:   'Create a work task that spawns a coding session on a dedicated branch.',
    corvid_manage_schedule:    'Manage automated schedules (cron/interval) for agent actions.',
    corvid_web_search:         'Search the web for current information using Brave Search.',
    corvid_deep_research:      'Research a topic in depth with multiple search queries.',
    corvid_discover_agent:     'Discover a remote agent by fetching its A2A Agent Card.',
    corvid_github_star_repo:   'Star a GitHub repository.',
    corvid_github_unstar_repo: 'Remove a star from a GitHub repository.',
    corvid_github_fork_repo:   'Fork a GitHub repository.',
    corvid_github_list_prs:    'List open pull requests for a GitHub repository.',
    corvid_github_create_pr:   'Create a pull request on a GitHub repository.',
    corvid_github_review_pr:   'Submit a review on a pull request.',
    corvid_github_create_issue: 'Create a new issue on a GitHub repository.',
    corvid_github_list_issues: 'List issues for a GitHub repository.',
    corvid_github_repo_info:   'Get information about a GitHub repository.',
    corvid_github_get_pr_diff: 'Get the full diff/patch for a pull request.',
    corvid_github_comment_on_pr: 'Add a comment to a pull request.',
    corvid_github_follow_user: 'Follow a GitHub user.',
    corvid_check_reputation: 'Check reputation score and trust level for an agent.',
    corvid_check_health_trends: 'View codebase health metric trends over improvement cycles.',
    corvid_publish_attestation: 'Publish a reputation attestation hash on Algorand.',
    corvid_verify_agent_reputation: 'Verify a remote agent\'s on-chain reputation attestations.',
    corvid_invoke_remote_agent: 'Send a task to a remote A2A agent and get the result.',
};

/** Convert a tool name like "corvid_github_star_repo" to "GitHub Star Repo". */
function humanReadableName(toolName: string): string {
    return toolName
        .replace(/^corvid_/, '')
        .split('_')
        .map((word) => {
            // Capitalize special acronyms
            if (word === 'github') return 'GitHub';
            if (word === 'pr') return 'PR';
            if (word === 'prs') return 'PRs';
            if (word === 'a2a') return 'A2A';
            if (word === 'api') return 'API';
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

/** Build an A2AAgentSkill from a tool name. */
function toolToSkill(toolName: string): A2AAgentSkill {
    return {
        id: toolName,
        name: humanReadableName(toolName),
        description: TOOL_DESCRIPTIONS[toolName] ?? `Tool: ${toolName}`,
        tags: TOOL_TAG_MAP[toolName] ?? ['general'],
        inputModes: ['application/json'],
        outputModes: ['application/json', 'text/plain'],
    };
}

// ---------------------------------------------------------------------------
// Supported protocols (custom extension)
// ---------------------------------------------------------------------------

function getSupportedProtocols(baseUrl: string): A2AProtocolExtension[] {
    return [
        {
            protocol: 'A2A',
            description: 'Google A2A (Agent-to-Agent) protocol for agent interoperability',
            endpoint: `${baseUrl}/a2a/tasks/send`,
        },
        {
            protocol: 'AlgoChat',
            description: 'Algorand on-chain messaging for verifiable agent communication',
        },
        {
            protocol: 'MCP',
            description: 'Model Context Protocol for tool integration',
        },
        {
            protocol: 'HTTP',
            description: 'REST API for agent management and invocation',
            endpoint: `${baseUrl}/api`,
        },
    ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All known MCP tool names (default set). */
const DEFAULT_TOOL_NAMES = [
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
];

/**
 * Build the primary A2A Agent Card for this CorvidAgent instance.
 *
 * The card is dynamically generated from the server's configuration
 * and registered MCP tools.
 */
export function buildAgentCard(baseUrl?: string): A2AAgentCard {
    const port = parseInt(process.env.PORT ?? '3000', 10);
    const host = process.env.BIND_HOST || '127.0.0.1';
    const url = baseUrl ?? `http://${host}:${port}`;

    const skills = DEFAULT_TOOL_NAMES.map(toolToSkill);

    return {
        name: 'CorvidAgent',
        description:
            'AI development agent with on-chain identity, inter-agent messaging, and autonomous coding capabilities',
        url,
        provider: {
            organization: 'CorvidLabs',
            url: 'https://github.com/CorvidLabs',
        },
        version: PKG_VERSION,
        documentationUrl: 'https://github.com/CorvidLabs/corvid-agent',
        capabilities: {
            streaming: true, // WebSocket support exists
            pushNotifications: false,
            stateTransitionHistory: false,
        },
        authentication: {
            schemes: ['Bearer'],
        },
        defaultInputModes: ['text/plain', 'application/json'],
        defaultOutputModes: ['text/plain', 'application/json'],
        skills,
        supportedProtocols: getSupportedProtocols(url),
    };
}

/**
 * Build an A2A Agent Card for a specific agent in the database.
 *
 * Returns null if the agent is not found. The card is customized
 * with the agent's name, description, and wallet address.
 */
export function buildAgentCardForAgent(
    agent: Agent,
    baseUrl?: string,
    db?: Database,
): A2AAgentCard {
    const port = parseInt(process.env.PORT ?? '3000', 10);
    const host = process.env.BIND_HOST || '127.0.0.1';
    const url = baseUrl ?? `http://${host}:${port}`;

    // Use agent's specific tool permissions or fall back to defaults
    const toolNames = agent.mcpToolPermissions ?? DEFAULT_TOOL_NAMES;
    const skills = toolNames
        .filter((name) => TOOL_DESCRIPTIONS[name] || TOOL_TAG_MAP[name])
        .map(toolToSkill);

    // Enrich description with persona and skills if db is provided
    let enrichedDescription = agent.description || 'CorvidAgent instance';
    if (db) {
        const persona = getPersona(db, agent.id);
        if (persona && persona.archetype !== 'custom') {
            enrichedDescription += ` | Archetype: ${persona.archetype}`;
        }
        const bundles = getAgentBundles(db, agent.id);
        if (bundles.length > 0) {
            enrichedDescription += ` | Skills: ${bundles.map(b => b.name).join(', ')}`;
        }
    }

    return {
        name: agent.name,
        description: enrichedDescription,
        url: `${url}/api/agents/${agent.id}`,
        provider: {
            organization: 'CorvidLabs',
            url: 'https://github.com/CorvidLabs',
        },
        version: PKG_VERSION,
        documentationUrl: 'https://github.com/CorvidLabs/corvid-agent',
        capabilities: {
            streaming: true,
            pushNotifications: false,
            stateTransitionHistory: false,
        },
        authentication: {
            schemes: ['Bearer'],
        },
        defaultInputModes: ['text/plain', 'application/json'],
        defaultOutputModes: ['text/plain', 'application/json'],
        skills,
        supportedProtocols: [
            {
                protocol: 'AlgoChat',
                description: 'Algorand on-chain messaging',
                ...(agent.walletAddress ? { endpoint: `algo://${agent.walletAddress}` } : {}),
            },
            {
                protocol: 'HTTP',
                description: 'REST API for agent invocation',
                endpoint: `${url}/api/agents/${agent.id}/invoke`,
            },
        ],
    };
}
