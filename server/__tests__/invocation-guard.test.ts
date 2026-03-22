import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    SessionInvocationBudget,
    InboundA2ARateLimiter,
    loadInvocationGuardConfig,
    MAX_A2A_DEPTH,
} from '../a2a/invocation-guard';

// ── loadInvocationGuardConfig ────────────────────────────────────────────

describe('loadInvocationGuardConfig', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of [
            'MAX_REMOTE_INVOCATIONS_PER_SESSION',
            'MAX_UNIQUE_AGENTS_PER_SESSION',
            'A2A_INVOCATION_COOLDOWN_MS',
            'A2A_INBOUND_RATE_LIMIT_PER_MIN',
        ]) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const [key, val] of Object.entries(saved)) {
            if (val === undefined) delete process.env[key];
            else process.env[key] = val;
        }
    });

    it('returns defaults when env vars are unset', () => {
        const cfg = loadInvocationGuardConfig();
        expect(cfg.maxInvocationsPerSession).toBe(10);
        expect(cfg.maxUniqueAgentsPerSession).toBe(3);
        expect(cfg.cooldownMs).toBe(5000);
        expect(cfg.inboundRateLimitPerMin).toBe(5);
        expect(cfg.inboundRateLimitWindowMs).toBe(60_000);
    });

    it('respects env var overrides', () => {
        process.env.MAX_REMOTE_INVOCATIONS_PER_SESSION = '20';
        process.env.MAX_UNIQUE_AGENTS_PER_SESSION = '5';
        process.env.A2A_INVOCATION_COOLDOWN_MS = '1000';
        process.env.A2A_INBOUND_RATE_LIMIT_PER_MIN = '15';

        const cfg = loadInvocationGuardConfig();
        expect(cfg.maxInvocationsPerSession).toBe(20);
        expect(cfg.maxUniqueAgentsPerSession).toBe(5);
        expect(cfg.cooldownMs).toBe(1000);
        expect(cfg.inboundRateLimitPerMin).toBe(15);
    });

    it('falls back to defaults for invalid env values', () => {
        process.env.MAX_REMOTE_INVOCATIONS_PER_SESSION = 'abc';
        process.env.MAX_UNIQUE_AGENTS_PER_SESSION = '-1';
        process.env.A2A_INVOCATION_COOLDOWN_MS = 'NaN';
        process.env.A2A_INBOUND_RATE_LIMIT_PER_MIN = '0';

        const cfg = loadInvocationGuardConfig();
        expect(cfg.maxInvocationsPerSession).toBe(10);
        expect(cfg.maxUniqueAgentsPerSession).toBe(3);
        expect(cfg.cooldownMs).toBe(5000);
        expect(cfg.inboundRateLimitPerMin).toBe(5);
    });

    it('allows cooldownMs of zero', () => {
        process.env.A2A_INVOCATION_COOLDOWN_MS = '0';
        const cfg = loadInvocationGuardConfig();
        expect(cfg.cooldownMs).toBe(0);
    });
});

// ── SessionInvocationBudget ──────────────────────────────────────────────

