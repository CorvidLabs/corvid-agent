/**
 * Tests for handleInvokeRemoteAgent — invocation budget, trust verification,
 * budget recording, and error logging paths introduced by invocation guardrails.
 */
import { describe, it, expect, afterEach, mock } from 'bun:test';
import { handleInvokeRemoteAgent } from '../mcp/tool-handlers/a2a';
import { SessionInvocationBudget } from '../a2a/invocation-guard';
import type { McpToolContext } from '../mcp/tool-handlers/types';

// ── Fetch mock ───────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

/** Stub fetch to simulate a successful remote agent invocation. */
function stubSuccessfulInvocation() {
    globalThis.fetch = mock((url: string) => {
        if (url.includes('/a2a/tasks/send')) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({ id: 'task-42', state: 'submitted' }),
                    { status: 200 },
                ),
            );
        }
        if (url.includes('/a2a/tasks/task-42')) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        id: 'task-42',
                        state: 'completed',
                        messages: [
                            { role: 'user', parts: [{ text: 'hello' }] },
                            { role: 'agent', parts: [{ text: 'world' }] },
                        ],
                    }),
                    { status: 200 },
                ),
            );
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
    }) as unknown as typeof fetch;
}

/** Stub fetch to simulate a network error. */
function stubFetchError() {
    globalThis.fetch = mock(() => {
        return Promise.reject(new Error('connection refused'));
    }) as unknown as typeof fetch;
}

// ── Minimal mock context ─────────────────────────────────────────────────────

function createCtx(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId: 'agent-1',
        sessionId: 'session-1',
        db: {} as McpToolContext['db'],
        agentMessenger: {} as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        emitStatus: mock(() => {}),
        ...overrides,
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('handleInvokeRemoteAgent — budget enforcement', () => {
    it('blocks invocation when budget check fails', async () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 0, // immediately exhausted
            cooldownMs: 0,
        });

        const ctx = createCtx({ invocationBudget: budget });
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('temporarily unavailable');
    });

    it('allows invocation when budget check passes', async () => {
        stubSuccessfulInvocation();
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 10,
            maxUniqueAgentsPerSession: 5,
            cooldownMs: 0,
        });

        const ctx = createCtx({ invocationBudget: budget });
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
        });

        expect(result.isError).toBeUndefined();
        expect(JSON.stringify(result.content)).toContain('world');
    });

    it('records invocation in budget after success', async () => {
        stubSuccessfulInvocation();
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 10,
            maxUniqueAgentsPerSession: 5,
            cooldownMs: 0,
        });

        const ctx = createCtx({ invocationBudget: budget });
        expect(budget.getInvocationCount()).toBe(0);

        await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
        });

        expect(budget.getInvocationCount()).toBe(1);
        expect(budget.getUniqueAgentCount()).toBe(1);
    });

    it('proceeds without budget when invocationBudget is not set', async () => {
        stubSuccessfulInvocation();
        const ctx = createCtx(); // no invocationBudget
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
        });

        expect(result.isError).toBeUndefined();
    });
});

describe('handleInvokeRemoteAgent — trust verification', () => {
    it('blocks invocation when target trust is below required level', async () => {
        const mockScorer = {
            computeScore: mock(() => ({
                agentId: 'remote',
                overallScore: 10,
                trustLevel: 'untrusted' as const,
            })),
        };

        const ctx = createCtx({
            reputationScorer: mockScorer as unknown as McpToolContext['reputationScorer'],
        });

        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
            min_trust: 'high',
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('trust level');
    });

    it('allows invocation when target trust meets requirement', async () => {
        stubSuccessfulInvocation();
        const mockScorer = {
            computeScore: mock(() => ({
                agentId: 'remote',
                overallScore: 90,
                trustLevel: 'high' as const,
            })),
        };

        const ctx = createCtx({
            reputationScorer: mockScorer as unknown as McpToolContext['reputationScorer'],
        });

        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
            min_trust: 'medium',
        });

        expect(result.isError).toBeUndefined();
    });

    it('allows invocation when reputation lookup throws (advisory)', async () => {
        stubSuccessfulInvocation();
        const mockScorer = {
            computeScore: mock(() => {
                throw new Error('reputation service unavailable');
            }),
        };

        const ctx = createCtx({
            reputationScorer: mockScorer as unknown as McpToolContext['reputationScorer'],
        });

        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
            min_trust: 'high',
        });

        // Should proceed despite error
        expect(result.isError).toBeUndefined();
    });

    it('proceeds without trust check when reputationScorer is not set', async () => {
        stubSuccessfulInvocation();
        const ctx = createCtx(); // no reputationScorer
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
            min_trust: 'verified',
        });

        expect(result.isError).toBeUndefined();
    });
});

describe('handleInvokeRemoteAgent — error logging', () => {
    it('returns error result when fetch fails', async () => {
        stubFetchError();
        const ctx = createCtx();
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: 'Hello',
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('connection refused');
    });

    it('returns validation error for empty agent_url', async () => {
        const ctx = createCtx();
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: '',
            message: 'Hello',
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('required');
    });

    it('returns validation error for empty message', async () => {
        const ctx = createCtx();
        const result = await handleInvokeRemoteAgent(ctx, {
            agent_url: 'https://remote.example.com',
            message: '',
        });

        expect(result.isError).toBe(true);
        expect(JSON.stringify(result.content)).toContain('required');
    });
});
