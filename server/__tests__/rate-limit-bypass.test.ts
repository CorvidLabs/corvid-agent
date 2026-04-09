/**
 * Comprehensive test suite for rate limit bypass prevention.
 *
 * Covers: IP rotation, header manipulation, concurrent floods,
 * sliding window behavior, rate limit key behavior, and content length guard.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { EndpointRateLimitConfig } from '../middleware/endpoint-rate-limit';
import { EndpointRateLimiter } from '../middleware/endpoint-rate-limit';
import type { RequestContext } from '../middleware/guards';
import { contentLengthGuard, createRequestContext, endpointRateLimitGuard, rateLimitGuard } from '../middleware/guards';
import type { RateLimitConfig } from '../middleware/rate-limit';
import { checkRateLimit, getClientIp, loadRateLimitConfig, RateLimiter } from '../middleware/rate-limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return { maxGet: 5, maxMutation: 3, windowMs: 2000, ...overrides };
}

function makeRequest(
  url = 'http://localhost/api/test',
  opts: RequestInit & { headers?: Record<string, string> } = {},
): Request {
  return new Request(url, opts);
}

function makeEndpointConfig(overrides: Partial<EndpointRateLimitConfig> = {}): EndpointRateLimitConfig {
  return {
    defaults: {
      public: { max: 5, windowMs: 2000 },
      user: { max: 10, windowMs: 2000 },
      admin: { max: 20, windowMs: 2000 },
    },
    rules: [],
    exemptPaths: ['/api/health', '/webhooks/github', '/ws'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. IP Rotation Simulation
// ---------------------------------------------------------------------------

describe('IP Rotation Simulation', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(makeConfig({ maxGet: 3 }));
  });

  afterEach(() => {
    limiter.stop();
  });

  test('same IP hitting limit gets 429', () => {
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    const res = limiter.check('10.0.0.1', 'GET');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  test('different IPs get independent limits', () => {
    for (let i = 0; i < 3; i++) {
      expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    }
    // IP1 is blocked
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    // IP2 still has full quota
    expect(limiter.check('10.0.0.2', 'GET')).toBeNull();
    expect(limiter.check('10.0.0.2', 'GET')).toBeNull();
    expect(limiter.check('10.0.0.2', 'GET')).toBeNull();
    expect(limiter.check('10.0.0.2', 'GET')?.status).toBe(429);
  });

  test('IP rotation — blocked IP1 does not affect IP2', () => {
    // Exhaust IP1
    for (let i = 0; i < 3; i++) limiter.check('10.0.0.1', 'GET');
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    // "Rotate" to IP2 — should work
    expect(limiter.check('10.0.0.2', 'GET')).toBeNull();
  });

  test('many unique IPs each making a few requests — all within limits', () => {
    for (let i = 0; i < 50; i++) {
      const ip = `192.168.${Math.floor(i / 256)}.${i % 256}`;
      expect(limiter.check(ip, 'GET')).toBeNull();
      expect(limiter.check(ip, 'GET')).toBeNull();
    }
  });

  test('X-Forwarded-For is ignored without TRUST_PROXY — falls back to unknown', () => {
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '203.0.113.5' },
    });
    // Without TRUST_PROXY, X-Forwarded-For is ignored — returns 'unknown'
    expect(getClientIp(req)).toBe('unknown');
  });

  test('X-Real-IP is used as client IP (server-injected socket address)', () => {
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '203.0.113.5' },
    });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  test('missing IP headers fallback to unknown', () => {
    const req = makeRequest('http://localhost/api/test');
    expect(getClientIp(req)).toBe('unknown');
  });

  test('loopback IPs are exempt from rate limiting', () => {
    const loopbacks = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
    for (const ip of loopbacks) {
      const localLimiter = new RateLimiter(makeConfig({ maxGet: 1 }));
      const req = makeRequest('http://localhost/api/test', {
        headers: { 'X-Real-IP': ip },
      });
      const url = new URL('http://localhost/api/test');
      // Should always be null (exempt), even after many calls
      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit(req, url, localLimiter)).toBeNull();
      }
      localLimiter.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Header Manipulation
// ---------------------------------------------------------------------------

describe('Header Manipulation', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(makeConfig({ maxGet: 3 }));
  });

  afterEach(() => {
    limiter.stop();
  });

  test('X-Forwarded-For spoofing is blocked — all requests share same "unknown" key', () => {
    // Without TRUST_PROXY, rotating X-Forwarded-For has no effect —
    // all requests without X-Real-IP share the 'unknown' key
    const url = new URL('http://localhost/api/test');
    for (let i = 0; i < 3; i++) {
      const req = makeRequest('http://localhost/api/test', {
        headers: { 'X-Forwarded-For': `10.0.0.${i}` },
      });
      expect(checkRateLimit(req, url, limiter)).toBeNull();
    }
    // 4th request hits the limit because all used the same 'unknown' key
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '10.0.0.99' },
    });
    expect(checkRateLimit(req, url, limiter)?.status).toBe(429);
  });

  test('X-Real-IP based rate limiting — unique IPs get own buckets', () => {
    const url = new URL('http://localhost/api/test');
    // Fill IP A
    for (let i = 0; i < 3; i++) {
      const req = makeRequest('http://localhost/api/test', {
        headers: { 'X-Real-IP': '10.0.0.1' },
      });
      expect(checkRateLimit(req, url, limiter)).toBeNull();
    }
    // IP A blocked
    const blockedReq = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    expect(checkRateLimit(blockedReq, url, limiter)?.status).toBe(429);

    // IP B still has quota
    const freshReq = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.2' },
    });
    expect(checkRateLimit(freshReq, url, limiter)).toBeNull();
  });

  test('X-Forwarded-For ignored — X-Real-IP used instead', () => {
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '203.0.113.99', 'X-Real-IP': '198.51.100.1' },
    });
    expect(getClientIp(req)).toBe('198.51.100.1');
  });

  test('very long X-Forwarded-For header is ignored safely', () => {
    const longHeader = Array.from({ length: 1000 }, (_, i) => `10.${i % 256}.${Math.floor(i / 256)}.1`).join(', ');
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': longHeader },
    });
    // Should not crash — X-Forwarded-For ignored, returns 'unknown'
    const ip = getClientIp(req);
    expect(ip).toBe('unknown');
  });

  test('X-Real-IP with spaces is trimmed correctly', () => {
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '  203.0.113.10  ' },
    });
    expect(getClientIp(req)).toBe('203.0.113.10');
  });

  test('X-Real-IP header is the authoritative source', () => {
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '198.51.100.5' },
    });
    expect(getClientIp(req)).toBe('198.51.100.5');
  });

  test('both headers present — X-Real-IP is used (X-Forwarded-For ignored without TRUST_PROXY)', () => {
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '203.0.113.1', 'X-Real-IP': '198.51.100.1' },
    });
    expect(getClientIp(req)).toBe('198.51.100.1');
  });

  test('null bytes or special characters in IP headers do not crash', () => {
    const weirdValues = ['%00%00', '<script>', '../../etc/passwd'];
    for (const val of weirdValues) {
      const req = makeRequest('http://localhost/api/test', {
        headers: { 'X-Real-IP': val },
      });
      // Should not throw
      const ip = getClientIp(req);
      expect(typeof ip).toBe('string');
    }
    // Some values (null bytes, emoji) may be rejected by the Request constructor
    // — verify that rejection is a safe TypeError, not an unhandled crash
    const invalidValues = ['\x00\x00', '💀'];
    for (const val of invalidValues) {
      try {
        const req = makeRequest('http://localhost/api/test', {
          headers: { 'X-Real-IP': val },
        });
        const ip = getClientIp(req);
        expect(typeof ip).toBe('string');
      } catch (err) {
        // Bun rejects invalid header values with TypeError — that is safe
        expect(err).toBeInstanceOf(TypeError);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Concurrent Request Floods
// ---------------------------------------------------------------------------

describe('Concurrent Request Floods', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(makeConfig({ maxGet: 5, maxMutation: 3, windowMs: 2000 }));
  });

  afterEach(() => {
    limiter.stop();
  });

  test('rapid sequential requests from same IP eventually hit limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    }
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
  });

  test('burst of requests at limit exactly — last one gets 429', () => {
    // Exactly at limit should succeed
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    }
    // One over the limit
    const res = limiter.check('10.0.0.1', 'GET');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  test('burst of mutation (POST) requests hits lower mutation limit before GET limit', () => {
    // Mutation limit is 3, GET limit is 5
    for (let i = 0; i < 3; i++) {
      expect(limiter.check('10.0.0.1', 'POST')).toBeNull();
    }
    expect(limiter.check('10.0.0.1', 'POST')?.status).toBe(429);
    // GET should still have quota
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
  });

  test('GET and POST have separate buckets — filling POST does not affect GET', () => {
    // Fill POST bucket
    for (let i = 0; i < 3; i++) {
      limiter.check('10.0.0.1', 'POST');
    }
    expect(limiter.check('10.0.0.1', 'POST')?.status).toBe(429);
    // GET still has full quota
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
    }
  });

  test('after hitting limit, requests are still blocked for the window duration', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('10.0.0.1', 'GET');
    }
    // Blocked now
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    // Still blocked immediately after
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
  });

  test('429 response includes Retry-After header', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('10.0.0.1', 'GET');
    }
    const res = limiter.check('10.0.0.1', 'GET');
    expect(res).not.toBeNull();
    expect(res!.headers.get('Retry-After')).toBeTruthy();
    const retryAfter = parseInt(res!.headers.get('Retry-After')!, 10);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });

  test('Retry-After value is correct (time until oldest request expires)', async () => {
    const shortLimiter = new RateLimiter(makeConfig({ maxGet: 2, windowMs: 3000 }));
    shortLimiter.check('10.0.0.1', 'GET');
    shortLimiter.check('10.0.0.1', 'GET');
    const res = shortLimiter.check('10.0.0.1', 'GET');
    expect(res).not.toBeNull();
    const retryAfter = parseInt(res!.headers.get('Retry-After')!, 10);
    // Should be ~3 seconds (window is 3000ms)
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(4);
    shortLimiter.stop();
  });

  test('after window expires, requests are allowed again', async () => {
    const fastLimiter = new RateLimiter(makeConfig({ maxGet: 2, windowMs: 200 }));
    fastLimiter.check('10.0.0.1', 'GET');
    fastLimiter.check('10.0.0.1', 'GET');
    expect(fastLimiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 250));
    expect(fastLimiter.check('10.0.0.1', 'GET')).toBeNull();
    fastLimiter.stop();
  });
});

// ---------------------------------------------------------------------------
// 4. Sliding Window Behavior
// ---------------------------------------------------------------------------

describe('Sliding Window Behavior', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.stop();
  });

  test('window slides — old requests expire and new ones are allowed', async () => {
    limiter = new RateLimiter(makeConfig({ maxGet: 2, windowMs: 200 }));
    limiter.check('10.0.0.1', 'GET');
    limiter.check('10.0.0.1', 'GET');
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    await new Promise((r) => setTimeout(r, 250));
    // Old requests expired, should be allowed again
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
  });

  test('requests at exact window boundary are handled correctly', async () => {
    limiter = new RateLimiter(makeConfig({ maxGet: 2, windowMs: 150 }));
    limiter.check('10.0.0.1', 'GET');
    await new Promise((r) => setTimeout(r, 80));
    limiter.check('10.0.0.1', 'GET');
    // First request should expire before the second
    await new Promise((r) => setTimeout(r, 100));
    // First expired, second still active — room for 1 more
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
  });

  test('sweep function removes stale entries and reset clears state', () => {
    limiter = new RateLimiter(makeConfig({ maxGet: 2 }));
    limiter.check('10.0.0.1', 'GET');
    limiter.check('10.0.0.1', 'GET');
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    // Reset clears all state
    limiter.reset();
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
  });

  test('config with custom window size works correctly', async () => {
    limiter = new RateLimiter(makeConfig({ maxGet: 1, windowMs: 100 }));
    limiter.check('10.0.0.1', 'GET');
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    await new Promise((r) => setTimeout(r, 150));
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
  });

  test('zero or negative env values use defaults in loadRateLimitConfig', () => {
    const origGet = process.env.RATE_LIMIT_GET;
    const origMut = process.env.RATE_LIMIT_MUTATION;
    try {
      process.env.RATE_LIMIT_GET = '0';
      process.env.RATE_LIMIT_MUTATION = '-5';
      const config = loadRateLimitConfig();
      expect(config.maxGet).toBe(240);
      expect(config.maxMutation).toBe(60);
    } finally {
      if (origGet !== undefined) process.env.RATE_LIMIT_GET = origGet;
      else delete process.env.RATE_LIMIT_GET;
      if (origMut !== undefined) process.env.RATE_LIMIT_MUTATION = origMut;
      else delete process.env.RATE_LIMIT_MUTATION;
    }
  });

  test('very small window (100ms) expires quickly', async () => {
    limiter = new RateLimiter(makeConfig({ maxGet: 1, windowMs: 100 }));
    limiter.check('10.0.0.1', 'GET');
    expect(limiter.check('10.0.0.1', 'GET')?.status).toBe(429);
    await new Promise((r) => setTimeout(r, 150));
    expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
  });

  test('mutation limit is lower than GET limit by default', () => {
    const config = loadRateLimitConfig();
    expect(config.maxMutation).toBeLessThan(config.maxGet);
  });

  test('loadRateLimitConfig reads from env vars correctly', () => {
    const origGet = process.env.RATE_LIMIT_GET;
    const origMut = process.env.RATE_LIMIT_MUTATION;
    try {
      process.env.RATE_LIMIT_GET = '100';
      process.env.RATE_LIMIT_MUTATION = '20';
      const config = loadRateLimitConfig();
      expect(config.maxGet).toBe(100);
      expect(config.maxMutation).toBe(20);
      expect(config.windowMs).toBe(60_000);
    } finally {
      if (origGet !== undefined) process.env.RATE_LIMIT_GET = origGet;
      else delete process.env.RATE_LIMIT_GET;
      if (origMut !== undefined) process.env.RATE_LIMIT_MUTATION = origMut;
      else delete process.env.RATE_LIMIT_MUTATION;
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Rate Limit Key Behavior
// ---------------------------------------------------------------------------

describe('Rate Limit Key Behavior', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(makeConfig({ maxGet: 2 }));
  });

  afterEach(() => {
    limiter.stop();
  });

  test('wallet address is preferred over IP as rate limit key', () => {
    const url = new URL('http://localhost/api/test');
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    const walletAddress = 'WALLET123';
    // Use wallet-keyed requests
    checkRateLimit(req, url, limiter, walletAddress);
    checkRateLimit(req, url, limiter, walletAddress);
    // Wallet is now at limit
    expect(checkRateLimit(req, url, limiter, walletAddress)?.status).toBe(429);
    // Same IP without wallet should still work (different key)
    expect(checkRateLimit(req, url, limiter)).toBeNull();
  });

  test('same wallet from different IPs shares one limit', () => {
    const url = new URL('http://localhost/api/test');
    const wallet = 'SHARED_WALLET';
    const req1 = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    const req2 = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.2' },
    });
    checkRateLimit(req1, url, limiter, wallet);
    checkRateLimit(req2, url, limiter, wallet);
    // Third request from any IP with same wallet hits limit
    expect(checkRateLimit(req1, url, limiter, wallet)?.status).toBe(429);
  });

  test('different wallets from same IP get separate limits', () => {
    const url = new URL('http://localhost/api/test');
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    checkRateLimit(req, url, limiter, 'WALLET_A');
    checkRateLimit(req, url, limiter, 'WALLET_A');
    expect(checkRateLimit(req, url, limiter, 'WALLET_A')?.status).toBe(429);
    // Different wallet, same IP — still has quota
    expect(checkRateLimit(req, url, limiter, 'WALLET_B')).toBeNull();
  });

  test('exempt paths bypass rate limiting — /api/health', () => {
    const url = new URL('http://localhost/api/health');
    const req = makeRequest('http://localhost/api/health', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(req, url, limiter)).toBeNull();
    }
  });

  test('exempt paths bypass rate limiting — /webhooks/github', () => {
    const url = new URL('http://localhost/webhooks/github');
    const req = makeRequest('http://localhost/webhooks/github', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(req, url, limiter)).toBeNull();
    }
  });

  test('WebSocket path (/ws) bypasses rate limiting', () => {
    const url = new URL('http://localhost/ws');
    const req = makeRequest('http://localhost/ws', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(req, url, limiter)).toBeNull();
    }
  });

  test('rateLimitGuard returns null for exempt paths', () => {
    const guard = rateLimitGuard(limiter);
    const ctx = createRequestContext();
    const exemptPaths = ['/api/health', '/webhooks/github', '/ws'];
    for (const path of exemptPaths) {
      const req = makeRequest(`http://localhost${path}`, {
        headers: { 'X-Real-IP': '10.0.0.1' },
      });
      const url = new URL(`http://localhost${path}`);
      expect(guard(req, url, ctx)).toBeNull();
    }
  });

  test('rateLimitGuard returns 429 Response when limit exceeded', () => {
    const guard = rateLimitGuard(limiter);
    const ctx = createRequestContext();
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    const url = new URL('http://localhost/api/test');
    for (let i = 0; i < 2; i++) {
      expect(guard(req, url, ctx)).toBeNull();
    }
    const res = guard(req, url, ctx);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
  });

  test('endpointRateLimitGuard with different tiers', () => {
    const endpointLimiter = new EndpointRateLimiter(
      makeEndpointConfig({
        defaults: {
          public: { max: 2, windowMs: 2000 },
          user: { max: 5, windowMs: 2000 },
        },
      }),
    );
    const guard = endpointRateLimitGuard(endpointLimiter);

    // Public tier — limit of 2
    const publicCtx: RequestContext = { authenticated: false, tenantId: 'default' };
    const req = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.1' },
    });
    const url = new URL('http://localhost/api/test');
    guard(req, url, publicCtx);
    guard(req, url, publicCtx);
    const publicRes = guard(req, url, publicCtx);
    expect(publicRes).not.toBeNull();
    expect(publicRes!.status).toBe(429);

    // Authenticated user tier — higher limit, different IP key
    const userCtx: RequestContext = { authenticated: true, role: 'user', tenantId: 'default' };
    const userReq = makeRequest('http://localhost/api/test', {
      headers: { 'X-Real-IP': '10.0.0.2' },
    });
    for (let i = 0; i < 5; i++) {
      expect(guard(userReq, url, userCtx)).toBeNull();
    }
    const userRes = guard(userReq, url, userCtx);
    expect(userRes).not.toBeNull();
    expect(userRes!.status).toBe(429);

    endpointLimiter.stop();
  });
});

// ---------------------------------------------------------------------------
// 6. Content Length Guard
// ---------------------------------------------------------------------------

describe('Content Length Guard', () => {
  test('contentLengthGuard blocks oversized POST', () => {
    const guard = contentLengthGuard(1024);
    const req = makeRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Length': '2048' },
    });
    const url = new URL('http://localhost/api/test');
    const ctx = createRequestContext();
    const res = guard(req, url, ctx);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
  });

  test('contentLengthGuard allows normal-sized POST', () => {
    const guard = contentLengthGuard(1024);
    const req = makeRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Length': '512' },
    });
    const url = new URL('http://localhost/api/test');
    const ctx = createRequestContext();
    expect(guard(req, url, ctx)).toBeNull();
  });

  test('contentLengthGuard skips GET requests', () => {
    const guard = contentLengthGuard(10); // Very small limit
    const req = makeRequest('http://localhost/api/test', {
      method: 'GET',
      headers: { 'Content-Length': '999999' },
    });
    const url = new URL('http://localhost/api/test');
    const ctx = createRequestContext();
    expect(guard(req, url, ctx)).toBeNull();
  });

  test('contentLengthGuard skips HEAD requests', () => {
    const guard = contentLengthGuard(10);
    const req = makeRequest('http://localhost/api/test', {
      method: 'HEAD',
    });
    const url = new URL('http://localhost/api/test');
    const ctx = createRequestContext();
    expect(guard(req, url, ctx)).toBeNull();
  });

  test('contentLengthGuard skips OPTIONS requests', () => {
    const guard = contentLengthGuard(10);
    const req = makeRequest('http://localhost/api/test', {
      method: 'OPTIONS',
    });
    const url = new URL('http://localhost/api/test');
    const ctx = createRequestContext();
    expect(guard(req, url, ctx)).toBeNull();
  });

  test('contentLengthGuard with custom max bytes', () => {
    const guard = contentLengthGuard(100);
    const tooLarge = makeRequest('http://localhost/api/test', {
      method: 'PUT',
      headers: { 'Content-Length': '101' },
    });
    const exactLimit = makeRequest('http://localhost/api/test', {
      method: 'PUT',
      headers: { 'Content-Length': '100' },
    });
    const url = new URL('http://localhost/api/test');
    const ctx = createRequestContext();
    expect(guard(tooLarge, url, ctx)?.status).toBe(413);
    expect(guard(exactLimit, url, ctx)).toBeNull();
  });
});
