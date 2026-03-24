/**
 * Zod validation schemas for all API request bodies.
 * Centralised here so route handlers stay lean and schemas are reusable in tests.
 */

// Input validation schemas and parsing utilities for HTTP routes

import { z } from 'zod';
import { ValidationError } from './errors';

// Re-export so existing imports from '../lib/validation' continue to work
export { ValidationError };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data, or throws a ValidationError with a descriptive message.
 * Route handlers should wrap in try/catch or use the safe variant.
 *
 * @param req - The incoming HTTP request whose JSON body will be parsed.
 * @param schema - The Zod schema to validate the parsed body against.
 * @returns The validated and typed request body data.
 * @throws {ValidationError} If the body is not valid JSON or fails schema validation.
 */
export async function parseBodyOrThrow<T extends z.ZodType>(
    req: Request,
    schema: T,
): Promise<z.infer<T>> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        throw new ValidationError('Invalid JSON body');
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
        throw new ValidationError(`Validation failed: ${issues}`);
    }
    return result.data as z.infer<T>;
}

/**
 * Parse and validate — returns `{ data, error }`.
 * When `error` is truthy, return a 400; otherwise `data!` is safe to use.
 *
 * @param req - The incoming HTTP request whose JSON body will be parsed.
 * @param schema - The Zod schema to validate the parsed body against.
 * @returns An object with `data` (validated body or null) and `error` (error message or null).
 */
export async function parseBody<T extends z.ZodType>(
    req: Request,
    schema: T,
): Promise<{ data: z.infer<T> | null; error: string | null }> {
    try {
        const data = await parseBodyOrThrow(req, schema);
        return { data, error: null };
    } catch (err) {
        if (err instanceof ValidationError) {
            return { data: null, error: err.detail };
        }
        return { data: null, error: 'Invalid request' };
    }
}

/**
 * Validate an Algorand address format (58-char base32 with valid checksum).
 * Uses algosdk.isValidAddress when available, falls back to format check.
 */
let _algosdk: typeof import('algosdk').default | null = null;
async function loadAlgosdk() {
    if (!_algosdk) _algosdk = (await import('algosdk')).default;
    return _algosdk;
}

/**
 * Synchronous format check: 58 uppercase A-Z2-7 characters.
 *
 * @param address - The address string to validate.
 * @returns `true` if the string matches the Algorand base32 address format.
 */
export function isAlgorandAddressFormat(address: string): boolean {
    return /^[A-Z2-7]{58}$/.test(address);
}

/**
 * Full async validation with checksum via algosdk.
 * Falls back to {@link isAlgorandAddressFormat} if algosdk is unavailable.
 *
 * @param address - The Algorand address string to validate.
 * @returns `true` if the address is valid (format and checksum).
 */
export async function isValidAlgorandAddress(address: string): Promise<boolean> {
    try {
        const sdk = await loadAlgosdk();
        return sdk.isValidAddress(address);
    } catch {
        // Fallback to format check if algosdk not available
        return isAlgorandAddressFormat(address);
    }
}

/**
 * Validate query/search params (plain object) against a schema.
 *
 * @param params - A record of query parameter key-value pairs to validate.
 * @param schema - The Zod schema to validate the params against.
 * @returns An object with `data` (validated params) and `error: null` on success, or `data: null` and `error` message on failure.
 */
export function parseQuery<T extends z.ZodType>(
    params: Record<string, string | null>,
    schema: T,
): { data: z.infer<T>; error: null } | { data: null; error: string } {
    const result = schema.safeParse(params);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
        return { data: null, error: `Validation failed: ${issues}` };
    }
    return { data: result.data, error: null };
}

// ─── Projects ──────────────────────────────────────────────────────────────────

const DirStrategySchema = z.enum(['persistent', 'clone_on_demand', 'ephemeral', 'worktree']);

export const CreateProjectSchema = z.object({
    name: z.string().min(1, 'name is required'),
    workingDir: z.string().min(1, 'workingDir is required'),
    description: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customInstructions: z.string().optional(),
    gitUrl: z.string().url().optional(),
    dirStrategy: DirStrategySchema.optional(),
    baseClonePath: z.string().optional(),
    mcpServers: z.array(z.object({
        name: z.string().min(1),
        command: z.string().min(1).optional(),
        args: z.array(z.string()).optional(),
        url: z.string().optional(),
        env: z.record(z.string(), z.string()).optional(),
    }).passthrough()).optional(),
});

