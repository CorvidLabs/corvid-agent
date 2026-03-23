/**
 * Tests for A2A invocation guardrails:
 * - Session invocation budget (total limit, unique agent limit, cooldown)
 * - Inbound rate limiting
 * - Depth propagation and enforcement
 * - loadInvocationGuardConfig defaults and env overrides
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    SessionInvocationBudget,
    InboundA2ARateLimiter,
    MAX_A2A_DEPTH,
    loadInvocationGuardConfig,
} from '../a2a/invocation-guard';
import { handleTaskSend, clearTaskStore, DepthExceededError } from '../a2a/task-handler';
import type { A2ATaskDeps } from '../a2a/task-handler';
import { mock } from 'bun:test';

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_AGENT = {
    id: 'agent-1',
    name: 'TestAgent',
    defaultProjectId: 'proj-1',
    description: '',
    systemPrompt: '',
    appendPrompt: '',
    model: '',
    allowedTools: '',
    disallowedTools: '',
    permissionMode: 'default' as const,
    maxBudgetUsd: null,
    algochatEnabled: false,
    algochatAuto: false,
    customFlags: {},
    mcpToolPermissions: null,
    walletAddress: null,
    walletFundedAlgo: 0,
    voiceEnabled: false,
    voicePreset: 'alloy' as const,
    displayColor: null,
    displayIcon: null,
    avatarUrl: null,
    conversationMode: 'private' as const,
    conversationRateLimitWindow: 3600,
    conversationRateLimitMax: 10,
    disabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const MOCK_SESSION = {
    id: 'session-1',
    projectId: 'proj-1',
    agentId: 'agent-1',
    name: 'A2A Task: test',
    status: 'idle' as const,
    source: 'agent' as const,
    initialPrompt: '',
    pid: null,
    totalCostUsd: 0,
    totalAlgoSpent: 0,
    totalTurns: 0,
    councilLaunchId: null,
    councilRole: null,
    workDir: null,
    creditsConsumed: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

function createMockDeps(overrides?: Partial<A2ATaskDeps>): A2ATaskDeps {
    return {
        db: {} as A2ATaskDeps['db'],
        processManager: {
            startProcess: mock(() => {}),
            stopProcess: mock(() => {}),
            isRunning: mock(() => false),
            subscribe: mock(() => {}),
            unsubscribe: mock(() => {}),
            subscribeAll: mock(() => {}),
            unsubscribeAll: mock(() => {}),
        } as unknown as A2ATaskDeps['processManager'],
        listAgents: mock(() => [MOCK_AGENT]),
        createSession: mock(() => MOCK_SESSION),
        ...overrides,
    };
}

// ── Session Invocation Budget ────────────────────────────────────────────────

describe('SessionInvocationBudget', () => {
    it('allows invocations within budget', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 5,
            maxUniqueAgentsPerSession: 3,
            cooldownMs: 0,
        });

        const result = budget.check('https://agent1.example.com');
        expect(result.allowed).toBe(true);
    });

    it('blocks when total invocation limit is reached', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 2,
            maxUniqueAgentsPerSession: 10,
            cooldownMs: 0,
        });

        budget.record('https://agent1.example.com');
        budget.record('https://agent1.example.com');

        const result = budget.check('https://agent1.example.com');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('INVOCATION_LIMIT');
    });

    it('blocks when unique agent limit is reached for new agent', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 2,
            cooldownMs: 0,
        });

        budget.record('https://agent1.example.com');
        budget.record('https://agent2.example.com');

        // Same agent should still be allowed
        const sameAgent = budget.check('https://agent1.example.com');
        expect(sameAgent.allowed).toBe(true);

        // New agent should be blocked
        const newAgent = budget.check('https://agent3.example.com');
        expect(newAgent.allowed).toBe(false);
        expect(newAgent.reason).toBe('UNIQUE_AGENT_LIMIT');
    });

    it('enforces cooldown between invocations', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 100,
            cooldownMs: 10_000,
        });

        budget.record('https://agent1.example.com');

        const result = budget.check('https://agent1.example.com');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('COOLDOWN');
    });

    it('allows invocation after cooldown expires', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 100,
            cooldownMs: 1, // 1ms cooldown for testing
        });

        budget.record('https://agent1.example.com');

        // Wait for cooldown to expire
        const start = Date.now();
        while (Date.now() - start < 5) { /* spin */ }

        const result = budget.check('https://agent1.example.com');
        expect(result.allowed).toBe(true);
    });

    it('tracks invocation count accurately', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 100,
            cooldownMs: 0,
        });

        expect(budget.getInvocationCount()).toBe(0);

        budget.record('https://agent1.example.com');
        budget.record('https://agent2.example.com');
        budget.record('https://agent1.example.com');

        expect(budget.getInvocationCount()).toBe(3);
        expect(budget.getUniqueAgentCount()).toBe(2);
    });
});

