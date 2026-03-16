import { describe, test, expect } from 'bun:test';
import { EndpointRateLimiter } from '../middleware/endpoint-rate-limit';
import type { EndpointRateLimitConfig } from '../middleware/endpoint-rate-limit';

describe('EndpointRateLimiter parsePattern', () => {
    test('throws on pattern missing a space between method and path', () => {
        const config: EndpointRateLimitConfig = {
            rules: [
                {
                    pattern: 'GET/api/health', // missing space
                    tiers: {
                        public: { windowMs: 60_000, maxRequests: 10 },
                        user: { windowMs: 60_000, maxRequests: 100 },
                        admin: { windowMs: 60_000, maxRequests: 1000 },
                    },
                },
            ],
            exemptPaths: [],
            defaultTiers: {
                public: { windowMs: 60_000, maxRequests: 60 },
                user: { windowMs: 60_000, maxRequests: 300 },
                admin: { windowMs: 60_000, maxRequests: 1000 },
            },
        };

        expect(() => new EndpointRateLimiter(config)).toThrow(
            'Invalid endpoint pattern: "GET/api/health" (expected "METHOD /path", e.g. "GET /api/health"',
        );
    });
});