export const UpdateProjectSchema = z.object({
    name: z.string().min(1).optional(),
    workingDir: z.string().min(1).optional(),
    description: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customInstructions: z.string().optional(),
    gitUrl: z.string().url().nullable().optional(),
    dirStrategy: DirStrategySchema.optional(),
    baseClonePath: z.string().nullable().optional(),
    mcpServers: z.array(z.object({
        name: z.string().min(1),
        command: z.string().min(1).optional(),
        args: z.array(z.string()).optional(),
        url: z.string().optional(),
        env: z.record(z.string(), z.string()).optional(),
    }).passthrough()).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field to update is required' });

// ─── Agents ───────────────────────────────────────────────────────────────────

const VoicePresetSchema = z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

export const CreateAgentSchema = z.object({
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    systemPrompt: z.string().optional(),
    appendPrompt: z.string().optional(),
    allowedTools: z.string().optional(),        // Comma-separated string, not array
    disallowedTools: z.string().optional(),     // Comma-separated string, not array
    permissionMode: z.enum(['default', 'plan', 'auto-edit', 'full-auto']).optional(),
    maxBudgetUsd: z.number().nullable().optional(),
    algochatEnabled: z.boolean().optional(),
    algochatAuto: z.boolean().optional(),
    customFlags: z.record(z.string(), z.string()).optional(),
    defaultProjectId: z.string().nullable().optional(),
    mcpToolPermissions: z.array(z.string()).nullable().optional(),
    voiceEnabled: z.boolean().optional(),
    voicePreset: VoicePresetSchema.optional(),
    displayColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'displayColor must be a hex color (e.g. #ff00aa)').nullable().optional(),
    displayIcon: z.string().max(32, 'displayIcon must be 32 chars or less').nullable().optional(),
    avatarUrl: z.string().url('avatarUrl must be a valid URL').max(2048).nullable().optional(),
});

export const UpdateAgentSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    systemPrompt: z.string().optional(),
    appendPrompt: z.string().optional(),
    allowedTools: z.string().optional(),
    disallowedTools: z.string().optional(),
    permissionMode: z.enum(['default', 'plan', 'auto-edit', 'full-auto']).optional(),
    maxBudgetUsd: z.number().nullable().optional(),
    algochatEnabled: z.boolean().optional(),
    algochatAuto: z.boolean().optional(),
    customFlags: z.record(z.string(), z.string()).optional(),
    defaultProjectId: z.string().nullable().optional(),
    mcpToolPermissions: z.array(z.string()).nullable().optional(),
    voiceEnabled: z.boolean().optional(),
    voicePreset: VoicePresetSchema.optional(),
    displayColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'displayColor must be a hex color (e.g. #ff00aa)').nullable().optional(),
    displayIcon: z.string().max(32, 'displayIcon must be 32 chars or less').nullable().optional(),
    avatarUrl: z.string().url('avatarUrl must be a valid URL').max(2048).nullable().optional(),
    disabled: z.boolean().optional(),
});

export const FundAgentSchema = z.object({
    microAlgos: z.number().min(1000, 'microAlgos must be at least 1000').max(100_000_000, 'microAlgos must be at most 100000000'),
});

export const SetSpendingCapSchema = z.object({
    dailyLimitMicroalgos: z.number().min(0, 'dailyLimitMicroalgos must be >= 0').max(1_000_000_000, 'dailyLimitMicroalgos too large'),
    dailyLimitUsdc: z.number().min(0, 'dailyLimitUsdc must be >= 0').max(1_000_000_000, 'dailyLimitUsdc too large').optional().default(0),
});

