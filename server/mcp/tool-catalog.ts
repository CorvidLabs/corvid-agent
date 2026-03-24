/**
 * Tool catalog — structured metadata for all MCP tools.
 *
 * Provides a discoverable, categorized view of available tools
 * for API endpoints, Discord commands, and agent-to-agent discovery.
 */

export interface ToolCatalogEntry {
    name: string;
    description: string;
    category: string;
    /** True if the tool requires special services (AST parser, browser, etc.) */
    conditional?: boolean;
    /** True if the tool requires an explicit grant (not in default set) */
    restricted?: boolean;
}

export type ToolCategory = {
    name: string;
    label: string;
    description: string;
};

export const TOOL_CATEGORIES: ToolCategory[] = [
    { name: 'communication', label: 'Communication & Memory', description: 'Send messages, save/recall memories, manage on-chain storage' },
    { name: 'agents', label: 'Agent Management', description: 'List agents, discover remote agents, launch councils, manage contacts' },
    { name: 'work', label: 'Session & Work', description: 'Manage sessions, credits, projects, work tasks, schedules, and workflows' },
    { name: 'research', label: 'Research', description: 'Web search, deep research, browser automation' },
    { name: 'github', label: 'GitHub', description: 'Star, fork, PRs, issues, reviews, and repo management' },
    { name: 'notifications', label: 'Notifications & Reputation', description: 'Owner notifications, reputation scoring, attestations' },
    { name: 'code', label: 'Code Tools', description: 'AST navigation, file operations, repo blocklist' },
];

/**
 * Static catalog of all MCP tools with category assignments.
 * Descriptions are kept short here — one-liners for catalog display.
 */