describe('SessionInvocationBudget', () => {
    it('allows invocations within all limits', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 5,
            maxUniqueAgentsPerSession: 3,
            cooldownMs: 0,
        });

        const result = budget.check('https://agent-a.example.com');
        expect(result.allowed).toBe(true);
    });

    it('blocks after invocation limit reached', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 2,
            maxUniqueAgentsPerSession: 10,
            cooldownMs: 0,
        });

        budget.record('https://agent-a.example.com');
        budget.record('https://agent-a.example.com');

        const result = budget.check('https://agent-a.example.com');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('INVOCATION_LIMIT');
        expect(result.detail).toContain('2');
    });

    it('blocks new unique agent when limit reached', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 2,
            cooldownMs: 0,
        });

        budget.record('https://agent-a.example.com');
        budget.record('https://agent-b.example.com');

        // Same agents still allowed
        const r1 = budget.check('https://agent-a.example.com');
        expect(r1.allowed).toBe(true);

        // New agent blocked
        const r2 = budget.check('https://agent-c.example.com');
        expect(r2.allowed).toBe(false);
        expect(r2.reason).toBe('UNIQUE_AGENT_LIMIT');
    });

    it('allows repeated calls to same agent (does not count as new unique)', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 1,
            cooldownMs: 0,
        });

        budget.record('https://agent-a.example.com');

        // Same agent is fine
        const result = budget.check('https://agent-a.example.com');
        expect(result.allowed).toBe(true);
    });

    it('enforces cooldown between invocations', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 100,
            cooldownMs: 5000,
        });

        budget.record('https://agent-a.example.com');

        // Immediately check — should be in cooldown
        const result = budget.check('https://agent-a.example.com');
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('COOLDOWN');
        expect(result.detail).toContain('Retry after');
    });

    it('allows invocation after cooldown expires', async () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 100,
            cooldownMs: 50,
        });

        budget.record('https://agent-a.example.com');

        await new Promise((r) => setTimeout(r, 60));

        const result = budget.check('https://agent-a.example.com');
        expect(result.allowed).toBe(true);
    });

    it('skips cooldown on first invocation', () => {
        const budget = new SessionInvocationBudget({
            cooldownMs: 10_000,
        });

        // First check — no previous invocation, cooldown should not apply
        const result = budget.check('https://agent-a.example.com');
        expect(result.allowed).toBe(true);
    });

    it('tracks invocation and unique agent counts', () => {
        const budget = new SessionInvocationBudget({
            maxInvocationsPerSession: 100,
            maxUniqueAgentsPerSession: 100,
            cooldownMs: 0,
        });

        expect(budget.getInvocationCount()).toBe(0);
        expect(budget.getUniqueAgentCount()).toBe(0);

        budget.record('https://agent-a.example.com');
        budget.record('https://agent-b.example.com');
        budget.record('https://agent-a.example.com');

        expect(budget.getInvocationCount()).toBe(3);
        expect(budget.getUniqueAgentCount()).toBe(2);
    });
});

// ── InboundA2ARateLimiter ────────────────────────────────────────────────

describe('InboundA2ARateLimiter', () => {
    let limiter: InboundA2ARateLimiter;

    afterEach(() => {
        limiter?.stop();
    });

    it('allows requests under the limit', () => {
        limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 3,
            inboundRateLimitWindowMs: 60_000,
        });

        for (let i = 0; i < 3; i++) {
            limiter.record('agent-a');
        }

        // 3 recorded but check looks at existing window — 4th should be blocked
        const result = limiter.check('agent-a');
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('allows first request from unknown agent', () => {
        limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 5,
        });

        const result = limiter.check('new-agent');
        expect(result.allowed).toBe(true);
    });

    it('tracks different source agents independently', () => {
        limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 2,
            inboundRateLimitWindowMs: 60_000,
        });

        limiter.record('agent-a');
        limiter.record('agent-a');

        // agent-a is at limit
        expect(limiter.check('agent-a').allowed).toBe(false);

        // agent-b is fine
        expect(limiter.check('agent-b').allowed).toBe(true);
    });

    it('allows requests after window expires', async () => {
        limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 1,
            inboundRateLimitWindowMs: 50,
        });

        limiter.record('agent-a');
        expect(limiter.check('agent-a').allowed).toBe(false);

        await new Promise((r) => setTimeout(r, 60));

        expect(limiter.check('agent-a').allowed).toBe(true);
    });

    it('reset clears all windows', () => {
        limiter = new InboundA2ARateLimiter({
            inboundRateLimitPerMin: 1,
        });

        limiter.record('agent-a');
        expect(limiter.check('agent-a').allowed).toBe(false);

        limiter.reset();
        expect(limiter.check('agent-a').allowed).toBe(true);
    });

    it('stop cleans up sweep timer without error', () => {
        limiter = new InboundA2ARateLimiter();
        limiter.stop();
        limiter.stop(); // Double stop should be safe
    });
});

// ── Constants ────────────────────────────────────────────────────────────

describe('MAX_A2A_DEPTH', () => {
    it('is set to 3', () => {
        expect(MAX_A2A_DEPTH).toBe(3);
    });
});