export const InvokeAgentSchema = z.object({
    toAgentId: z.string().min(1, 'toAgentId is required'),
    content: z.string().min(1, 'content is required'),
    paymentMicro: z.number().optional(),
    projectId: z.string().optional(),
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const CreateSessionSchema = z.object({
    projectId: z.string().min(1, 'projectId is required'),
    agentId: z.string().optional(),
    name: z.string().optional(),
    initialPrompt: z.string().optional(),
    councilLaunchId: z.string().optional(),
    councilRole: z.enum(['member', 'reviewer', 'chairman', 'discusser']).optional(),
});

export const UpdateSessionSchema = z.object({
    name: z.string().optional(),
    status: z.enum(['idle', 'loading', 'running', 'paused', 'stopped', 'error']).optional(),
});

export const ResumeSessionSchema = z.object({
    prompt: z.string().optional(),
}).optional().default({});

// ─── Councils ──────────────────────────────────────────────────────────────────

export const CreateCouncilSchema = z.object({
    name: z.string().min(1, 'name is required'),
    agentIds: z.array(z.string()).min(1, 'agentIds must be a non-empty array'),
    description: z.string().optional(),
    chairmanAgentId: z.string().optional(),
    discussionRounds: z.number().int().min(0).optional(),
    onChainMode: z.enum(['off', 'attestation', 'full']).optional(),
    quorumType: z.enum(['majority', 'supermajority', 'unanimous']).optional(),
    quorumThreshold: z.number().min(0).max(1).nullable().optional(),
});

export const UpdateCouncilSchema = z.object({
    name: z.string().min(1).optional(),
    agentIds: z.array(z.string()).min(1).optional(),
    description: z.string().optional(),
    chairmanAgentId: z.string().nullable().optional(),
    discussionRounds: z.number().int().min(0).optional(),
    onChainMode: z.enum(['off', 'attestation', 'full']).optional(),
    quorumType: z.enum(['majority', 'supermajority', 'unanimous']).optional(),
    quorumThreshold: z.number().min(0).max(1).nullable().optional(),
});

export const CastVoteSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    vote: z.enum(['approve', 'reject', 'abstain']),
    reason: z.string().optional(),
});

export const HumanApprovalSchema = z.object({
    approvedBy: z.string().min(1, 'approvedBy is required'),
});

export const LaunchCouncilSchema = z.object({
    projectId: z.string().min(1, 'projectId is required'),
    prompt: z.string().min(1, 'prompt is required'),
    voteType: z.enum(['standard', 'governance']).optional(),
    affectedPaths: z.array(z.string()).optional(),
});

export const CouncilChatSchema = z.object({
    message: z.string().min(1, 'message is required'),
});

// ─── Governance Proposals ──────────────────────────────────────────────────────

export const CreateProposalSchema = z.object({
    councilId: z.string().min(1, 'councilId is required'),
    title: z.string().min(1, 'title is required'),
    description: z.string().optional(),
    authorId: z.string().min(1, 'authorId is required'),
    governanceTier: z.number().int().min(0).max(2).optional(),
    affectedPaths: z.array(z.string()).optional(),
    quorumThreshold: z.number().min(0).max(1).nullable().optional(),
    minimumVoters: z.number().int().min(0).nullable().optional(),
});

export const UpdateProposalSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    affectedPaths: z.array(z.string()).optional(),
    quorumThreshold: z.number().min(0).max(1).nullable().optional(),
    minimumVoters: z.number().int().min(0).nullable().optional(),
});

export const TransitionProposalSchema = z.object({
    status: z.enum(['draft', 'open', 'voting', 'decided', 'enacted']),
    decision: z.enum(['approved', 'rejected']).optional(),
});

// ─── Work Tasks ────────────────────────────────────────────────────────────────

export const CreateWorkTaskSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    description: z.string().min(1, 'description is required'),
    projectId: z.string().optional(),
    source: z.enum(['web', 'algochat', 'agent']).optional().default('web'),
    sourceId: z.string().optional(),
    requesterInfo: z.record(z.string(), z.unknown()).optional(),
});

// ─── Allowlist ──────────────────────────────────────────────────────────────────

export const AlgorandAddressSchema = z.string()
    .min(1, 'address is required')
    .transform(s => s.trim().toUpperCase())
    .refine(isAlgorandAddressFormat, 'Invalid Algorand address format');

export const AddAllowlistSchema = z.object({
    address: AlgorandAddressSchema,
    label: z.string().optional(),
});

export const UpdateAllowlistSchema = z.object({
    label: z.string({ message: 'label is required' }),
});

// ─── GitHub Allowlist ───────────────────────────────────────────────────────

const GitHubUsernameSchema = z.string()
    .min(1, 'username is required')
    .max(39, 'GitHub usernames are at most 39 characters')
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, 'Invalid GitHub username format');

export const AddGitHubAllowlistSchema = z.object({
    username: GitHubUsernameSchema,
    label: z.string().optional(),
});

export const UpdateGitHubAllowlistSchema = z.object({
    label: z.string({ message: 'label is required' }),
});

// ─── Repo Blocklist ─────────────────────────────────────────────────────────

