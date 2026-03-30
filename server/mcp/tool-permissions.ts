/** Tools available to all agents by default (when mcp_tool_permissions is NULL). */
export const DEFAULT_ALLOWED_TOOLS = new Set([
    'corvid_send_message',
    'corvid_save_memory',
    'corvid_promote_memory',
    'corvid_recall_memory',
    'corvid_delete_memory',
    'corvid_read_on_chain_memories',
    'corvid_sync_on_chain_memories',
    'corvid_library_write',
    'corvid_library_read',
    'corvid_library_list',
    'corvid_library_delete',
    'corvid_list_agents',
    'corvid_extend_timeout',
    'corvid_restart_server',
    'corvid_check_credits',
    'corvid_list_projects',
    'corvid_current_project',
    'corvid_create_work_task',
    'corvid_check_work_status',
    'corvid_list_work_tasks',
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
    'corvid_manage_workflow',
    'corvid_discord_send_message',
    'corvid_discord_send_image',
    'corvid_notify_owner',
    'corvid_ask_owner',
    'corvid_configure_notifications',
    'corvid_check_reputation',
    'corvid_check_health_trends',
    'corvid_publish_attestation',
    'corvid_verify_agent_reputation',
    'corvid_invoke_remote_agent',
    'corvid_code_symbols',
    'corvid_find_references',
    'corvid_repo_blocklist',
    'corvid_launch_council',
    'corvid_flock_directory',
    'corvid_lookup_contact',
    'corvid_browser',
]);

/**
 * Resolve which tools an agent is allowed to use.
 * - null/undefined → default set
 * - empty array → default set (empty [] is truthy but should not block all tools)
 * - non-empty array → only those tools
 */
export function resolveAllowedTools(permissions: string[] | null | undefined): Set<string> {
    return permissions && permissions.length > 0 ? new Set(permissions) : DEFAULT_ALLOWED_TOOLS;
}
