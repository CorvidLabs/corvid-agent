import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    EndpointRateLimiter,
    loadEndpointRateLimitConfig,
    resolveTier,
    type EndpointRateLimitConfig,
    type EndpointRule,
    type TierLimit,
} from '../middleware/endpoint-rate-limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<EndpointRateLimitConfig>): EndpointRateLimitConfig {
    return {
        defaults: {
            public: { max: 10, windowMs: 1000 },
            user: { max: 20, windowMs: 1000 },
            admin: { max: 50, windowMs: 1000 },
        },
        rules: [],
        exemptPaths: ['/api/health', '/webhooks/github', '/ws'],
        ...overrides,
    };
}

function makeRule(pattern: string, tiers: Partial<Record<'public' | 'user' | 'admin', TierLimit>>): EndpointRule {
    return { pattern, tiers };
}

// ---------------------------------------------------------------------------
// EndpointRateLimiter — core behavior
// ---------------------------------------------------------------------------

describe('EndpointRateLimiter', () => {
    let limiter: EndpointRateLimiter;

    afterEach(() => {
        limiter?.stop();
    });

    describe('default limits (no matching rules)', () => {
        beforeEach(() => {
            limiter = new EndpointRateLimiter(makeConfig());
        });

        it('allows requests under the public limit', () => {
            for (let i = 0; i < 10; i++) {
                const result = limiter.check('127.0.0.1', 'GET', '/api/agents', 'public');
                expect(result.allowed).toBe(true);
            }
        });

        it('blocks requests over the public limit', () => {
            for (let i = 0; i < 10; i++) {
                limiter.check('127.0.0.1', 'GET', '/api/agents', 'public');
            }
            const result = limiter.check('127.0.0.1', 'GET', '/api/agents', 'public');
            expect(result.allowed).toBe(false);
            expect(result.response).toBeDefined();
            expect(result.response!.status).toBe(429);
        });

        it('applies different limits per tier', () => {
            // Public: max 10
            for (let i = 0; i < 10; i++) {
                limiter.check('public-user', 'GET', '/api/agents', 'public');
            }
            expect(limiter.check('public-user', 'GET', '/api/agents', 'public').allowed).toBe(false);

            // User: max 20 — should still have headroom
            for (let i = 0; i < 20; i++) {
                expect(limiter.check('auth-user', 'GET', '/api/agents', 'user').allowed).toBe(true);
            }
            expect(limiter.check('auth-user', 'GET', '/api/agents', 'user').allowed).toBe(false);

            // Admin: max 50
            for (let i = 0; i < 50; i++) {
                expect(limiter.check('admin-user', 'GET', '/api/agents', 'admin').allowed).toBe(true);
            }
            expect(limiter.check('admin-user', 'GET', '/api/agents', 'admin').allowed).toBe(false);
        });

        it('tracks different client keys independently', () => {
            for (let i = 0; i < 10; i++) {
                limiter.check('client-a', 'GET', '/api/agents', 'public');
            }
            expect(limiter.check('client-a', 'GET', '/api/agents', 'public').allowed).toBe(false);
            expect(limiter.check('client-b', 'GET', '/api/agents', 'public').allowed).toBe(true);
        });
    });

    describe('per-endpoint rules', () => {
        beforeEach(() => {
            limiter = new EndpointRateLimiter(makeConfig({
                rules: [
                    makeRule('POST /api/messages', {
                        public: { max: 3, windowMs: 1000 },
                        user: { max: 10, windowMs: 1000 },
                        admin: { max: 30, windowMs: 1000 },
                    }),
                    makeRule('GET /api/agents', {
                        public: { max: 5, windowMs: 1000 },
                        user: { max: 15, windowMs: 1000 },
                    }),
                    makeRule('* /api/tools/*', {
                        public: { max: 2, windowMs: 1000 },
                        user: { max: 5, windowMs: 1000 },
                    }),
                ],
            }));
        });

        it('applies exact match rule for POST /api/messages', () => {
            for (let i = 0; i < 3; i++) {
                expect(limiter.check('client', 'POST', '/api/messages', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client', 'POST', '/api/messages', 'public').allowed).toBe(false);
        });

        it('applies exact match rule for GET /api/agents', () => {
            for (let i = 0; i < 5; i++) {
                expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(false);
        });

        it('does not match rule when method differs', () => {
            // POST /api/messages has max 3, but GET /api/messages should use defaults (max 10)
            for (let i = 0; i < 10; i++) {
                expect(limiter.check('client', 'GET', '/api/messages', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client', 'GET', '/api/messages', 'public').allowed).toBe(false);
        });

        it('applies prefix match with wildcard method', () => {
            // * /api/tools/* should match any method under /api/tools/
            for (let i = 0; i < 2; i++) {
                expect(limiter.check('client', 'POST', '/api/tools/execute', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client', 'POST', '/api/tools/execute', 'public').allowed).toBe(false);
        });

        it('prefix match works for GET as well', () => {
            for (let i = 0; i < 2; i++) {
                expect(limiter.check('client2', 'GET', '/api/tools/list', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client2', 'GET', '/api/tools/list', 'public').allowed).toBe(false);
        });

        it('prefix match does not match the parent path itself unless trailing wildcard allows it', () => {
            // /api/tools/* should match /api/tools (the parent) as well
            for (let i = 0; i < 2; i++) {
                expect(limiter.check('client3', 'GET', '/api/tools', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client3', 'GET', '/api/tools', 'public').allowed).toBe(false);
        });

        it('uses first matching rule (first match wins)', () => {
            // If we add a more specific rule first, it should take precedence
            const config = makeConfig({
                rules: [
                    makeRule('POST /api/tools/execute', {
                        public: { max: 1, windowMs: 1000 },
                    }),
                    makeRule('* /api/tools/*', {
                        public: { max: 100, windowMs: 1000 },
                    }),
                ],
            });
            const l = new EndpointRateLimiter(config);

            expect(l.check('client', 'POST', '/api/tools/execute', 'public').allowed).toBe(true);
            expect(l.check('client', 'POST', '/api/tools/execute', 'public').allowed).toBe(false);

            l.stop();
        });

        it('falls back to defaults for unmatched paths', () => {
            // /api/sessions doesn't match any rule, so defaults apply (max 10 for public)
            for (let i = 0; i < 10; i++) {
                expect(limiter.check('client', 'POST', '/api/sessions', 'public').allowed).toBe(true);
            }
            expect(limiter.check('client', 'POST', '/api/sessions', 'public').allowed).toBe(false);
        });

        it('rule-specific limits are independent per client', () => {
            for (let i = 0; i < 3; i++) {
                limiter.check('client-a', 'POST', '/api/messages', 'public');
            }
            expect(limiter.check('client-a', 'POST', '/api/messages', 'public').allowed).toBe(false);
            expect(limiter.check('client-b', 'POST', '/api/messages', 'public').allowed).toBe(true);
        });
    });

    describe('rate limit headers', () => {
        beforeEach(() => {
            limiter = new EndpointRateLimiter(makeConfig({
                defaults: {
                    public: { max: 5, windowMs: 1000 },
                },
                rules: [],
            }));
        });

        it('includes X-RateLimit-Limit header', () => {
            const result = limiter.check('client', 'GET', '/api/agents', 'public');
            expect(result.headers['X-RateLimit-Limit']).toBe('5');
        });

        it('includes X-RateLimit-Remaining header that decrements', () => {
            const r1 = limiter.check('client', 'GET', '/api/agents', 'public');
            expect(r1.headers['X-RateLimit-Remaining']).toBe('4');

            const r2 = limiter.check('client', 'GET', '/api/agents', 'public');
            expect(r2.headers['X-RateLimit-Remaining']).toBe('3');
        });

        it('includes X-RateLimit-Reset header (epoch seconds)', () => {
            const result = limiter.check('client', 'GET', '/api/agents', 'public');
            const reset = parseInt(result.headers['X-RateLimit-Reset'], 10);
            expect(reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
        });

        it('includes Retry-After header on 429 responses', async () => {
            for (let i = 0; i < 5; i++) {
                limiter.check('client', 'GET', '/api/agents', 'public');
            }
            const blocked = limiter.check('client', 'GET', '/api/agents', 'public');
            expect(blocked.allowed).toBe(false);
            expect(blocked.headers['Retry-After']).toBeDefined();
            expect(parseInt(blocked.headers['Retry-After'], 10)).toBeGreaterThan(0);
        });

        it('429 response body includes retryAfter', async () => {
            for (let i = 0; i < 5; i++) {
                limiter.check('client', 'GET', '/api/agents', 'public');
            }
            const blocked = limiter.check('client', 'GET', '/api/agents', 'public');
            expect(blocked.response).toBeDefined();
            const body = await blocked.response!.json();
            expect(body.error).toBe('Too many requests');
            expect(typeof body.retryAfter).toBe('number');
        });

        it('returns no headers for exempt paths', () => {
            const result = limiter.check('client', 'GET', '/api/health', 'public');
            expect(result.allowed).toBe(true);
            expect(Object.keys(result.headers).length).toBe(0);
        });
    });

    describe('exempt paths', () => {
        beforeEach(() => {
            limiter = new EndpointRateLimiter(makeConfig({
                defaults: { public: { max: 1, windowMs: 1000 } },
                exemptPaths: ['/api/health', '/webhooks/github', '/ws', '/docs/*'],
            }));
        });

        it('exempts /api/health from rate limiting', () => {
            for (let i = 0; i < 20; i++) {
                expect(limiter.check('client', 'GET', '/api/health', 'public').allowed).toBe(true);
            }
        });

        it('exempts /webhooks/github from rate limiting', () => {
            for (let i = 0; i < 20; i++) {
                expect(limiter.check('client', 'POST', '/webhooks/github', 'public').allowed).toBe(true);
            }
        });

        it('exempts /ws from rate limiting', () => {
            for (let i = 0; i < 20; i++) {
                expect(limiter.check('client', 'GET', '/ws', 'public').allowed).toBe(true);
            }
        });

        it('exempts prefix paths like /docs/*', () => {
            for (let i = 0; i < 20; i++) {
                expect(limiter.check('client', 'GET', '/docs/api', 'public').allowed).toBe(true);
            }
        });

        it('does not exempt non-matching paths', () => {
            expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(true);
            expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(false);
        });
    });

    describe('reset and stop', () => {
        it('reset() clears all tracked buckets', () => {
            limiter = new EndpointRateLimiter(makeConfig({
                defaults: { public: { max: 2, windowMs: 1000 } },
            }));

            limiter.check('client', 'GET', '/api/agents', 'public');
            limiter.check('client', 'GET', '/api/agents', 'public');
            expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(false);

            limiter.reset();
            expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(true);
        });

        it('stop() stops the sweep timer without error', () => {
            limiter = new EndpointRateLimiter(makeConfig());
            limiter.stop();
            // Should not throw
            limiter.stop();
        });
    });
});

// ---------------------------------------------------------------------------
// resolveTier
// ---------------------------------------------------------------------------

describe('resolveTier', () => {
    it('returns public for unauthenticated requests', () => {
        expect(resolveTier(false)).toBe('public');
        expect(resolveTier(false, 'admin')).toBe('public');
    });

    it('returns admin for authenticated admin role', () => {
        expect(resolveTier(true, 'admin')).toBe('admin');
    });

    it('returns user for authenticated non-admin role', () => {
        expect(resolveTier(true, 'user')).toBe('user');
        expect(resolveTier(true)).toBe('user');
        expect(resolveTier(true, 'editor')).toBe('user');
    });
});

// ---------------------------------------------------------------------------
// loadEndpointRateLimitConfig
// ---------------------------------------------------------------------------

describe('loadEndpointRateLimitConfig', () => {
    it('returns valid default config', () => {
        const config = loadEndpointRateLimitConfig();
        expect(config.defaults).toBeDefined();
        expect(config.defaults.public).toBeDefined();
        expect(config.defaults.user).toBeDefined();
        expect(config.defaults.admin).toBeDefined();
        expect(config.rules.length).toBeGreaterThan(0);
        expect(config.exemptPaths).toContain('/api/health');
        expect(config.exemptPaths).toContain('/ws');
    });

    it('admin limits are higher than user limits', () => {
        const config = loadEndpointRateLimitConfig();
        expect(config.defaults.admin!.max).toBeGreaterThan(config.defaults.user!.max);
    });

    it('user limits are higher than public limits', () => {
        const config = loadEndpointRateLimitConfig();
        expect(config.defaults.user!.max).toBeGreaterThan(config.defaults.public!.max);
    });
});

// ---------------------------------------------------------------------------
// Integration: guard behavior
// ---------------------------------------------------------------------------

describe('endpointRateLimitGuard integration', () => {
    let limiter: EndpointRateLimiter;

    beforeEach(() => {
        limiter = new EndpointRateLimiter(makeConfig({
            defaults: { public: { max: 2, windowMs: 1000 }, user: { max: 5, windowMs: 1000 } },
            rules: [
                makeRule('POST /api/messages', {
                    public: { max: 1, windowMs: 1000 },
                    user: { max: 3, windowMs: 1000 },
                }),
            ],
        }));
    });

    afterEach(() => {
        limiter.stop();
    });

    it('authenticated user gets higher per-endpoint limit than public', () => {
        // Public: max 1 for POST /api/messages
        expect(limiter.check('pub', 'POST', '/api/messages', 'public').allowed).toBe(true);
        expect(limiter.check('pub', 'POST', '/api/messages', 'public').allowed).toBe(false);

        // User: max 3 for POST /api/messages
        for (let i = 0; i < 3; i++) {
            expect(limiter.check('auth', 'POST', '/api/messages', 'user').allowed).toBe(true);
        }
        expect(limiter.check('auth', 'POST', '/api/messages', 'user').allowed).toBe(false);
    });

    it('different endpoints have independent counters', () => {
        // POST /api/messages: max 1 for public
        expect(limiter.check('client', 'POST', '/api/messages', 'public').allowed).toBe(true);
        expect(limiter.check('client', 'POST', '/api/messages', 'public').allowed).toBe(false);

        // GET /api/agents: uses default (max 2 for public) — should still be allowed
        expect(limiter.check('client', 'GET', '/api/agents', 'public').allowed).toBe(true);
    });
});