export const AddRepoBlocklistSchema = z.object({
    repo: z.string().min(1, 'repo is required'),
    reason: z.string().optional(),
    source: z.enum(['manual', 'pr_rejection', 'daily_review']).optional(),
    prUrl: z.string().optional(),
});

// ─── MCP API ──────────────────────────────────────────────────────────────────

export const McpSendMessageSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    toAgent: z.string().min(1, 'toAgent is required'),
    message: z.string().min(1, 'message is required'),
});

export const McpSaveMemorySchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    key: z.string().min(1, 'key is required'),
    content: z.string().min(1, 'content is required'),
});

export const McpRecallMemorySchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    key: z.string().optional(),
    query: z.string().optional(),
});

export const McpReadOnChainMemoriesSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    search: z.string().optional(),
    limit: z.number().optional(),
});

export const McpSyncOnChainMemoriesSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    limit: z.number().optional(),
});

export const McpDeleteMemorySchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    key: z.string().min(1, 'key is required'),
    mode: z.enum(['soft', 'hard']).optional(),
});

// ─── Observation routes ──────────────────────────────────────────────────────

export const McpRecordObservationSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    content: z.string().min(1, 'content is required'),
    source: z.enum(['session', 'feedback', 'daily-review', 'health', 'pr-outcome', 'manual']).optional(),
    sourceId: z.string().optional(),
    suggestedKey: z.string().optional(),
    relevanceScore: z.number().optional(),
});

export const McpListObservationsSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    status: z.enum(['active', 'graduated', 'expired', 'dismissed']).optional(),
    source: z.enum(['session', 'feedback', 'daily-review', 'health', 'pr-outcome', 'manual']).optional(),
    query: z.string().optional(),
    limit: z.number().optional(),
});

export const McpBoostObservationSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    id: z.string().min(1, 'observation id is required'),
    scoreBoost: z.number().optional(),
});

export const McpDismissObservationSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    id: z.string().min(1, 'observation id is required'),
});

export const McpObservationStatsSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
});

// ─── Misc routes (index.ts) ───────────────────────────────────────────────────

export const EscalationResolveSchema = z.object({
    approved: z.boolean({ message: 'approved (boolean) is required' }),
});

export const OperationalModeSchema = z.object({
    mode: z.enum(['normal', 'queued', 'paused'], { message: 'mode must be normal, queued, or paused' }),
});

export const SelfTestSchema = z.object({
    testType: z.enum(['unit', 'e2e', 'all']).optional().default('all'),
});

export const SwitchNetworkSchema = z.object({
    network: z.enum(['testnet', 'mainnet'], { message: 'network must be testnet or mainnet' }),
});

// ─── Ollama ──────────────────────────────────────────────────────────────────

export const OllamaPullModelSchema = z.object({
    model: z.string().min(1, 'model name is required'),
});

export const OllamaDeleteModelSchema = z.object({
    model: z.string().min(1, 'model name is required'),
});

// ─── Schedules ───────────────────────────────────────────────────────────────

const ScheduleActionSchema = z.object({
    type: z.enum(['star_repo', 'fork_repo', 'review_prs', 'work_task', 'council_launch', 'send_message', 'github_suggest', 'codebase_review', 'dependency_audit', 'improvement_loop', 'memory_maintenance', 'reputation_attestation', 'outcome_analysis', 'daily_review', 'custom']),
    repos: z.array(z.string()).optional(),
    description: z.string().optional(),
    projectId: z.string().optional(),
    councilId: z.string().optional(),
    toAgentId: z.string().optional(),
    message: z.string().optional(),
    maxPrs: z.number().int().min(1).max(50).optional(),
    autoCreatePr: z.boolean().optional(),
    prompt: z.string().optional(),
    maxImprovementTasks: z.number().int().min(1).max(5).optional(),
    focusArea: z.string().optional(),
});

const ScheduleTriggerEventSchema = z.object({
    source: z.enum(['github_webhook', 'github_poll']),
    event: z.string().min(1),
    repo: z.string().optional(),
});

const ScheduleOutputDestinationSchema = z.object({
    type: z.enum(['discord_channel', 'algochat_agent', 'algochat_address']),
    target: z.string().min(1),
    format: z.enum(['summary', 'full', 'on_error_only']).optional(),
});

const PipelineStepSchema = z.object({
    label: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Label must be alphanumeric with dashes/underscores'),
    action: ScheduleActionSchema,
    condition: z.enum(['always', 'on_success', 'on_failure']).optional(),
});

