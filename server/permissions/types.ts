/**
 * Permission Broker types — capability-based security for agent actions.
 *
 * Actions follow a namespace:verb pattern (e.g. "git:create_pr", "msg:send").
 * A wildcard ("git:*") grants all actions in a namespace.
 * The special action "*" grants all capabilities (superuser).
 */

/** Action namespaces map to MCP tool groups. */
export type PermissionNamespace =
    | 'git'       // GitHub operations
    | 'msg'       // Messaging (AlgoChat, notifications)
    | 'credits'   // Credit grants/config
    | 'schedule'  // Schedule management
    | 'workflow'  // Workflow orchestration
    | 'work'      // Work task creation
    | 'search'    // Web search, deep research
    | 'agent'     // Agent discovery, remote invocation
    | 'fs'        // File system (coding tools)
    | 'repo'      // Repo blocklist management
    | 'reputation' // Reputation system
    | 'owner'     // Owner communication
    | 'council';  // Council governance operations

/** A permission action string: "namespace:verb", "namespace:*", or "*". */
export type PermissionAction = string;

/** Maps MCP tool names to their required permission action. */
export const TOOL_ACTION_MAP: Record<string, PermissionAction> = {
    // Git/GitHub
    corvid_github_star_repo: 'git:star',
    corvid_github_unstar_repo: 'git:unstar',
    corvid_github_fork_repo: 'git:fork',
    corvid_github_list_prs: 'git:read',
    corvid_github_create_pr: 'git:create_pr',
    corvid_github_review_pr: 'git:review_pr',
    corvid_github_create_issue: 'git:create_issue',
    corvid_github_list_issues: 'git:read',
    corvid_github_repo_info: 'git:read',
    corvid_github_get_pr_diff: 'git:read',
    corvid_github_comment_on_pr: 'git:comment',
    corvid_github_follow_user: 'git:follow',
    // Messaging
    corvid_send_message: 'msg:send',
    corvid_notify_owner: 'owner:notify',
    corvid_ask_owner: 'owner:ask',
    corvid_configure_notifications: 'owner:configure',
    // Credits
    corvid_grant_credits: 'credits:grant',
    corvid_credit_config: 'credits:config',
    corvid_check_credits: 'credits:read',
    // Scheduling & workflow
    corvid_manage_schedule: 'schedule:manage',
    corvid_manage_workflow: 'workflow:manage',
    corvid_create_work_task: 'work:create',
    corvid_check_work_status: 'work:read',
    corvid_list_work_tasks: 'work:read',
    // Search
    corvid_web_search: 'search:web',
    corvid_deep_research: 'search:deep',
    // Agent
    corvid_list_agents: 'agent:list',
    corvid_discover_agent: 'agent:discover',
    corvid_invoke_remote_agent: 'agent:invoke',
    // Memory
    corvid_save_memory: 'agent:memory',
    corvid_recall_memory: 'agent:memory',
    corvid_extend_timeout: 'agent:extend',
    corvid_restart_server: 'server:restart',
    // File system (coding tools)
    corvid_code_symbols: 'fs:read',
    corvid_find_references: 'fs:read',
    // Repo blocklist
    corvid_repo_blocklist: 'repo:manage',
    // Reputation
    corvid_check_reputation: 'reputation:read',
    corvid_check_health_trends: 'reputation:read',
    corvid_publish_attestation: 'reputation:publish',
    corvid_verify_agent_reputation: 'reputation:verify',
};

/** A stored permission grant. */
export interface PermissionGrant {
    id: number;
    agentId: string;
    action: PermissionAction;
    grantedBy: string;
    reason: string;
    signature: string;
    expiresAt: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    tenantId: string;
    createdAt: string;
}

/** Result of a permission check. */
export interface PermissionCheckResult {
    allowed: boolean;
    /** The grant that authorized this action (if allowed). */
    grantId: number | null;
    /** Human-readable reason for the decision. */
    reason: string;
    /** Time taken for the check in ms. */
    checkMs: number;
}

/** Options for granting a permission. */
export interface GrantOptions {
    agentId: string;
    action: PermissionAction;
    grantedBy: string;
    reason?: string;
    expiresAt?: string | null;
    tenantId?: string;
}

/** Options for revoking permissions. */
export interface RevokeOptions {
    grantId?: number;
    agentId?: string;
    action?: PermissionAction;
    revokedBy: string;
    reason?: string;
    tenantId?: string;
}
