export interface Project {
    id: string;
    name: string;
    description: string;
    workingDir: string;
    claudeMd: string;
    envVars: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

export interface Agent {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    appendPrompt: string;
    model: string;
    provider?: string;
    allowedTools: string;
    disallowedTools: string;
    permissionMode: 'default' | 'plan' | 'auto-edit' | 'full-auto';
    maxBudgetUsd: number | null;
    algochatEnabled: boolean;
    algochatAuto: boolean;
    customFlags: Record<string, string>;
    defaultProjectId: string | null;
    mcpToolPermissions: string[] | null;
    walletAddress: string | null;
    walletFundedAlgo: number;
    createdAt: string;
    updatedAt: string;
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'error';
export type SessionSource = 'web' | 'algochat' | 'agent';

export interface Session {
    id: string;
    projectId: string;
    agentId: string | null;
    name: string;
    status: SessionStatus;
    source: SessionSource;
    initialPrompt: string;
    pid: number | null;
    totalCostUsd: number;
    totalAlgoSpent: number;
    totalTurns: number;
    councilLaunchId: string | null;
    councilRole: 'member' | 'reviewer' | 'chairman' | 'discusser' | null;
    workDir: string | null;
    creditsConsumed: number;
    createdAt: string;
    updatedAt: string;
}

export interface SessionMessage {
    id: number;
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    costUsd: number;
    timestamp: string;
}

export interface AlgoChatConversation {
    id: string;
    participantAddr: string;
    agentId: string | null;
    sessionId: string | null;
    lastRound: number;
    createdAt: string;
}

export type AlgoChatNetwork = 'localnet' | 'testnet' | 'mainnet';

export interface AlgoChatStatus {
    enabled: boolean;
    address: string | null;
    network: AlgoChatNetwork;
    syncInterval: number;
    activeConversations: number;
    balance: number;
}

export interface CreateProjectInput {
    name: string;
    description?: string;
    workingDir: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
}

export interface UpdateProjectInput {
    name?: string;
    description?: string;
    workingDir?: string;
    claudeMd?: string;
    envVars?: Record<string, string>;
}

export interface CreateAgentInput {
    name: string;
    description?: string;
    systemPrompt?: string;
    appendPrompt?: string;
    model?: string;
    provider?: string;
    allowedTools?: string;
    disallowedTools?: string;
    permissionMode?: Agent['permissionMode'];
    maxBudgetUsd?: number | null;
    algochatEnabled?: boolean;
    algochatAuto?: boolean;
    customFlags?: Record<string, string>;
    defaultProjectId?: string | null;
    mcpToolPermissions?: string[] | null;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {}

export interface CreateSessionInput {
    projectId: string;
    agentId?: string;
    name?: string;
    initialPrompt?: string;
    source?: SessionSource;
    councilLaunchId?: string;
    councilRole?: 'member' | 'reviewer' | 'chairman' | 'discusser';
    workDir?: string;
}

export interface UpdateSessionInput {
    name?: string;
    status?: SessionStatus;
}

export type AgentMessageStatus = 'pending' | 'sent' | 'processing' | 'completed' | 'failed';

export interface AgentMessage {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    content: string;
    paymentMicro: number;
    txid: string | null;
    status: AgentMessageStatus;
    response: string | null;
    responseTxid: string | null;
    sessionId: string | null;
    threadId: string | null;
    provider?: string;
    model?: string;
    createdAt: string;
    completedAt: string | null;
}

// MARK: - Councils

export interface Council {
    id: string;
    name: string;
    description: string;
    chairmanAgentId: string | null;
    agentIds: string[];
    discussionRounds: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCouncilInput {
    name: string;
    description?: string;
    agentIds: string[];
    chairmanAgentId?: string;
    discussionRounds?: number;
}

export interface UpdateCouncilInput {
    name?: string;
    description?: string;
    agentIds?: string[];
    chairmanAgentId?: string | null;
    discussionRounds?: number;
}

export type CouncilStage = 'responding' | 'discussing' | 'reviewing' | 'synthesizing' | 'complete';

export interface CouncilLaunch {
    id: string;
    councilId: string;
    projectId: string;
    prompt: string;
    stage: CouncilStage;
    synthesis: string | null;
    sessionIds: string[];
    currentDiscussionRound: number;
    totalDiscussionRounds: number;
    chatSessionId: string | null;
    createdAt: string;
}

export interface LaunchCouncilInput {
    projectId: string;
    prompt: string;
}

export type CouncilLogLevel = 'info' | 'warn' | 'error' | 'stage';

export interface CouncilLaunchLog {
    id: number;
    launchId: string;
    level: CouncilLogLevel;
    message: string;
    detail: string | null;
    createdAt: string;
}

export interface CouncilDiscussionMessage {
    id: number;
    launchId: string;
    agentId: string;
    agentName: string;
    round: number;
    content: string;
    txid: string | null;
    sessionId: string | null;
    createdAt: string;
}

// MARK: - Agent Memories

export type MemoryStatus = 'pending' | 'confirmed' | 'failed';

export interface AgentMemory {
    id: string;
    agentId: string;
    key: string;
    content: string;
    txid: string | null;
    status: MemoryStatus;
    createdAt: string;
    updatedAt: string;
}

// MARK: - Work Tasks

export type WorkTaskStatus = 'pending' | 'branching' | 'running' | 'validating' | 'completed' | 'failed';
export type WorkTaskSource = 'web' | 'algochat' | 'agent';

export interface WorkTask {
    id: string;
    agentId: string;
    projectId: string;
    sessionId: string | null;
    source: WorkTaskSource;
    sourceId: string | null;
    requesterInfo: Record<string, unknown>;
    description: string;
    branchName: string | null;
    status: WorkTaskStatus;
    prUrl: string | null;
    summary: string | null;
    error: string | null;
    originalBranch: string | null;
    worktreeDir: string | null;
    iterationCount: number;
    createdAt: string;
    completedAt: string | null;
}

// MARK: - Credits

export interface CreditBalanceWire {
    walletAddress: string;
    credits: number;
    reserved: number;
    available: number;
    totalPurchased: number;
    totalConsumed: number;
}

export interface CreditTransactionWire {
    id: number;
    walletAddress: string;
    type: string;
    amount: number;
    balanceAfter: number;
    reference: string | null;
    txid: string | null;
    sessionId: string | null;
    createdAt: string;
}

export interface CreditConfigWire {
    creditsPerAlgo: number;
    lowCreditThreshold: number;
    reservePerGroupMessage: number;
    creditsPerTurn: number;
    creditsPerAgentMessage: number;
    freeCreditsOnFirstMessage: number;
}

export interface CreateWorkTaskInput {
    agentId: string;
    description: string;
    projectId?: string;
    source?: WorkTaskSource;
    sourceId?: string;
    requesterInfo?: Record<string, unknown>;
}

// MARK: - Agent Schedules (Automation)

export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';

export type ScheduleActionType =
    | 'star_repo'
    | 'fork_repo'
    | 'review_prs'
    | 'work_task'
    | 'council_launch'
    | 'send_message'
    | 'github_suggest'
    | 'codebase_review'
    | 'dependency_audit'
    | 'custom';

export type ScheduleApprovalPolicy = 'auto' | 'owner_approve' | 'council_approve';

export interface ScheduleAction {
    type: ScheduleActionType;
    /** Target repos (for star/fork/review/suggest) */
    repos?: string[];
    /** PR description or work task description */
    description?: string;
    /** Project ID for work tasks / council launches */
    projectId?: string;
    /** Council ID for council launches */
    councilId?: string;
    /** Target agent for send_message */
    toAgentId?: string;
    /** Message content for send_message */
    message?: string;
    /** Max PRs to review per execution (for review_prs) */
    maxPrs?: number;
    /** Whether to auto-create PRs from suggestions (for github_suggest) */
    autoCreatePr?: boolean;
    /** Arbitrary prompt for custom action type */
    prompt?: string;
}

export interface AgentSchedule {
    id: string;
    agentId: string;
    name: string;
    description: string;
    /** Cron expression (e.g. "0 9 * * 1-5" = weekdays at 9am) */
    cronExpression: string;
    /** Fixed interval in ms (alternative to cron) */
    intervalMs: number | null;
    /** Actions to perform on each execution */
    actions: ScheduleAction[];
    /** What approval is needed before executing PRs / destructive actions */
    approvalPolicy: ScheduleApprovalPolicy;
    status: ScheduleStatus;
    /** Max total executions (null = unlimited) */
    maxExecutions: number | null;
    executionCount: number;
    /** Max USD budget per execution */
    maxBudgetPerRun: number | null;
    /** Algorand address to notify on execution start/complete/fail */
    notifyAddress: string | null;
    lastRunAt: string | null;
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export type ScheduleExecutionStatus = 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'approved' | 'denied';

export interface ScheduleExecution {
    id: string;
    scheduleId: string;
    agentId: string;
    status: ScheduleExecutionStatus;
    actionType: ScheduleActionType;
    actionInput: Record<string, unknown>;
    result: string | null;
    sessionId: string | null;
    workTaskId: string | null;
    costUsd: number;
    configSnapshot?: Record<string, unknown>;
    startedAt: string;
    completedAt: string | null;
}

export interface CreateScheduleInput {
    agentId: string;
    name: string;
    description?: string;
    cronExpression?: string;
    intervalMs?: number;
    actions: ScheduleAction[];
    approvalPolicy?: ScheduleApprovalPolicy;
    maxExecutions?: number;
    maxBudgetPerRun?: number;
    notifyAddress?: string;
}

export interface UpdateScheduleInput {
    name?: string;
    description?: string;
    cronExpression?: string;
    intervalMs?: number;
    actions?: ScheduleAction[];
    approvalPolicy?: ScheduleApprovalPolicy;
    status?: ScheduleStatus;
    maxExecutions?: number;
    maxBudgetPerRun?: number;
    notifyAddress?: string | null;
}

// MARK: - Webhooks (GitHub Event Triggers)

export type WebhookEventType =
    | 'issue_comment'     // @mention in issue comments
    | 'issues'            // Issue opened/edited
    | 'pull_request_review_comment' // @mention in PR review comments
    | 'issue_comment_pr'; // @mention in PR conversation comments (GitHub sends issue_comment for PR comments too)

export type WebhookRegistrationStatus = 'active' | 'paused';

export interface WebhookRegistration {
    id: string;
    agentId: string;
    /** GitHub repo (owner/name) this webhook listens to */
    repo: string;
    /** Which events trigger this webhook */
    events: WebhookEventType[];
    /** GitHub username to match @mentions for (e.g. 'corvid-agent') */
    mentionUsername: string;
    /** Project ID to use when creating sessions */
    projectId: string;
    status: WebhookRegistrationStatus;
    /** Total number of times this webhook has been triggered */
    triggerCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateWebhookRegistrationInput {
    agentId: string;
    repo: string;
    events: WebhookEventType[];
    mentionUsername: string;
    projectId?: string;
}

export interface UpdateWebhookRegistrationInput {
    events?: WebhookEventType[];
    mentionUsername?: string;
    projectId?: string;
    status?: WebhookRegistrationStatus;
}

export interface WebhookDelivery {
    id: string;
    registrationId: string;
    event: string;
    action: string;
    repo: string;
    sender: string;
    /** The comment/body that triggered this delivery */
    body: string;
    /** URL to the issue/PR on GitHub */
    htmlUrl: string;
    /** Session ID created for this delivery */
    sessionId: string | null;
    /** Work task ID created for this delivery */
    workTaskId: string | null;
    status: 'processing' | 'completed' | 'failed' | 'ignored';
    result: string | null;
    createdAt: string;
}

// MARK: - GitHub Mention Polling

export type MentionPollingStatus = 'active' | 'paused';

export interface MentionPollingConfig {
    id: string;
    agentId: string;
    /** GitHub repo (owner/name) to poll for mentions */
    repo: string;
    /** GitHub username to monitor for @mentions (e.g. 'corvid-agent') */
    mentionUsername: string;
    /** Project ID to use when creating triggered sessions */
    projectId: string;
    /** Polling interval in seconds (min 30, default 60) */
    intervalSeconds: number;
    status: MentionPollingStatus;
    /** Total number of times a mention has been detected and processed */
    triggerCount: number;
    /** ISO timestamp of last successful poll */
    lastPollAt: string | null;
    /** ID of the last processed notification/comment to avoid duplicates */
    lastSeenId: string | null;
    /** Set of all processed mention IDs to avoid re-triggering */
    processedIds: string[];
    /** Optional: only poll specific event types */
    eventFilter: ('issue_comment' | 'issues' | 'pull_request_review_comment')[];
    /** Optional: only respond to mentions from specific users (empty = all users) */
    allowedUsers: string[];
    createdAt: string;
    updatedAt: string;
}

export interface CreateMentionPollingInput {
    agentId: string;
    repo: string;
    mentionUsername: string;
    projectId?: string;
    intervalSeconds?: number;
    eventFilter?: MentionPollingConfig['eventFilter'];
    allowedUsers?: string[];
}

export interface UpdateMentionPollingInput {
    mentionUsername?: string;
    projectId?: string;
    intervalSeconds?: number;
    status?: MentionPollingStatus;
    eventFilter?: MentionPollingConfig['eventFilter'];
    allowedUsers?: string[];
}

// MARK: - Workflows (Graph-based Orchestration)

export type WorkflowStatus = 'draft' | 'active' | 'running' | 'paused' | 'completed' | 'failed';

export type WorkflowNodeType =
    | 'start'           // Entry point — every workflow has exactly one
    | 'agent_session'   // Spawn an agent session with a prompt
    | 'work_task'       // Create a work task (branch + PR)
    | 'condition'       // Boolean branch based on previous output
    | 'delay'           // Wait for a duration before continuing
    | 'webhook_wait'    // Wait for an external webhook event
    | 'transform'       // Transform data between nodes (template string)
    | 'parallel'        // Fork into parallel branches
    | 'join'            // Wait for all parallel branches to complete
    | 'end';            // Terminal node

export interface WorkflowNodeConfig {
    // agent_session
    agentId?: string;
    projectId?: string;
    prompt?: string;            // Supports {{prev.output}} template vars
    maxTurns?: number;