export const CreateScheduleSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    cronExpression: z.string().optional(),
    intervalMs: z.number().int().min(60000).optional(), // Minimum 1 minute
    actions: z.array(ScheduleActionSchema).min(1, 'At least one action is required'),
    approvalPolicy: z.enum(['auto', 'owner_approve', 'council_approve']).optional(),
    maxExecutions: z.number().int().min(1).optional(),
    maxBudgetPerRun: z.number().min(0).optional(),
    notifyAddress: z.string().min(1).optional(),
    triggerEvents: z.array(ScheduleTriggerEventSchema).optional(),
    outputDestinations: z.array(ScheduleOutputDestinationSchema).optional(),
    executionMode: z.enum(['independent', 'pipeline']).optional(),
    pipelineSteps: z.array(PipelineStepSchema).min(2, 'Pipeline requires at least 2 steps').max(10).optional(),
}).refine(
    (d) => d.cronExpression || d.intervalMs || (d.triggerEvents && d.triggerEvents.length > 0),
    { message: 'Either cronExpression, intervalMs, or triggerEvents must be provided' },
).refine(
    (d) => d.executionMode !== 'pipeline' || (d.pipelineSteps && d.pipelineSteps.length >= 2),
    { message: 'Pipeline mode requires pipelineSteps with at least 2 steps' },
);

export const UpdateScheduleSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    cronExpression: z.string().optional(),
    intervalMs: z.number().int().min(60000).optional(),
    actions: z.array(ScheduleActionSchema).min(1).optional(),
    approvalPolicy: z.enum(['auto', 'owner_approve', 'council_approve']).optional(),
    status: z.enum(['active', 'paused', 'completed', 'failed']).optional(),
    maxExecutions: z.number().int().min(1).optional(),
    maxBudgetPerRun: z.number().min(0).optional(),
    notifyAddress: z.string().min(1).nullable().optional(),
    triggerEvents: z.array(ScheduleTriggerEventSchema).nullable().optional(),
    outputDestinations: z.array(ScheduleOutputDestinationSchema).nullable().optional(),
    executionMode: z.enum(['independent', 'pipeline']).optional(),
    pipelineSteps: z.array(PipelineStepSchema).min(2).max(10).nullable().optional(),
});

export const ScheduleApprovalSchema = z.object({
    approved: z.boolean({ message: 'approved (boolean) is required' }),
});

export const BulkScheduleActionSchema = z.object({
    action: z.enum(['pause', 'resume', 'delete']),
    ids: z.array(z.string().min(1)).min(1, 'At least one schedule ID is required').max(50, 'Maximum 50 IDs per bulk action'),
});

// ─── Webhooks ────────────────────────────────────────────────────────────────

const WebhookEventTypeSchema = z.enum([
    'issue_comment',
    'issues',
    'pull_request_review_comment',
    'issue_comment_pr',
]);

export const CreateWebhookRegistrationSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    repo: z.string().min(1, 'repo is required (format: owner/name)').regex(/^[^/]+\/[^/]+$/, 'repo must be in owner/name format'),
    events: z.array(WebhookEventTypeSchema).min(1, 'At least one event type is required'),
    mentionUsername: z.string().min(1, 'mentionUsername is required'),
    projectId: z.string().min(1).optional(),
});

export const UpdateWebhookRegistrationSchema = z.object({
    events: z.array(WebhookEventTypeSchema).min(1).optional(),
    mentionUsername: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    status: z.enum(['active', 'paused']).optional(),
});

// ─── Mention Polling ────────────────────────────────────────────────────────

const PollingEventFilterSchema = z.enum([
    'issue_comment',
    'issues',
    'pull_request_review_comment',
    'pull_request',
]);

export const CreateMentionPollingSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    repo: z.string().min(1, 'repo is required').regex(/^[^/]+(?:\/[^/]+)?$/, 'repo must be owner/name or org name'),
    mentionUsername: z.string().min(1, 'mentionUsername is required'),
    projectId: z.string().min(1).optional(),
    intervalSeconds: z.number().int().min(30, 'Minimum polling interval is 30 seconds').max(3600, 'Maximum polling interval is 1 hour').optional(),
    eventFilter: z.array(PollingEventFilterSchema).optional(),
    allowedUsers: z.array(z.string().min(1)).optional(),
});