export const TOOL_CATALOG: ToolCatalogEntry[] = [
    // ── Communication & Memory ──────────────────────────────────────────
    { name: 'corvid_send_message', description: 'Send a message to another agent and wait for response', category: 'communication' },
    { name: 'corvid_save_memory', description: 'Save a memory to long-term on-chain storage with local cache', category: 'communication' },
    { name: 'corvid_recall_memory', description: 'Recall memories by key, query, or list recent', category: 'communication' },
    { name: 'corvid_delete_memory', description: 'Delete (forget) an on-chain ARC-69 memory', category: 'communication' },
    { name: 'corvid_read_on_chain_memories', description: 'Read memories directly from Algorand blockchain', category: 'communication' },
    { name: 'corvid_sync_on_chain_memories', description: 'Sync on-chain memories back to local SQLite cache', category: 'communication' },

    // ── Agent Management ─────────────────────────────────────────────────
    { name: 'corvid_list_agents', description: 'List all available agents with names, IDs, and wallets', category: 'agents' },
    { name: 'corvid_discover_agent', description: 'Fetch a remote agent\'s A2A Agent Card for capabilities', category: 'agents' },
    { name: 'corvid_invoke_remote_agent', description: 'Send a task to a remote A2A agent and wait for result', category: 'agents' },
    { name: 'corvid_launch_council', description: 'Launch a multi-agent council deliberation on a topic', category: 'agents', conditional: true },
    { name: 'corvid_flock_directory', description: 'Manage the on-chain Flock Directory agent registry', category: 'agents' },
    { name: 'corvid_lookup_contact', description: 'Look up a contact by name or platform identifier', category: 'agents' },

    // ── Session & Work ───────────────────────────────────────────────────
    { name: 'corvid_extend_timeout', description: 'Request more time for your current session', category: 'work' },
    { name: 'corvid_check_credits', description: 'Check credit balance for a wallet address', category: 'work' },
    { name: 'corvid_grant_credits', description: 'Grant free credits to a wallet address', category: 'work', restricted: true },
    { name: 'corvid_credit_config', description: 'View or update credit system configuration', category: 'work', restricted: true },
    { name: 'corvid_list_projects', description: 'List all available projects with IDs and directories', category: 'work' },
    { name: 'corvid_current_project', description: 'Show the current agent\'s default project', category: 'work' },
    { name: 'corvid_create_work_task', description: 'Create a work task that spawns a new agent session on a branch', category: 'work', conditional: true },
    { name: 'corvid_check_work_status', description: 'Check the status of a work task by ID', category: 'work', conditional: true },
    { name: 'corvid_list_work_tasks', description: 'List work tasks, optionally filtered by status', category: 'work', conditional: true },
    { name: 'corvid_manage_schedule', description: 'Manage automated cron/interval schedules for this agent', category: 'work' },
    { name: 'corvid_manage_workflow', description: 'Manage graph-based workflows for multi-step orchestration', category: 'work' },

    // ── Research ──────────────────────────────────────────────────────────
    { name: 'corvid_web_search', description: 'Search the web using Brave Search', category: 'research' },
    { name: 'corvid_deep_research', description: 'Research a topic in depth with multi-angle search', category: 'research' },
    { name: 'corvid_browser', description: 'Browser automation with real Chrome (navigate, click, type, screenshot)', category: 'research', conditional: true },

    // ── GitHub ────────────────────────────────────────────────────────────
    { name: 'corvid_github_star_repo', description: 'Star a GitHub repository', category: 'github' },
    { name: 'corvid_github_unstar_repo', description: 'Remove a star from a GitHub repository', category: 'github' },
    { name: 'corvid_github_fork_repo', description: 'Fork a GitHub repository', category: 'github' },
    { name: 'corvid_github_list_prs', description: 'List open pull requests for a repository', category: 'github' },
    { name: 'corvid_github_create_pr', description: 'Create a pull request', category: 'github' },
    { name: 'corvid_github_review_pr', description: 'Submit a review on a pull request', category: 'github' },
    { name: 'corvid_github_create_issue', description: 'Create a new issue on a repository', category: 'github' },
    { name: 'corvid_github_list_issues', description: 'List issues for a repository', category: 'github' },
    { name: 'corvid_github_repo_info', description: 'Get repository info (stars, forks, description)', category: 'github' },
    { name: 'corvid_github_get_pr_diff', description: 'Get the full diff for a pull request', category: 'github' },
    { name: 'corvid_github_comment_on_pr', description: 'Add a comment to a pull request', category: 'github' },
    { name: 'corvid_github_follow_user', description: 'Follow a GitHub user', category: 'github' },

    // ── Discord messaging ──────────────────────────────────────────────────────
    { name: 'corvid_discord_send_message', description: 'Send a message to a Discord channel', category: 'notifications' },
    { name: 'corvid_discord_send_image', description: 'Send an image to a Discord channel', category: 'notifications' },

    // ── Notifications & Reputation ────────────────────────────────────────
    { name: 'corvid_notify_owner', description: 'Send a notification to the server owner', category: 'notifications' },
    { name: 'corvid_ask_owner', description: 'Ask the owner a question and wait for response', category: 'notifications' },
    { name: 'corvid_configure_notifications', description: 'Manage notification channels (Discord, Telegram, GitHub, etc.)', category: 'notifications' },
    { name: 'corvid_check_reputation', description: 'Check reputation score and trust level', category: 'notifications' },
    { name: 'corvid_check_health_trends', description: 'View codebase health metric trends', category: 'notifications' },
    { name: 'corvid_publish_attestation', description: 'Publish a cryptographic reputation attestation on-chain', category: 'notifications' },
    { name: 'corvid_verify_agent_reputation', description: 'Verify a remote agent\'s on-chain reputation', category: 'notifications' },

    // ── Code Tools ────────────────────────────────────────────────────────
    { name: 'corvid_code_symbols', description: 'Search for code symbols using AST parsing', category: 'code', conditional: true },
    { name: 'corvid_find_references', description: 'Find all references to a symbol across the project', category: 'code', conditional: true },
    { name: 'corvid_repo_blocklist', description: 'Manage the repo blocklist (block/unblock repos)', category: 'code' },
    { name: 'read_file', description: 'Read a file from the project', category: 'code' },
    { name: 'write_file', description: 'Write content to a file', category: 'code' },
    { name: 'edit_file', description: 'Edit a file with targeted replacements', category: 'code' },
    { name: 'run_command', description: 'Execute a shell command', category: 'code' },
    { name: 'list_files', description: 'List files in a directory', category: 'code' },
    { name: 'search_files', description: 'Search file contents with regex', category: 'code' },
];

/** Get the full catalog, optionally filtered by category. */
export function getToolCatalog(category?: string): { categories: ToolCategory[]; tools: ToolCatalogEntry[] } {
    const tools = category
        ? TOOL_CATALOG.filter(t => t.category === category)
        : TOOL_CATALOG;
    return { categories: TOOL_CATEGORIES, tools };
}

/** Get a catalog summary grouped by category. */
export function getToolCatalogGrouped(): { category: ToolCategory; tools: ToolCatalogEntry[] }[] {
    return TOOL_CATEGORIES.map(cat => ({
        category: cat,
        tools: TOOL_CATALOG.filter(t => t.category === cat.name),
    }));
}