// ── Inbound Rate Limiter ─────────────────────────────────────────────────────

describe('InboundA2ARateLimiter', () => {
    let limiter: InboundA2ARateLimiter;

    beforeEach(() => {
        limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 3,
            inboundRateLimitWindowMs: 60_000,
        });
    });

    it('allows requests within rate limit', () => {
        const result = limiter.check('agent-a');
        expect(result.allowed).toBe(true);
    });

    it('blocks after exceeding rate limit', () => {
        limiter.record('agent-a');
        limiter.record('agent-a');
        limiter.record('agent-a');

        const result = limiter.check('agent-a');
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeDefined();
        expect(result.retryAfterMs!).toBeGreaterThan(0);
    });

    it('allows different agents independently', () => {
        limiter.record('agent-a');
        limiter.record('agent-a');
        limiter.record('agent-a');

        // agent-a is rate-limited
        expect(limiter.check('agent-a').allowed).toBe(false);

        // agent-b should still be allowed
        expect(limiter.check('agent-b').allowed).toBe(true);
    });

    it('resets all windows', () => {
        limiter.record('agent-a');
        limiter.record('agent-a');
        limiter.record('agent-a');

        expect(limiter.check('agent-a').allowed).toBe(false);

        limiter.reset();

        expect(limiter.check('agent-a').allowed).toBe(true);
    });

    it('stops the sweep timer without error', () => {
        limiter.stop();
        // Should not throw
        expect(true).toBe(true);
    });
});

// ── Depth Propagation ────────────────────────────────────────────────────────

describe('A2A Depth Enforcement', () => {
    let deps: A2ATaskDeps;

    beforeEach(() => {
        clearTaskStore();
        deps = createMockDeps();
    });

    it('allows tasks with depth within limit', () => {
        const task = handleTaskSend(deps, {
            message: 'Hello',
            depth: 1,
        });

        expect(task).toBeDefined();
        expect(task.state).toBe('working');
    });

    it('allows tasks at exact depth limit', () => {
        const task = handleTaskSend(deps, {
            message: 'Hello',
            depth: MAX_A2A_DEPTH,
        });

        expect(task).toBeDefined();
        expect(task.state).toBe('working');
    });

    it('rejects tasks exceeding depth limit', () => {
        expect(() =>
            handleTaskSend(deps, {
                message: 'Hello',
                depth: MAX_A2A_DEPTH + 1,
            }),
        ).toThrow(DepthExceededError);
    });

    it('defaults to depth 1 when not specified', () => {
        const task = handleTaskSend(deps, {
            message: 'Hello',
        });

        // Should succeed (depth defaults to 1)
        expect(task).toBeDefined();
        expect(task.state).toBe('working');
    });

    it('MAX_A2A_DEPTH is 3', () => {
        expect(MAX_A2A_DEPTH).toBe(3);
    });
});

// ── loadInvocationGuardConfig ────────────────────────────────────────────────

