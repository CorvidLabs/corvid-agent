/**
 * Tests for A2A invocation guardrails:
 * - Session invocation budget (total limit, unique agent limit, cooldown)
 * - Inbound rate limiting
 * - Depth propagation and enforcement
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
    SessionInvocationBudget,
    InboundA2ARateLimiter,
    MAX_A2A_DEPTH,
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
