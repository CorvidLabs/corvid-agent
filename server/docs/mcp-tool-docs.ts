/**
 * Generates documentation for MCP tools by extracting registered tool
 * definitions from the SDK tools module.
 *
 * Since MCP tools are registered programmatically via `server.tool()`,
 * we read the tool metadata from a discoverable format.
 */

export interface McpToolDoc {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
}

/**
 * Returns a static list of MCP tool documentation.
 * These are the corvid_* tools available to agents via MCP.
 */
export function getMcpToolDocs(): McpToolDoc[] {
    return [
        // Messaging
        { name: 'corvid_send_message', description: 'Send a message to another agent and wait for their response' },
        { name: 'corvid_list_agents', description: 'List all registered agents and their configuration' },

        // Memory
        { name: 'corvid_save_memory', description: 'Save a key-value memory on-chain via AlgoChat' },
        { name: 'corvid_recall_memory', description: 'Recall saved memories by key or semantic search' },

        // Session
        { name: 'corvid_extend_timeout', description: 'Extend the current session timeout' },

        // Credits
        { name: 'corvid_check_credits', description: 'Check credit balance for an agent' },
        { name: 'corvid_grant_credits', description: 'Grant credits to an agent (requires explicit permission)' },
        { name: 'corvid_credit_config', description: 'View or update credit configuration (requires explicit permission)' },

        // Automation
        { name: 'corvid_create_work_task', description: 'Create a work task (branch + PR workflow)' },
        { name: 'corvid_manage_schedule', description: 'Create, update, delete, or list scheduled tasks' },
        { name: 'corvid_manage_workflow', description: 'Create, update, delete, or trigger DAG-based workflows' },
        { name: 'corvid_launch_council', description: 'Launch a multi-agent council deliberation' },

        // Web
        { name: 'corvid_web_search', description: 'Search the web using Brave Search API' },
        { name: 'corvid_deep_research', description: 'Multi-angle deep research on a topic' },

        // Discovery (A2A)
        { name: 'corvid_discover_agent', description: 'Discover a remote agent via A2A protocol' },
        { name: 'corvid_invoke_remote_agent', description: 'Invoke a remote agent via A2A protocol' },

        // Owner communication
        { name: 'corvid_notify_owner', description: 'Send a notification to the owner via configured channels' },
        { name: 'corvid_ask_owner', description: 'Ask the owner a question with optional choices, wait for response' },
        { name: 'corvid_configure_notifications', description: 'Configure notification channels for an agent' },

        // GitHub
        { name: 'corvid_github_star_repo', description: 'Star a GitHub repository' },
        { name: 'corvid_github_unstar_repo', description: 'Unstar a GitHub repository' },
        { name: 'corvid_github_fork_repo', description: 'Fork a GitHub repository' },
        { name: 'corvid_github_list_prs', description: 'List pull requests for a repository' },
        { name: 'corvid_github_create_pr', description: 'Create a pull request on a GitHub repository' },
        { name: 'corvid_github_review_pr', description: 'Submit a review on a pull request' },
        { name: 'corvid_github_get_pr_diff', description: 'Get the diff for a pull request' },
        { name: 'corvid_github_comment_on_pr', description: 'Comment on a pull request' },
        { name: 'corvid_github_create_issue', description: 'Create an issue on a GitHub repository' },
        { name: 'corvid_github_list_issues', description: 'List issues for a repository' },
        { name: 'corvid_github_repo_info', description: 'Get details about a GitHub repository' },
        { name: 'corvid_github_follow_user', description: 'Follow a GitHub user' },

        // Reputation
        { name: 'corvid_check_reputation', description: 'Check reputation score for an agent' },
        { name: 'corvid_check_health_trends', description: 'Check health trends and codebase metrics' },
        { name: 'corvid_publish_attestation', description: 'Publish a reputation attestation on-chain' },
        { name: 'corvid_verify_agent_reputation', description: 'Verify an agent reputation via on-chain attestations' },

        // Code understanding
        { name: 'corvid_code_symbols', description: 'Extract AST symbols (functions, classes, imports) from source files' },
        { name: 'corvid_find_references', description: 'Find cross-file references to a symbol' },

        // Admin
        { name: 'corvid_repo_blocklist', description: 'Manage the repository blocklist (add, remove, list blocked repos)' },
    ];
}
