/**
 * Zod validation schemas for all API request bodies.
 * Centralised here so route handlers stay lean and schemas are reusable in tests.
 */

import { z } from 'zod';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validation error — throw to get a 400 response. */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data, or throws a ValidationError with a descriptive message.
 * Route handlers should wrap in try/catch or use the safe variant.
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
            return { data: null, error: err.message };
        }
        return { data: null, error: 'Invalid request' };
    }
}

/** Validate query/search params (plain object) against a schema. */
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

export const CreateProjectSchema = z.object({
    name: z.string().min(1, 'name is required'),
    workingDir: z.string().min(1, 'workingDir is required'),
    description: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customInstructions: z.string().optional(),
    mcpServers: z.array(z.any()).optional(),
});

export const UpdateProjectSchema = z.object({
    name: z.string().min(1).optional(),
    workingDir: z.string().min(1).optional(),
    description: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customInstructions: z.string().optional(),
    mcpServers: z.array(z.any()).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field to update is required' });

// ─── Agents ───────────────────────────────────────────────────────────────────

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
});

export const FundAgentSchema = z.object({
    microAlgos: z.number().min(1000, 'microAlgos must be at least 1000').max(100_000_000, 'microAlgos must be at most 100000000'),
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
    status: z.enum(['idle', 'running', 'paused', 'stopped', 'error']).optional(),
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
});

export const UpdateCouncilSchema = z.object({
    name: z.string().min(1).optional(),
    agentIds: z.array(z.string()).min(1).optional(),
    description: z.string().optional(),
    chairmanAgentId: z.string().nullable().optional(),
    discussionRounds: z.number().int().min(0).optional(),
});

export const LaunchCouncilSchema = z.object({
    projectId: z.string().min(1, 'projectId is required'),
    prompt: z.string().min(1, 'prompt is required'),
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

export const AddAllowlistSchema = z.object({
    address: z.string().min(1, 'address is required'),
    label: z.string().optional(),
});

export const UpdateAllowlistSchema = z.object({
    label: z.string({ message: 'label is required' }),
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
    type: z.enum(['star_repo', 'fork_repo', 'review_prs', 'work_task', 'council_launch', 'send_message', 'github_suggest', 'custom']),
    repos: z.array(z.string()).optional(),
    description: z.string().optional(),
    projectId: z.string().optional(),
    councilId: z.string().optional(),
    toAgentId: z.string().optional(),
    message: z.string().optional(),
    maxPrs: z.number().int().min(1).max(50).optional(),
    autoCreatePr: z.boolean().optional(),
    prompt: z.string().optional(),
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
}).refine(
    (d) => d.cronExpression || d.intervalMs,
    { message: 'Either cronExpression or intervalMs must be provided' },
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
});

export const ScheduleApprovalSchema = z.object({
    approved: z.boolean({ message: 'approved (boolean) is required' }),
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
]);

export const CreateMentionPollingSchema = z.object({
    agentId: z.string().min(1, 'agentId is required'),
    repo: z.string().min(1, 'repo is required (format: owner/name)').regex(/^[^/]+\/[^/]+$/, 'repo must be in owner/name format'),
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
