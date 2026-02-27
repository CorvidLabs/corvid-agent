import { describe, it, expect } from 'bun:test';
import {
    CreateProjectSchema,
    UpdateProjectSchema,
    CreateAgentSchema,
    FundAgentSchema,
    InvokeAgentSchema,
    CreateSessionSchema,
    UpdateSessionSchema,
    CreateCouncilSchema,
    LaunchCouncilSchema,
    CreateWorkTaskSchema,
    AddAllowlistSchema,
    UpdateAllowlistSchema,
    McpSendMessageSchema,
    McpSaveMemorySchema,
    McpRecallMemorySchema,
    EscalationResolveSchema,
    OperationalModeSchema,
    SelfTestSchema,
    CreateScheduleSchema,
    CreateWebhookRegistrationSchema,
    CreateWorkflowSchema,
    CreateListingSchema,
    CreateReviewSchema,
    RecordReputationEventSchema,
    SwitchNetworkSchema,
    SendA2ATaskSchema,
    CreateMentionPollingSchema,
    ValidationError,
    parseBodyOrThrow,
    parseBody,
    parseQuery,
} from '../lib/validation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeRequest(body: unknown): Request {
    return new Request('http://localhost/test', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

describe('CreateProjectSchema', () => {
    it('accepts valid input', () => {
        const result = CreateProjectSchema.safeParse({
            name: 'My Project',
            workingDir: '/home/user/project',
        });
        expect(result.success).toBe(true);
    });

    it('accepts optional fields', () => {
        const result = CreateProjectSchema.safeParse({
            name: 'My Project',
            workingDir: '/home/user/project',
            description: 'A cool project',
            allowedTools: ['Read', 'Write'],
            customInstructions: 'Be concise',
        });
        expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
        const result = CreateProjectSchema.safeParse({ workingDir: '/tmp' });
        expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
        const result = CreateProjectSchema.safeParse({ name: '', workingDir: '/tmp' });
        expect(result.success).toBe(false);
    });

    it('rejects missing workingDir', () => {
        const result = CreateProjectSchema.safeParse({ name: 'Test' });
        expect(result.success).toBe(false);
    });
});

describe('UpdateProjectSchema', () => {
    it('accepts partial update', () => {
        const result = UpdateProjectSchema.safeParse({ name: 'New Name' });
        expect(result.success).toBe(true);
    });

    it('rejects empty object', () => {
        const result = UpdateProjectSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// ─── Agents ───────────────────────────────────────────────────────────────────

describe('CreateAgentSchema', () => {
    it('accepts minimal input', () => {
        const result = CreateAgentSchema.safeParse({ name: 'TestAgent' });
        expect(result.success).toBe(true);
    });

    it('accepts all optional fields', () => {
        const result = CreateAgentSchema.safeParse({
            name: 'TestAgent',
            description: 'A test agent',
            model: 'claude-sonnet-4-20250514',
            systemPrompt: 'You are helpful.',
            appendPrompt: 'Be concise.',
            allowedTools: 'Read,Write,Bash',
            disallowedTools: 'NotebookEdit',
            permissionMode: 'full-auto',
            maxBudgetUsd: 5.0,
            algochatEnabled: true,
            algochatAuto: false,
            customFlags: { verbose: 'true' },
            defaultProjectId: 'proj-123',
            mcpToolPermissions: ['tool1', 'tool2'],
        });
        expect(result.success).toBe(true);
    });

    it('rejects missing name', () => {
        const result = CreateAgentSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('rejects invalid permissionMode', () => {
        const result = CreateAgentSchema.safeParse({
            name: 'Agent',
            permissionMode: 'invalid',
        });
        expect(result.success).toBe(false);
    });

    it('allowedTools is a string, not array', () => {
        const arrayResult = CreateAgentSchema.safeParse({
            name: 'Agent',
            allowedTools: ['Read', 'Write'],
        });
        expect(arrayResult.success).toBe(false);

        const stringResult = CreateAgentSchema.safeParse({
            name: 'Agent',
            allowedTools: 'Read,Write',
        });
        expect(stringResult.success).toBe(true);
    });
});

describe('FundAgentSchema', () => {
    it('accepts valid amount', () => {
        expect(FundAgentSchema.safeParse({ microAlgos: 100000 }).success).toBe(true);
    });
    it('rejects amount below minimum', () => {
        expect(FundAgentSchema.safeParse({ microAlgos: 500 }).success).toBe(false);
    });
    it('rejects amount above maximum', () => {
        expect(FundAgentSchema.safeParse({ microAlgos: 200_000_000 }).success).toBe(false);
    });
});

describe('InvokeAgentSchema', () => {
    it('accepts valid input', () => {
        expect(InvokeAgentSchema.safeParse({ toAgentId: 'agent-1', content: 'Hello!' }).success).toBe(true);
    });
    it('rejects empty content', () => {
        expect(InvokeAgentSchema.safeParse({ toAgentId: 'agent-1', content: '' }).success).toBe(false);
    });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

describe('CreateSessionSchema', () => {
    it('accepts minimal input', () => {
        expect(CreateSessionSchema.safeParse({ projectId: 'proj-1' }).success).toBe(true);
    });
    it('accepts council role', () => {
        expect(CreateSessionSchema.safeParse({ projectId: 'proj-1', councilRole: 'chairman' }).success).toBe(true);
    });
    it('rejects invalid council role', () => {
        expect(CreateSessionSchema.safeParse({ projectId: 'proj-1', councilRole: 'boss' }).success).toBe(false);
    });
});

describe('UpdateSessionSchema', () => {
    it('accepts valid status', () => {
        expect(UpdateSessionSchema.safeParse({ status: 'paused' }).success).toBe(true);
    });
    it('rejects invalid status', () => {
        expect(UpdateSessionSchema.safeParse({ status: 'crashed' }).success).toBe(false);
    });
});

// ─── Councils ─────────────────────────────────────────────────────────────────

describe('CreateCouncilSchema', () => {
    it('accepts valid input', () => {
        expect(CreateCouncilSchema.safeParse({ name: 'Advisory Council', agentIds: ['agent-1', 'agent-2'] }).success).toBe(true);
    });
    it('rejects empty agentIds', () => {
        expect(CreateCouncilSchema.safeParse({ name: 'Council', agentIds: [] }).success).toBe(false);
    });
    it('rejects negative discussionRounds', () => {
        expect(CreateCouncilSchema.safeParse({ name: 'Council', agentIds: ['a1'], discussionRounds: -1 }).success).toBe(false);
    });
});

describe('LaunchCouncilSchema', () => {
    it('accepts valid input', () => {
        expect(LaunchCouncilSchema.safeParse({ projectId: 'proj-1', prompt: 'Discuss the architecture.' }).success).toBe(true);
    });
    it('rejects empty prompt', () => {
        expect(LaunchCouncilSchema.safeParse({ projectId: 'proj-1', prompt: '' }).success).toBe(false);
    });
});

// ─── Work Tasks ───────────────────────────────────────────────────────────────

describe('CreateWorkTaskSchema', () => {
    it('accepts valid input', () => {
        const result = CreateWorkTaskSchema.safeParse({ agentId: 'agent-1', description: 'Fix the bug' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.source).toBe('web');
    });
    it('accepts all source types', () => {
        for (const source of ['web', 'algochat', 'agent'] as const) {
            expect(CreateWorkTaskSchema.safeParse({ agentId: 'a1', description: 'task', source }).success).toBe(true);
        }
    });
    it('rejects invalid source', () => {
        expect(CreateWorkTaskSchema.safeParse({ agentId: 'a1', description: 'task', source: 'api' }).success).toBe(false);
    });
});

// ─── Allowlist ────────────────────────────────────────────────────────────────

describe('AddAllowlistSchema', () => {
    it('accepts valid address', () => {
        expect(AddAllowlistSchema.safeParse({ address: 'ALGO_ADDRESS_HERE_123' }).success).toBe(true);
    });
    it('rejects empty address', () => {
        expect(AddAllowlistSchema.safeParse({ address: '' }).success).toBe(false);
    });
});

describe('UpdateAllowlistSchema', () => {
    it('accepts valid label', () => {
        expect(UpdateAllowlistSchema.safeParse({ label: 'My Wallet' }).success).toBe(true);
    });
    it('rejects missing label', () => {
        expect(UpdateAllowlistSchema.safeParse({}).success).toBe(false);
    });
});

// ─── MCP API ──────────────────────────────────────────────────────────────────

describe('McpSendMessageSchema', () => {
    it('accepts valid input', () => {
        expect(McpSendMessageSchema.safeParse({ agentId: 'agent-1', toAgent: 'agent-2', message: 'Hello!' }).success).toBe(true);
    });
    it('rejects missing fields', () => {
        expect(McpSendMessageSchema.safeParse({ agentId: 'a1' }).success).toBe(false);
    });
});

describe('McpSaveMemorySchema', () => {
    it('accepts valid input', () => {
        expect(McpSaveMemorySchema.safeParse({ agentId: 'a1', key: 'config', content: 'some data' }).success).toBe(true);
    });
});

describe('McpRecallMemorySchema', () => {
    it('accepts key-only recall', () => {
        expect(McpRecallMemorySchema.safeParse({ agentId: 'a1', key: 'config' }).success).toBe(true);
    });
    it('accepts query-only recall', () => {
        expect(McpRecallMemorySchema.safeParse({ agentId: 'a1', query: 'find config' }).success).toBe(true);
    });
});

// ─── Misc ─────────────────────────────────────────────────────────────────────

describe('EscalationResolveSchema', () => {
    it('accepts boolean', () => {
        expect(EscalationResolveSchema.safeParse({ approved: true }).success).toBe(true);
        expect(EscalationResolveSchema.safeParse({ approved: false }).success).toBe(true);
    });
    it('rejects non-boolean', () => {
        expect(EscalationResolveSchema.safeParse({ approved: 'yes' }).success).toBe(false);
    });
});

describe('OperationalModeSchema', () => {
    it('accepts valid modes', () => {
        for (const mode of ['normal', 'queued', 'paused']) {
            expect(OperationalModeSchema.safeParse({ mode }).success).toBe(true);
        }
    });
    it('rejects invalid mode', () => {
        expect(OperationalModeSchema.safeParse({ mode: 'turbo' }).success).toBe(false);
    });
});

describe('SelfTestSchema', () => {
    it('defaults to all', () => {
        const result = SelfTestSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.testType).toBe('all');
    });
    it('accepts specific types', () => {
        for (const testType of ['unit', 'e2e', 'all']) {
            expect(SelfTestSchema.safeParse({ testType }).success).toBe(true);
        }
    });
});

// ─── Parse helpers ────────────────────────────────────────────────────────────

describe('parseBodyOrThrow', () => {
    it('returns validated data on success', async () => {
        const req = fakeRequest({ name: 'Test', workingDir: '/tmp' });
        const data = await parseBodyOrThrow(req, CreateProjectSchema);
        expect(data.name).toBe('Test');
        expect(data.workingDir).toBe('/tmp');
    });

    it('throws ValidationError on invalid input', async () => {
        const req = fakeRequest({ name: '' });
        try {
            await parseBodyOrThrow(req, CreateProjectSchema);
            expect(true).toBe(false);
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
        }
    });

    it('throws ValidationError on non-JSON body', async () => {
        const req = new Request('http://localhost/test', {
            method: 'POST',
            body: 'not json',
            headers: { 'Content-Type': 'text/plain' },
        });
        try {
            await parseBodyOrThrow(req, CreateProjectSchema);
            expect(true).toBe(false);
        } catch (err) {
            expect(err).toBeInstanceOf(ValidationError);
            expect((err as Error).message).toContain('Invalid JSON');
        }
    });
});

describe('parseBody', () => {
    it('returns data on success', async () => {
        const req = fakeRequest({ name: 'X', workingDir: '/tmp' });
        const { data, error } = await parseBody(req, CreateProjectSchema);
        expect(error).toBeNull();
        expect(data?.name).toBe('X');
    });
    it('returns error on failure', async () => {
        const req = fakeRequest({});
        const { data, error } = await parseBody(req, CreateProjectSchema);
        expect(data).toBeNull();
        expect(error).toContain('Validation failed');
    });
});

describe('parseQuery', () => {
    it('validates query params', () => {
        const { data, error } = parseQuery({ mode: 'normal' }, OperationalModeSchema);
        expect(error).toBeNull();
        expect(data?.mode).toBe('normal');
    });
    it('returns error for invalid params', () => {
        const { data, error } = parseQuery({ mode: 'invalid' }, OperationalModeSchema);
        expect(data).toBeNull();
        expect(error).toContain('Validation failed');
    });
});

// ─── Schedules ───────────────────────────────────────────────────────────────

describe('CreateScheduleSchema', () => {
    it('accepts valid schedule with cron', () => {
        const result = CreateScheduleSchema.safeParse({
            agentId: 'a1', name: 'Daily Review', cronExpression: '0 9 * * *',
            actions: [{ type: 'review_prs', repos: ['owner/repo'] }],
        });
        expect(result.success).toBe(true);
    });
    it('accepts valid schedule with interval', () => {
        const result = CreateScheduleSchema.safeParse({
            agentId: 'a1', name: 'Periodic Check', intervalMs: 300000,
            actions: [{ type: 'work_task', description: 'check' }],
        });
        expect(result.success).toBe(true);
    });
    it('rejects schedule without cron or interval', () => {
        expect(CreateScheduleSchema.safeParse({
            agentId: 'a1', name: 'No Trigger', actions: [{ type: 'work_task' }],
        }).success).toBe(false);
    });
    it('rejects empty actions', () => {
        expect(CreateScheduleSchema.safeParse({
            agentId: 'a1', name: 'No Actions', cronExpression: '0 * * * *', actions: [],
        }).success).toBe(false);
    });
    it('rejects interval below minimum (60s)', () => {
        expect(CreateScheduleSchema.safeParse({
            agentId: 'a1', name: 'Too Fast', intervalMs: 1000, actions: [{ type: 'work_task' }],
        }).success).toBe(false);
    });
});

// ─── Webhooks ────────────────────────────────────────────────────────────────

describe('CreateWebhookRegistrationSchema', () => {
    it('accepts valid input', () => {
        expect(CreateWebhookRegistrationSchema.safeParse({
            agentId: 'a1', repo: 'owner/repo', events: ['issue_comment'], mentionUsername: 'corvid-agent',
        }).success).toBe(true);
    });
    it('rejects invalid repo format', () => {
        expect(CreateWebhookRegistrationSchema.safeParse({
            agentId: 'a1', repo: 'noslash', events: ['issues'], mentionUsername: 'bot',
        }).success).toBe(false);
    });
    it('rejects empty events', () => {
        expect(CreateWebhookRegistrationSchema.safeParse({
            agentId: 'a1', repo: 'owner/repo', events: [], mentionUsername: 'bot',
        }).success).toBe(false);
    });
    it('rejects invalid event type', () => {
        expect(CreateWebhookRegistrationSchema.safeParse({
            agentId: 'a1', repo: 'owner/repo', events: ['push'], mentionUsername: 'bot',
        }).success).toBe(false);
    });
});

// ─── Workflows ───────────────────────────────────────────────────────────────

describe('CreateWorkflowSchema', () => {
    it('accepts valid workflow with start node', () => {
        expect(CreateWorkflowSchema.safeParse({
            agentId: 'a1', name: 'My Workflow',
            nodes: [{ id: 'start-1', type: 'start', label: 'Begin' }, { id: 'end-1', type: 'end', label: 'Done' }],
            edges: [{ id: 'e1', sourceNodeId: 'start-1', targetNodeId: 'end-1' }],
        }).success).toBe(true);
    });
    it('rejects workflow without start node', () => {
        expect(CreateWorkflowSchema.safeParse({
            agentId: 'a1', name: 'No Start', nodes: [{ id: 'end-1', type: 'end', label: 'Done' }],
        }).success).toBe(false);
    });
    it('rejects workflow with empty nodes', () => {
        expect(CreateWorkflowSchema.safeParse({ agentId: 'a1', name: 'Empty', nodes: [] }).success).toBe(false);
    });
});

// ─── Marketplace ─────────────────────────────────────────────────────────────

describe('CreateListingSchema', () => {
    it('accepts valid listing', () => {
        expect(CreateListingSchema.safeParse({ agentId: 'a1', name: 'My Agent', description: 'Does things', category: 'coding' }).success).toBe(true);
    });
    it('rejects invalid category', () => {
        expect(CreateListingSchema.safeParse({ agentId: 'a1', name: 'Agent', description: 'Desc', category: 'cooking' }).success).toBe(false);
    });
});

describe('CreateReviewSchema', () => {
    it('accepts valid review', () => {
        expect(CreateReviewSchema.safeParse({ rating: 5, comment: 'Great agent!' }).success).toBe(true);
    });
    it('rejects rating out of range', () => {
        expect(CreateReviewSchema.safeParse({ rating: 0, comment: 'bad' }).success).toBe(false);
        expect(CreateReviewSchema.safeParse({ rating: 6, comment: 'too much' }).success).toBe(false);
    });
    it('rejects empty comment', () => {
        expect(CreateReviewSchema.safeParse({ rating: 3, comment: '' }).success).toBe(false);
    });
});

// ─── Reputation ──────────────────────────────────────────────────────────────

describe('RecordReputationEventSchema', () => {
    it('accepts valid event', () => {
        expect(RecordReputationEventSchema.safeParse({ agentId: 'a1', eventType: 'task_completed', scoreImpact: 10 }).success).toBe(true);
    });
    it('rejects invalid event type', () => {
        expect(RecordReputationEventSchema.safeParse({ agentId: 'a1', eventType: 'invalid_event', scoreImpact: 5 }).success).toBe(false);
    });
    it('accepts negative score impact', () => {
        expect(RecordReputationEventSchema.safeParse({ agentId: 'a1', eventType: 'task_failed', scoreImpact: -5 }).success).toBe(true);
    });
});

// ─── SwitchNetwork ───────────────────────────────────────────────────────────

describe('SwitchNetworkSchema', () => {
    it('accepts valid networks', () => {
        expect(SwitchNetworkSchema.safeParse({ network: 'testnet' }).success).toBe(true);
        expect(SwitchNetworkSchema.safeParse({ network: 'mainnet' }).success).toBe(true);
    });
    it('rejects invalid network', () => {
        expect(SwitchNetworkSchema.safeParse({ network: 'localnet' }).success).toBe(false);
    });
});

// ─── A2A ─────────────────────────────────────────────────────────────────────

describe('SendA2ATaskSchema', () => {
    it('accepts message at top level', () => {
        expect(SendA2ATaskSchema.safeParse({ message: 'hello' }).success).toBe(true);
    });
    it('accepts message inside params', () => {
        expect(SendA2ATaskSchema.safeParse({ params: { message: 'hello' } }).success).toBe(true);
    });
    it('rejects missing message entirely', () => {
        expect(SendA2ATaskSchema.safeParse({}).success).toBe(false);
    });
});

// ─── Mention Polling ─────────────────────────────────────────────────────────

describe('CreateMentionPollingSchema', () => {
    it('accepts valid input', () => {
        expect(CreateMentionPollingSchema.safeParse({ agentId: 'a1', repo: 'owner/repo', mentionUsername: 'corvid-agent' }).success).toBe(true);
    });
    it('accepts org-only repo name', () => {
        expect(CreateMentionPollingSchema.safeParse({ agentId: 'a1', repo: 'CorvidLabs', mentionUsername: 'corvid-agent' }).success).toBe(true);
    });
    it('rejects interval below minimum (30s)', () => {
        expect(CreateMentionPollingSchema.safeParse({ agentId: 'a1', repo: 'owner/repo', mentionUsername: 'bot', intervalSeconds: 5 }).success).toBe(false);
    });
    it('rejects interval above maximum (1h)', () => {
        expect(CreateMentionPollingSchema.safeParse({ agentId: 'a1', repo: 'owner/repo', mentionUsername: 'bot', intervalSeconds: 7200 }).success).toBe(false);
    });
});
