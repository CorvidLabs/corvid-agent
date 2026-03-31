/**
 * Tool category definitions for CLI `--tools` flag.
 *
 * Users can specify categories (e.g. `--tools github,code`) or individual
 * tool names. The resolver expands categories into concrete tool name lists.
 */

/** Map of category name → tool names. */
export const TOOL_CATEGORIES: Record<string, readonly string[]> = {
    github: [
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
    ],
    memory: [
        'corvid_save_memory',
        'corvid_promote_memory',
        'corvid_recall_memory',
        'corvid_delete_memory',
        'corvid_read_on_chain_memories',
        'corvid_sync_on_chain_memories',
    ],
    code: [
        'read_file',
        'write_file',
        'edit_file',
        'run_command',
        'list_files',
        'search_files',
        'corvid_code_symbols',
        'corvid_find_references',
    ],
    messaging: [
        'corvid_send_message',
        'corvid_list_agents',
    ],
    work: [
        'corvid_create_work_task',
        'corvid_check_work_status',
        'corvid_list_work_tasks',
        'corvid_manage_schedule',
        'corvid_manage_workflow',
    ],
    web: [
        'corvid_web_search',
        'corvid_deep_research',
    ],
};

/** All known category names. */
export const CATEGORY_NAMES = Object.keys(TOOL_CATEGORIES);

/**
 * Resolve a comma-separated list of tool specifiers (categories or individual
 * tool names) into a flat array of tool names.
 *
 * - `"all"` returns `undefined` (meaning: no restriction, use all defaults).
 * - `"none"` returns `[]` (no tools at all).
 * - `"github,code"` expands to the union of those category tools.
 * - `"corvid_web_search,read_file"` passes through individual names.
 * - Mix of categories and names is allowed: `"github,read_file"`.
 */
export function resolveToolSpecifiers(specifiers: string): string[] | undefined {
    const parts = specifiers.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (parts.includes('all')) return undefined;
    if (parts.includes('none')) return [];

    const result = new Set<string>();
    for (const part of parts) {
        const category = TOOL_CATEGORIES[part];
        if (category) {
            for (const tool of category) result.add(tool);
        } else {
            // Treat as individual tool name
            result.add(part);
        }
    }
    return [...result];
}
