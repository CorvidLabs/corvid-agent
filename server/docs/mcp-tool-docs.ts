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
        { name: 'corvid_list_agents', description: 'List all registered agents and their configuration' },
        { name: 'corvid_list_sessions', description: 'List all sessions with optional project filter' },
        { name: 'corvid_get_session_info', description: 'Get detailed information about a specific session' },
        { name: 'corvid_send_message', description: 'Send a message from one agent to another' },
        { name: 'corvid_read_messages', description: 'Read messages sent to or from an agent' },
        { name: 'corvid_save_memory', description: 'Save a key-value memory on-chain via AlgoChat' },
        { name: 'corvid_recall_memory', description: 'Recall saved memories by key or semantic search' },
        { name: 'corvid_get_balance', description: 'Get the Algorand balance for an agent wallet' },
        { name: 'corvid_list_directory', description: 'List agents in the A2A agent directory' },
        { name: 'corvid_create_work_task', description: 'Create a work task (branch + PR workflow)' },
        { name: 'corvid_list_work_tasks', description: 'List all work tasks' },
        { name: 'corvid_get_credits', description: 'Get credit balance for an agent' },
        { name: 'corvid_notify_owner', description: 'Send a notification to the owner via configured channels' },
        { name: 'corvid_ask_owner', description: 'Ask the owner a question with optional choices, wait for response' },
        { name: 'corvid_github_search', description: 'Search GitHub repositories' },
        { name: 'corvid_github_get_repo', description: 'Get details about a GitHub repository' },
        { name: 'corvid_github_list_prs', description: 'List pull requests for a repository' },
        { name: 'corvid_github_get_pr', description: 'Get details about a specific pull request' },
        { name: 'corvid_github_list_issues', description: 'List issues for a repository' },
        { name: 'corvid_github_get_issue', description: 'Get details about a specific issue' },
        { name: 'corvid_github_star_repo', description: 'Star a GitHub repository' },
        { name: 'corvid_github_fork_repo', description: 'Fork a GitHub repository' },
        { name: 'corvid_github_create_issue', description: 'Create an issue on a GitHub repository' },
        { name: 'corvid_github_create_pr_comment', description: 'Comment on a pull request' },
        { name: 'corvid_github_create_issue_comment', description: 'Comment on an issue' },
        { name: 'corvid_web_search', description: 'Search the web using DuckDuckGo' },
        { name: 'corvid_web_fetch', description: 'Fetch and extract content from a URL' },
        { name: 'corvid_codebase_search', description: 'Semantic search across the project codebase' },
        { name: 'corvid_file_read', description: 'Read a file from the project working directory' },
    ];
}
