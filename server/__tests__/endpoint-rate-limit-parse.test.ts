import { describe, expect, test } from 'bun:test';
import type { EndpointRateLimitConfig } from '../middleware/endpoint-rate-limit';
import { EndpointRateLimiter } from '../middleware/endpoint-rate-limit';

describe('EndpointRateLimiter parsePattern', () => {
  test('throws on pattern missing a space between method and path', () => {
    const config: EndpointRateLimitConfig = {
      rules: [
        {
          pattern: 'GET/api/health', // missing space
          tiers: {
            public: { windowMs: 60_000, max: 10 },
            user: { windowMs: 60_000, max: 100 },
            admin: { windowMs: 60_000, max: 1000 },
          },
        },
      ],
      exemptPaths: [],
      defaults: {
        public: { windowMs: 60_000, max: 60 },
        user: { windowMs: 60_000, max: 300 },
        admin: { windowMs: 60_000, max: 1000 },
      },
    };

    expect(() => new EndpointRateLimiter(config)).toThrow(
      'Invalid endpoint pattern: "GET/api/health" (expected "METHOD /path", e.g. "GET /api/health"',
    );
  });
});