export const UpdateMentionPollingSchema = z.object({
    mentionUsername: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    intervalSeconds: z.number().int().min(30).max(3600).optional(),
    status: z.enum(['active', 'paused']).optional(),
    eventFilter: z.array(PollingEventFilterSchema).optional(),
    allowedUsers: z.array(z.string().min(1)).optional(),
});

// ─── Workflows ───────────────────────────────────────────────────────────────

const WorkflowNodeTypeSchema = z.enum([
    'start', 'agent_session', 'work_task', 'condition', 'delay',
    'webhook_wait', 'transform', 'parallel', 'join', 'end',
]);

const WorkflowNodeConfigSchema = z.object({
    agentId: z.string().optional(),
    projectId: z.string().optional(),
    prompt: z.string().optional(),
    maxTurns: z.number().int().min(1).max(100).optional(),
    description: z.string().optional(),
    expression: z.string().optional(),
    delayMs: z.number().int().min(100).max(3600000).optional(),
    webhookEvent: z.string().optional(),
    timeoutMs: z.number().int().min(1000).max(86400000).optional(),
    template: z.string().optional(),
    branchCount: z.number().int().min(2).max(10).optional(),
}).optional().default({});

const WorkflowNodeSchema = z.object({
    id: z.string().min(1),
    type: WorkflowNodeTypeSchema,
    label: z.string().min(1),
    config: WorkflowNodeConfigSchema,
    position: z.object({
        x: z.number(),
        y: z.number(),
    }).optional(),
});

const WorkflowEdgeSchema = z.object({
    id: z.string().min(1),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    condition: z.string().optional(),
    label: z.string().optional(),
});

export const CreateWorkflowSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    nodes: z.array(WorkflowNodeSchema).min(1, 'At least one node is required'),
    edges: z.array(WorkflowEdgeSchema).default([]),
    defaultProjectId: z.string().optional(),
    maxConcurrency: z.number().int().min(1).max(10).optional(),
}).refine(
    (d) => d.nodes.some((n) => n.type === 'start'),
    { message: 'Workflow must have at least one start node' },
);

export const UpdateWorkflowSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    nodes: z.array(WorkflowNodeSchema).min(1).optional(),
    edges: z.array(WorkflowEdgeSchema).optional(),
    status: z.enum(['draft', 'active', 'paused', 'completed', 'failed']).optional(),
    defaultProjectId: z.string().nullable().optional(),
    maxConcurrency: z.number().int().min(1).max(10).optional(),
});

export const TriggerWorkflowSchema = z.object({
    input: z.record(z.string(), z.unknown()).optional().default({}),
});

export const WorkflowRunActionSchema = z.object({
    action: z.enum(['pause', 'resume', 'cancel']),
});

// ─── Marketplace (co-located: ./schemas/marketplace.ts) ────────────────────
export {
    CreateListingSchema,
    UpdateListingSchema,
    CreateReviewSchema,
    RegisterFederationInstanceSchema,
    SubscribeSchema,
    CancelSubscriptionSchema,
    CreateTierSchema,
    UpdateTierSchema,
    TierUseSchema,
    TierSubscribeSchema,
    StartTrialSchema,
} from './schemas/marketplace';

// ─── Reputation ──────────────────────────────────────────────────────────────

const ReputationEventTypeSchema = z.enum([
    'task_completed', 'task_failed', 'review_received',
    'credit_spent', 'credit_earned', 'security_violation',
    'session_completed', 'attestation_published', 'improvement_loop_completed',
    'improvement_loop_failed', 'feedback_received',
]);

export const RecordReputationEventSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    eventType: ReputationEventTypeSchema,
    scoreImpact: z.number({ message: 'scoreImpact must be a number' }),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const SubmitFeedbackSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    sessionId: z.string().optional(),
    source: z.enum(['api', 'discord', 'algochat']).default('api'),
    sentiment: z.enum(['positive', 'negative']),
    category: z.enum(['helpful', 'accurate', 'truthful', 'harmful', 'inaccurate', 'untruthful']).optional(),
    comment: z.string().max(500).optional(),
    submittedBy: z.string().optional(),
});

// ─── Billing ─────────────────────────────────────────────────────────────────

