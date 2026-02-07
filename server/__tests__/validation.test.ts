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
        const result = FundAgentSchema.safeParse({ microAlgos: 100000 });
        expect(result.success).toBe(true);
    });

    it('rejects amount below minimum', () => {
        const result = FundAgentSchema.safeParse({ microAlgos: 500 });
        expect(result.success).toBe(false);
    });

    it('rejects amount above maximum', () => {
        const result = FundAgentSchema.safeParse({ microAlgos: 200_000_000 });
        expect(result.success).toBe(false);
    });
});

describe('InvokeAgentSchema', () => {
    it('accepts valid input', () => {
        const result = InvokeAgentSchema.safeParse({
            toAgentId: 'agent-1',
            content: 'Hello!',
        });
        expect(result.success).toBe(true);
    });

    it('rejects empty content', () => {
        const result = InvokeAgentSchema.safeParse({
            toAgentId: 'agent-1',
            content: '',
        });
        expect(result.success).toBe(false);
    });
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

describe('CreateSessionSchema', () => {
    it('accepts minimal input', () => {
        const result = CreateSessionSchema.safeParse({ projectId: 'proj-1' });
        expect(result.success).toBe(true);
    });

    it('accepts council role', () => {
        const result = CreateSessionSchema.safeParse({
            projectId: 'proj-1',
            councilRole: 'chairman',
        });
        expect(result.success).toBe(true);
    });

    it('rejects invalid council role', () => {
        const result = CreateSessionSchema.safeParse({
            projectId: 'proj-1',
            councilRole: 'boss',
        });
        expect(result.success).toBe(false);
    });
});

describe('UpdateSessionSchema', () => {
    it('accepts valid status', () => {
        const result = UpdateSessionSchema.safeParse({ status: 'paused' });
        expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
        const result = UpdateSessionSchema.safeParse({ status: 'crashed' });
        expect(result.success).toBe(false);
    });
});

// ─── Councils ─────────────────────────────────────────────────────────────────

describe('CreateCouncilSchema', () => {
    it('accepts valid input', () => {
        const result = CreateCouncilSchema.safeParse({
            name: 'Advisory Council',
            agentIds: ['agent-1', 'agent-2'],
        });
        expect(result.success).toBe(true);
    });

    it('rejects empty agentIds', () => {
        const result = CreateCouncilSchema.safeParse({
            name: 'Council',
            agentIds: [],
        });
        expect(result.success).toBe(false);
    });

    it('rejects negative discussionRounds', () => {
        const result = CreateCouncilSchema.safeParse({
            name: 'Council',
            agentIds: ['a1'],
            discussionRounds: -1,
        });
        expect(result.success).toBe(false);
    });
});

describe('LaunchCouncilSchema', () => {
    it('accepts valid input', () => {
        const result = LaunchCouncilSchema.safeParse({
            projectId: 'proj-1',
            prompt: 'Discuss the architecture.',
        });
        expect(result.success).toBe(true);
    });

    it('rejects empty prompt', () => {
        const result = LaunchCouncilSchema.safeParse({
            projectId: 'proj-1',
            prompt: '',
        });
        expect(result.success).toBe(false);
    });
});

// ─── Work Tasks ───────────────────────────────────────────────────────────────

describe('CreateWorkTaskSchema', () => {
    it('accepts valid input', () => {
        const result = CreateWorkTaskSchema.safeParse({
            agentId: 'agent-1',
            description: 'Fix the bug',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.source).toBe('web'); // default
        }
    });

    it('accepts all source types', () => {
        for (const source of ['web', 'algochat', 'agent'] as const) {
            const result = CreateWorkTaskSchema.safeParse({
                agentId: 'a1',
                description: 'task',
                source,
            });
            expect(result.success).toBe(true);
        }
    });

    it('rejects invalid source', () => {
        const result = CreateWorkTaskSchema.safeParse({
            agentId: 'a1',
            description: 'task',
            source: 'api',
        });
        expect(result.success).toBe(false);
    });
});

// ─── Allowlist ────────────────────────────────────────────────────────────────

describe('AddAllowlistSchema', () => {
    it('accepts valid address', () => {
        const result = AddAllowlistSchema.safeParse({
            address: 'ALGO_ADDRESS_HERE_123',
        });
        expect(result.success).toBe(true);
    });

    it('rejects empty address', () => {
        const result = AddAllowlistSchema.safeParse({ address: '' });
        expect(result.success).toBe(false);
    });
});

describe('UpdateAllowlistSchema', () => {
    it('accepts valid label', () => {
        const result = UpdateAllowlistSchema.safeParse({ label: 'My Wallet' });
        expect(result.success).toBe(true);
    });

    it('rejects missing label', () => {
        const result = UpdateAllowlistSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// ─── MCP API ──────────────────────────────────────────────────────────────────

describe('McpSendMessageSchema', () => {
    it('accepts valid input', () => {
        const result = McpSendMessageSchema.safeParse({
            agentId: 'agent-1',
            toAgent: 'agent-2',
            message: 'Hello!',
        });
        expect(result.success).toBe(true);
    });

    it('rejects missing fields', () => {
        const result = McpSendMessageSchema.safeParse({ agentId: 'a1' });
        expect(result.success).toBe(false);
    });
});

describe('McpSaveMemorySchema', () => {
    it('accepts valid input', () => {
        const result = McpSaveMemorySchema.safeParse({
            agentId: 'a1',
            key: 'config',
            content: 'some data',
        });
        expect(result.success).toBe(true);
    });
});

describe('McpRecallMemorySchema', () => {
    it('accepts key-only recall', () => {
        const result = McpRecallMemorySchema.safeParse({
            agentId: 'a1',
            key: 'config',
        });
        expect(result.success).toBe(true);
    });

    it('accepts query-only recall', () => {
        const result = McpRecallMemorySchema.safeParse({
            agentId: 'a1',
            query: 'find config',
        });
        expect(result.success).toBe(true);
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
        if (result.success) {
            expect(result.data.testType).toBe('all');
        }
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
            expect(true).toBe(false); // Should not reach
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
        const { data, error } = parseQuery(
            { mode: 'normal' },
            OperationalModeSchema,
        );
        expect(error).toBeNull();
        expect(data?.mode).toBe('normal');
    });

    it('returns error for invalid params', () => {
        const { data, error } = parseQuery(
            { mode: 'invalid' },
            OperationalModeSchema,
        );
        expect(data).toBeNull();
        expect(error).toContain('Validation failed');
    });
});
