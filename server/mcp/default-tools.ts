/**
 * Canonical list of default tools available to all agents when mcp_tool_permissions is NULL.
 *
 * This is the union of tools from both backends (sdk-tools and direct-tools).
 * Imported by skill-bundles.ts so that resolveAgentTools / resolveProjectTools
 * can properly merge bundle tools WITH defaults instead of replacing them.
 */
export const DEFAULT_CORE_TOOLS: readonly string[] = [
  // ── Communication & Memory ──────────────────────────────────────────────
  'corvid_send_message',
  'corvid_save_memory',
  'corvid_recall_memory',
  'corvid_delete_memory',
  'corvid_read_on_chain_memories',
  'corvid_sync_on_chain_memories',

  // ── Shared Library (CRVLIB) ─────────────────────────────────────────────
  'corvid_library_write',
  'corvid_library_read',
  'corvid_library_list',
  'corvid_library_delete',

  // ── Agent management ────────────────────────────────────────────────────
  'corvid_list_agents',
  'corvid_discover_agent',
  'corvid_invoke_remote_agent',
  'corvid_launch_council',
  'corvid_flock_directory',
  'corvid_lookup_contact',

  // ── Session & work ──────────────────────────────────────────────────────
  'corvid_extend_timeout',
  'corvid_restart_server',
  'corvid_check_credits',
  'corvid_list_projects',
  'corvid_current_project',
  'corvid_create_work_task',
  'corvid_check_work_status',
  'corvid_list_work_tasks',
  'corvid_manage_schedule',
  'corvid_manage_workflow',

  // ── Research ─────────────────────────────────────────────────────────────
  'corvid_web_search',
  'corvid_deep_research',
  'corvid_browser',

  // ── GitHub ───────────────────────────────────────────────────────────────
  'corvid_github_star_repo',
  'corvid_github_unstar_repo',
  'corvid_github_fork_repo',
  'corvid_github_list_prs',
  'corvid_github_create_pr',
  'corvid_github_review_pr',
  'corvid_github_create_issue',
  'corvid_github_list_issues',
  'corvid_github_repo_info',
  'corvid_github_get_pr_diff',
  'corvid_github_comment_on_pr',
  'corvid_github_follow_user',

  // ── Discord messaging ──────────────────────────────────────────────────────
  'corvid_discord_send_message',
  'corvid_discord_send_image',

  // ── Notifications & reputation ───────────────────────────────────────────
  'corvid_notify_owner',
  'corvid_ask_owner',
  'corvid_configure_notifications',
  'corvid_check_reputation',
  'corvid_check_health_trends',
  'corvid_publish_attestation',
  'corvid_verify_agent_reputation',

  // ── Code tools (direct-tools backend) ────────────────────────────────────
  'corvid_code_symbols',
  'corvid_find_references',
  'corvid_repo_blocklist',
  'read_file',
  'write_file',
  'edit_file',
  'run_command',
  'list_files',
  'search_files',
] as const;