export const CreateSubscriptionSchema = z.object({
    tenantId: z.string().min(1, 'tenantId is required'),
    stripeSubscriptionId: z.string().min(1, 'stripeSubscriptionId is required'),
    plan: z.string().min(1, 'plan is required'),
    periodStart: z.string().min(1, 'periodStart is required'),
    periodEnd: z.string().min(1, 'periodEnd is required'),
    stripeItems: z.array(z.object({
        id: z.string().min(1),
        priceId: z.string().optional(),
    })).optional(),
});

// ─── Personas ───────────────────────────────────────────────────────────────

const PersonaArchetypeSchema = z.enum(['custom', 'professional', 'friendly', 'technical', 'creative', 'formal']);

export const CreatePersonaSchema = z.object({
    name: z.string().min(1, 'name is required').max(100, 'name must be 100 chars or less'),
    archetype: PersonaArchetypeSchema.optional(),
    traits: z.array(z.string().max(100, 'each trait must be 100 chars or less')).max(20, 'maximum 20 traits').optional(),
    voiceGuidelines: z.string().max(2000, 'voiceGuidelines must be 2000 chars or less').optional(),
    background: z.string().max(4000, 'background must be 4000 chars or less').optional(),
    exampleMessages: z.array(z.string().max(500, 'each example must be 500 chars or less')).max(10, 'maximum 10 examples').optional(),
});

export const UpdatePersonaSchema = z.object({
    name: z.string().min(1).max(100, 'name must be 100 chars or less').optional(),
    archetype: PersonaArchetypeSchema.optional(),
    traits: z.array(z.string().max(100, 'each trait must be 100 chars or less')).max(20, 'maximum 20 traits').optional(),
    voiceGuidelines: z.string().max(2000, 'voiceGuidelines must be 2000 chars or less').optional(),
    background: z.string().max(4000, 'background must be 4000 chars or less').optional(),
    exampleMessages: z.array(z.string().max(500, 'each example must be 500 chars or less')).max(10, 'maximum 10 examples').optional(),
});

/** @deprecated Use CreatePersonaSchema or UpdatePersonaSchema instead */
export const UpsertPersonaSchema = UpdatePersonaSchema;

export const AssignPersonaSchema = z.object({
    personaId: z.string().min(1, 'personaId is required'),
    sortOrder: z.number().int().min(0).optional(),
});

// ─── Skill Bundles ──────────────────────────────────────────────────────────

const ToolNameSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_\-:.*]+$/, 'tool name contains invalid characters');

export const CreateSkillBundleSchema = z.object({
    name: z.string().min(1, 'name is required').max(100, 'name must be 100 chars or less'),
    description: z.string().max(1000, 'description must be 1000 chars or less').optional(),
    tools: z.array(ToolNameSchema).max(50, 'maximum 50 tools per bundle').optional(),
    promptAdditions: z.string().max(4000, 'promptAdditions must be 4000 chars or less').optional(),
});

export const UpdateSkillBundleSchema = z.object({
    name: z.string().min(1).max(100, 'name must be 100 chars or less').optional(),
    description: z.string().max(1000, 'description must be 1000 chars or less').optional(),
    tools: z.array(ToolNameSchema).max(50, 'maximum 50 tools per bundle').optional(),
    promptAdditions: z.string().max(4000, 'promptAdditions must be 4000 chars or less').optional(),
});

export const AssignSkillBundleSchema = z.object({
    bundleId: z.string().min(1, 'bundleId is required'),
    sortOrder: z.number().int().min(0).optional(),
});

// ─── Agent Variants ─────────────────────────────────────────────────────────

export const CreateVariantSchema = z.object({
    name: z.string().min(1, 'name is required').max(100, 'name must be 100 chars or less'),
    description: z.string().max(1000, 'description must be 1000 chars or less').optional(),
    skillBundleIds: z.array(z.string().min(1)).max(20, 'maximum 20 skill bundles per variant').optional(),
    personaIds: z.array(z.string().min(1)).max(10, 'maximum 10 personas per variant').optional(),
    preset: z.boolean().optional(),
});

export const UpdateVariantSchema = z.object({
    name: z.string().min(1).max(100, 'name must be 100 chars or less').optional(),
    description: z.string().max(1000, 'description must be 1000 chars or less').optional(),
    skillBundleIds: z.array(z.string().min(1)).max(20, 'maximum 20 skill bundles per variant').optional(),
    personaIds: z.array(z.string().min(1)).max(10, 'maximum 10 personas per variant').optional(),
    preset: z.boolean().optional(),
});

export const ApplyVariantSchema = z.object({
    variantId: z.string().min(1, 'variantId is required'),
});

