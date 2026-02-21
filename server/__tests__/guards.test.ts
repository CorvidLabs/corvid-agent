import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    authGuard,
    roleGuard,
    rateLimitGuard,
    applyGuards,
    createRequestContext,
    requiresAdminRole,
    type RequestContext,
    type Guard,
} from '../middleware/guards';
import type { AuthConfig } from '../middleware/auth';
import { RateLimiter } from '../middleware/rate-limit';

// --- Helpers ----------------------------------------------------------------

function makeRequest(path: string, options?: RequestInit & { headers?: Record<string, string> }): Request {
    return new Request(`http://localhost:3000${path}`, options);
}

function makeUrl(path: string, params?: Record<string, string>): URL {
    const url = new URL(`http://localhost:3000${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return url;
}

const AUTH_ENABLED: AuthConfig = {
    apiKey: 'test-secret-key-12345',
    allowedOrigins: [],
    bindHost: '0.0.0.0',
};

const AUTH_DISABLED: AuthConfig = {
    apiKey: null,
    allowedOrigins: [],
    bindHost: '127.0.0.1',
};

// --- authGuard --------------------------------------------------------------

describe('authGuard', () => {
    it('allows authenticated requests and sets context', () => {
        const guard = authGuard(AUTH_ENABLED);
        const req = makeRequest('/api/sessions', {
            headers: { Authorization: `Bearer ${AUTH_ENABLED.apiKey}` },
        });
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        const result = guard(req, url, context);
        expect(result).toBeNull();
        expect(context.authenticated).toBe(true);
        expect(context.role).toBe('user');
    });

    it('denies unauthenticated requests', () => {
        const guard = authGuard(AUTH_ENABLED);
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        const result = guard(req, url, context);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(401);
    });

    it('grants admin role in dev mode (no API key)', () => {
        const guard = authGuard(AUTH_DISABLED);
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        const result = guard(req, url, context);
        expect(result).toBeNull();
        expect(context.authenticated).toBe(true);
        expect(context.role).toBe('admin');
    });

    it('extracts wallet address from query param', () => {
        const guard = authGuard(AUTH_DISABLED);
        const req = makeRequest('/api/sessions?wallet=ABCD1234');
        const url = makeUrl('/api/sessions', { wallet: 'ABCD1234' });
        const context = createRequestContext();

        guard(req, url, context);
        expect(context.walletAddress).toBe('ABCD1234');
    });
});

// --- roleGuard --------------------------------------------------------------

describe('roleGuard', () => {
    it('allows requests with matching role', () => {
        const guard = roleGuard('admin');
        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const context: RequestContext = { authenticated: true, role: 'admin' };

        const result = guard(req, url, context);
        expect(result).toBeNull();
    });

    it('allows requests matching any of multiple roles', () => {
        const guard = roleGuard('admin', 'user');
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context: RequestContext = { authenticated: true, role: 'user' };

        const result = guard(req, url, context);
        expect(result).toBeNull();
    });

    it('denies requests with wrong role', () => {
        const guard = roleGuard('admin');
        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const context: RequestContext = { authenticated: true, role: 'user' };

        const result = guard(req, url, context);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('denies unauthenticated requests', () => {
        const guard = roleGuard('admin');
        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const context: RequestContext = { authenticated: false };

        const result = guard(req, url, context);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(401);
    });

    it('denies requests with no role set', () => {
        const guard = roleGuard('admin');
        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const context: RequestContext = { authenticated: true };

        const result = guard(req, url, context);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('returns JSON error body with required roles', async () => {
        const guard = roleGuard('admin');
        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const context: RequestContext = { authenticated: true, role: 'user' };

        const result = guard(req, url, context);
        expect(result).not.toBeNull();
        const body = await result!.json();
        expect(body.error).toBe('Forbidden: insufficient role');
        expect(body.requiredRoles).toEqual(['admin']);
    });
});

// --- rateLimitGuard ---------------------------------------------------------

describe('rateLimitGuard', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ maxGet: 2, maxMutation: 1, windowMs: 1000 });
    });

    afterEach(() => {
        limiter.stop();
    });

    it('uses wallet address as rate limit key when available', () => {
        const guard = rateLimitGuard(limiter);
        const req = makeRequest('/api/agents');
        const url = makeUrl('/api/agents');
        const walletContext: RequestContext = { authenticated: true, walletAddress: 'WALLET123' };
        const ipContext: RequestContext = { authenticated: true };

        // Exhaust rate limit for wallet
        guard(req, url, walletContext);
        guard(req, url, walletContext);
        const blocked = guard(req, url, walletContext);
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);

        // IP-based context should still work (different key)
        const allowed = guard(req, url, ipContext);
        expect(allowed).toBeNull();
    });

    it('falls back to IP when no wallet address', () => {
        const guard = rateLimitGuard(limiter);
        const req = makeRequest('/api/agents');
        const url = makeUrl('/api/agents');
        const context: RequestContext = { authenticated: true };

        guard(req, url, context);
        guard(req, url, context);
        const blocked = guard(req, url, context);
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);
    });

    it('exempts /api/health from rate limiting', () => {
        const guard = rateLimitGuard(limiter);
        const req = makeRequest('/api/health');
        const url = makeUrl('/api/health');
        const context: RequestContext = { authenticated: true };

        // Should never be blocked
        for (let i = 0; i < 10; i++) {
            expect(guard(req, url, context)).toBeNull();
        }
    });

    it('exempts /ws from rate limiting', () => {
        const guard = rateLimitGuard(limiter);
        const req = makeRequest('/ws');
        const url = makeUrl('/ws');
        const context: RequestContext = { authenticated: true };

        for (let i = 0; i < 10; i++) {
            expect(guard(req, url, context)).toBeNull();
        }
    });
});

// --- applyGuards ------------------------------------------------------------

describe('applyGuards', () => {
    it('returns null when all guards pass', () => {
        const passGuard: Guard = () => null;
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        const result = applyGuards(req, url, context, passGuard, passGuard, passGuard);
        expect(result).toBeNull();
    });

    it('returns first denial', () => {
        const passGuard: Guard = () => null;
        const denyGuard: Guard = () => new Response('Denied', { status: 403 });
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        const result = applyGuards(req, url, context, passGuard, denyGuard, passGuard);
        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
    });

    it('short-circuits on first denial', () => {
        let thirdGuardCalled = false;
        const denyGuard: Guard = () => new Response('Denied', { status: 401 });
        const trackGuard: Guard = () => { thirdGuardCalled = true; return null; };
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        applyGuards(req, url, context, denyGuard, trackGuard);
        expect(thirdGuardCalled).toBe(false);
    });

    it('returns null for empty guard list', () => {
        const req = makeRequest('/api/sessions');
        const url = makeUrl('/api/sessions');
        const context = createRequestContext();

        const result = applyGuards(req, url, context);
        expect(result).toBeNull();
    });
});

// --- Full pipeline integration test -----------------------------------------

describe('full guard pipeline', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ maxGet: 100, maxMutation: 50, windowMs: 60_000 });
    });

    afterEach(() => {
        limiter.stop();
    });

    it('rate limit → auth → role → handler (all pass)', () => {
        const req = makeRequest('/metrics', {
            headers: { Authorization: `Bearer ${AUTH_DISABLED.apiKey}` },
        });
        const url = makeUrl('/metrics');
        const context = createRequestContext();

        // In dev mode (no API key), all guards should pass
        const denied = applyGuards(
            req, url, context,
            rateLimitGuard(limiter),
            authGuard(AUTH_DISABLED),
            roleGuard('admin'),
        );
        expect(denied).toBeNull();
        expect(context.authenticated).toBe(true);
        expect(context.role).toBe('admin');
    });

    it('rate limit → auth → role (auth fails)', () => {
        const req = makeRequest('/metrics');
        const url = makeUrl('/metrics');
        const context = createRequestContext();

        const denied = applyGuards(
            req, url, context,
            rateLimitGuard(limiter),
            authGuard(AUTH_ENABLED),
            roleGuard('admin'),
        );
        expect(denied).not.toBeNull();
        expect(denied!.status).toBe(401);
    });

    it('rate limit → auth → role (role fails)', () => {
        const req = makeRequest('/metrics', {
            headers: { Authorization: `Bearer ${AUTH_ENABLED.apiKey}` },
        });
        const url = makeUrl('/metrics');
        const context = createRequestContext();

        const denied = applyGuards(
            req, url, context,
            rateLimitGuard(limiter),
            authGuard(AUTH_ENABLED),
            roleGuard('admin'), // user role won't match 'admin'
        );
        // Standard API key gives 'user' role, not 'admin'
        expect(denied).not.toBeNull();
        expect(denied!.status).toBe(403);
    });
});

// --- requiresAdminRole ------------------------------------------------------

describe('requiresAdminRole', () => {
    it('returns true for /metrics', () => {
        expect(requiresAdminRole('/metrics')).toBe(true);
    });

    it('returns true for /api/audit-log', () => {
        expect(requiresAdminRole('/api/audit-log')).toBe(true);
    });

    it('returns true for /api/operational-mode', () => {
        expect(requiresAdminRole('/api/operational-mode')).toBe(true);
    });

    it('returns true for /api/backup', () => {
        expect(requiresAdminRole('/api/backup')).toBe(true);
    });

    it('returns true for /api/escalation-queue paths', () => {
        expect(requiresAdminRole('/api/escalation-queue')).toBe(true);
        expect(requiresAdminRole('/api/escalation-queue/1/resolve')).toBe(true);
    });

    it('returns false for normal API paths', () => {
        expect(requiresAdminRole('/api/sessions')).toBe(false);
        expect(requiresAdminRole('/api/agents')).toBe(false);
        expect(requiresAdminRole('/api/projects')).toBe(false);
    });
});

// --- createRequestContext ---------------------------------------------------

describe('createRequestContext', () => {
    it('creates unauthenticated context by default', () => {
        const ctx = createRequestContext();
        expect(ctx.authenticated).toBe(false);
        expect(ctx.walletAddress).toBeUndefined();
        expect(ctx.role).toBeUndefined();
    });

    it('sets wallet address when provided', () => {
        const ctx = createRequestContext('WALLET_ADDR');
        expect(ctx.walletAddress).toBe('WALLET_ADDR');
    });
});