describe('loadInvocationGuardConfig', () => {
    const envKeys = [
        'MAX_REMOTE_INVOCATIONS_PER_SESSION',
        'MAX_UNIQUE_AGENTS_PER_SESSION',
        'A2A_INVOCATION_COOLDOWN_MS',
        'A2A_INBOUND_RATE_LIMIT_PER_MIN',
    ];

    // Save and restore env vars around each test
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {};
        for (const key of envKeys) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of envKeys) {
            if (savedEnv[key] !== undefined) {
                process.env[key] = savedEnv[key];
            } else {
                delete process.env[key];
            }
        }
    });

    it('returns correct defaults when no env vars are set', () => {
        const config = loadInvocationGuardConfig();
        expect(config.maxInvocationsPerSession).toBe(10);
        expect(config.maxUniqueAgentsPerSession).toBe(3);
        expect(config.cooldownMs).toBe(5000);
        expect(config.inboundRateLimitPerMin).toBe(5);
        expect(config.inboundRateLimitWindowMs).toBe(60_000);
    });

    it('reads values from environment variables', () => {
        process.env.MAX_REMOTE_INVOCATIONS_PER_SESSION = '20';
        process.env.MAX_UNIQUE_AGENTS_PER_SESSION = '8';
        process.env.A2A_INVOCATION_COOLDOWN_MS = '2000';
        process.env.A2A_INBOUND_RATE_LIMIT_PER_MIN = '15';

        const config = loadInvocationGuardConfig();
        expect(config.maxInvocationsPerSession).toBe(20);
        expect(config.maxUniqueAgentsPerSession).toBe(8);
        expect(config.cooldownMs).toBe(2000);
        expect(config.inboundRateLimitPerMin).toBe(15);
    });

    it('falls back to defaults for invalid (non-numeric) env values', () => {
        process.env.MAX_REMOTE_INVOCATIONS_PER_SESSION = 'abc';
        process.env.MAX_UNIQUE_AGENTS_PER_SESSION = '';
        process.env.A2A_INVOCATION_COOLDOWN_MS = 'NaN';
        process.env.A2A_INBOUND_RATE_LIMIT_PER_MIN = '-5';

        const config = loadInvocationGuardConfig();
        expect(config.maxInvocationsPerSession).toBe(10);
        expect(config.maxUniqueAgentsPerSession).toBe(3);
        expect(config.cooldownMs).toBe(5000);
        expect(config.inboundRateLimitPerMin).toBe(5);
    });

    it('falls back to defaults for zero or negative values', () => {
        process.env.MAX_REMOTE_INVOCATIONS_PER_SESSION = '0';
        process.env.MAX_UNIQUE_AGENTS_PER_SESSION = '0';
        process.env.A2A_INBOUND_RATE_LIMIT_PER_MIN = '0';

        const config = loadInvocationGuardConfig();
        expect(config.maxInvocationsPerSession).toBe(10);
        expect(config.maxUniqueAgentsPerSession).toBe(3);
        expect(config.inboundRateLimitPerMin).toBe(5);
    });

    it('allows cooldownMs of 0', () => {
        process.env.A2A_INVOCATION_COOLDOWN_MS = '0';
        const config = loadInvocationGuardConfig();
        expect(config.cooldownMs).toBe(0);
    });
});

// ── Inbound Rate Limiter — sweep & pruning ──────────────────────────────────

describe('InboundA2ARateLimiter — sweep and pruning', () => {
    it('prunes expired timestamps on check', () => {
        // Use a very short window so old timestamps expire fast
        const limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 100,
            inboundRateLimitWindowMs: 1, // 1ms window
        });

        limiter.record('agent-x');
        limiter.record('agent-x');

        // Wait for window to expire
        const start = Date.now();
        while (Date.now() - start < 5) { /* spin */ }

        // After expiry, check should pass (timestamps pruned)
        const result = limiter.check('agent-x');
        expect(result.allowed).toBe(true);

        limiter.stop();
    });

    it('stop is idempotent', () => {
        const limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 5,
            inboundRateLimitWindowMs: 60_000,
        });

        limiter.stop();
        limiter.stop(); // second call should not throw
        expect(true).toBe(true);
    });
});