    // work_task
    description?: string;       // Supports template vars

    // condition
    expression?: string;        // JS-like expression: "prev.output.includes('success')"

    // delay
    delayMs?: number;

    // webhook_wait
    webhookEvent?: string;      // Event type to wait for
    timeoutMs?: number;         // Max wait time

    // transform
    template?: string;          // Template string with {{var}} placeholders

    // parallel
    branchCount?: number;       // Number of parallel branches (inferred from edges)
}

export interface WorkflowNode {
    id: string;
    type: WorkflowNodeType;
    label: string;
    config: WorkflowNodeConfig;
    /** Position for UI graph rendering */
    position?: { x: number; y: number };
}

export interface WorkflowEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    /** For condition nodes: 'true' or 'false' branch */
    condition?: string;
    /** Optional label for the edge */
    label?: string;
}

export interface Workflow {
    id: string;
    agentId: string;
    name: string;
    description: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    status: WorkflowStatus;
    /** Default project for nodes that don't specify one */
    defaultProjectId: string | null;
    /** Max concurrent node executions */
    maxConcurrency: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateWorkflowInput {
    agentId: string;
    name: string;
    description?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    defaultProjectId?: string;
    maxConcurrency?: number;
}

export interface UpdateWorkflowInput {
    name?: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    status?: WorkflowStatus;
    defaultProjectId?: string | null;
    maxConcurrency?: number;
}

// Workflow execution tracking

export type WorkflowRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting';

export interface WorkflowRun {
    id: string;
    workflowId: string;
    agentId: string;
    status: WorkflowRunStatus;
    /** Input data passed to the workflow */
    input: Record<string, unknown>;
    /** Final output from the end node */
    output: Record<string, unknown> | null;
    /** Snapshot of workflow graph at run time (for audit) */
    workflowSnapshot: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
    /** Per-node execution state */
    nodeRuns: WorkflowNodeRun[];
    currentNodeIds: string[];
    error: string | null;
    startedAt: string;
    completedAt: string | null;
}

export interface WorkflowNodeRun {
    id: string;
    runId: string;
    nodeId: string;
    nodeType: WorkflowNodeType;
    status: WorkflowNodeRunStatus;
    /** Input received from upstream node(s) */
    input: Record<string, unknown>;
    /** Output produced by this node */
    output: Record<string, unknown> | null;
    /** Session ID if this node spawned an agent session */
    sessionId: string | null;
    /** Work task ID if this node created a work task */
    workTaskId: string | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
}

// MARK: - A2A Protocol (Agent-to-Agent Agent Card)

export interface A2AAgentProvider {
    organization: string;
    url: string;
}

export interface A2AAgentCapabilities {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
}

export interface A2AAgentAuthentication {
    schemes: string[];
    credentials?: string;
}

export interface A2AAgentSkill {
    id: string;
    name: string;
    description: string;
    tags: string[];
    inputModes: string[];
    outputModes: string[];
}

export interface A2AProtocolExtension {
    protocol: string;
    description: string;
    endpoint?: string;
}

export interface A2AAgentCard {
    name: string;
    description: string;
    url: string;
    provider?: A2AAgentProvider;
    version: string;
    documentationUrl?: string;
    capabilities: A2AAgentCapabilities;
    authentication: A2AAgentAuthentication;
    defaultInputModes: string[];
    defaultOutputModes: string[];
    skills: A2AAgentSkill[];
    /** Custom extension: supported protocols beyond A2A */
    supportedProtocols?: A2AProtocolExtension[];
}