// ─── External MCP Server Configs ────────────────────────────────────────────

export const CreateMcpServerConfigSchema = z.object({
    agentId: z.string().nullable().optional(),
    name: z.string().min(1, 'name is required').max(100, 'name must be 100 chars or less'),
    command: z.string().min(1, 'command is required').max(500, 'command must be 500 chars or less'),
    args: z.array(z.string().max(1000)).max(50, 'maximum 50 args').optional(),
    envVars: z.record(z.string(), z.string().max(4000)).optional(),
    cwd: z.string().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
});

export const UpdateMcpServerConfigSchema = z.object({
    name: z.string().min(1).max(100, 'name must be 100 chars or less').optional(),
    command: z.string().min(1).max(500, 'command must be 500 chars or less').optional(),
    args: z.array(z.string().max(1000)).max(50, 'maximum 50 args').optional(),
    envVars: z.record(z.string(), z.string().max(4000)).optional(),
    cwd: z.string().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
});

// ─── A2A ─────────────────────────────────────────────────────────────────────

export const SendA2ATaskSchema = z.object({
    params: z.object({
        message: z.string().min(1, 'message is required'),
        skill: z.string().optional(),
        timeoutMs: z.number().int().min(1000).max(600000).optional(),
        depth: z.number().int().min(1).max(10).optional(),
    }).optional(),
    message: z.string().min(1).optional(),
    skill: z.string().optional(),
    timeoutMs: z.number().int().min(1000).max(600000).optional(),
    depth: z.number().int().min(1).max(10).optional(),
    sourceAgent: z.string().optional(),
}).refine(
    (d) => (d.params?.message?.trim()) || (d.message?.trim()),
    { message: 'message is required (either at top-level or inside params)' },
);

// ─── Settings ──────────────────────────────────────────────────────────────

const CreditConfigValueSchema = z.union([z.string(), z.number()]);

export const UpdateCreditConfigSchema = z.object({
    credits_per_algo: CreditConfigValueSchema.optional(),
    low_credit_threshold: CreditConfigValueSchema.optional(),
    reserve_per_group_message: CreditConfigValueSchema.optional(),
    credits_per_turn: CreditConfigValueSchema.optional(),
    credits_per_agent_message: CreditConfigValueSchema.optional(),
    free_credits_on_first_message: CreditConfigValueSchema.optional(),
}).strict().refine(
    (d) => Object.keys(d).length > 0,
    { message: 'At least one config key is required' },
);

// ─── Plugins ──────────────────────────────────────────────────────────────

export const LoadPluginSchema = z.object({
    packageName: z.string().min(1, 'packageName is required'),
    autoGrant: z.boolean().optional().default(false),
});

const PluginCapabilitySchema = z.enum([
    'db:read',
    'network:outbound',
    'fs:project-dir',
    'agent:read',
    'session:read',
]);

export const PluginCapabilityActionSchema = z.object({
    capability: PluginCapabilitySchema,
});

// ─── Sandbox ──────────────────────────────────────────────────────────────

export const SetSandboxPolicySchema = z.object({
    cpuLimit: z.number().min(0.1).max(16).optional(),
    memoryLimitMb: z.number().int().min(64).max(65536).optional(),
    networkPolicy: z.enum(['none', 'host', 'restricted']).optional(),
    timeoutSeconds: z.number().int().min(1).max(86400).optional(),
});

export const AssignSandboxSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    sessionId: z.string().min(1, 'sessionId is required'),
    workDir: z.string().optional(),
});

// ─── Auth Flow (Device Authorization) ───────────────────────────────────

export const DeviceTokenSchema = z.object({
    deviceCode: z.string().min(1, 'deviceCode is required'),
});

export const DeviceAuthorizeSchema = z.object({
    userCode: z.string().min(1, 'userCode is required'),
    tenantId: z.string().min(1, 'tenantId is required'),
    email: z.string().min(1, 'email is required'),
    approve: z.boolean({ message: 'approve (boolean) is required' }),
});

// ─── PSK Contacts ────────────────────────────────────────────────────────

export const PSKContactNicknameSchema = z.object({
    nickname: z.string().min(1, 'nickname is required'),
});

// ─── Wallet Credits ─────────────────────────────────────────────────────────

export const CreditGrantSchema = z.object({
    amount: z.number().positive().finite(),
    reference: z.string().optional(),
});
