import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { RateLimiter, loadRateLimitConfig, checkRateLimit } from '../middleware/rate-limit';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ maxGet: 5, maxMutation: 2, windowMs: 1000 });
    });

    afterEach(() => {
        limiter.stop();
    });

    it('allows requests under the limit', () => {
        for (let i = 0; i < 5; i++) {
            expect(limiter.check('127.0.0.1', 'GET')).toBeNull();
        }
    });

    it('blocks requests over the GET limit', () => {
        for (let i = 0; i < 5; i++) {
            expect(limiter.check('127.0.0.1', 'GET')).toBeNull();
        }
        const blocked = limiter.check('127.0.0.1', 'GET');
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);
        expect(blocked!.headers.get('Retry-After')).toBeTruthy();
    });

    it('blocks requests over the mutation limit', () => {
        expect(limiter.check('127.0.0.1', 'POST')).toBeNull();
        expect(limiter.check('127.0.0.1', 'POST')).toBeNull();
        const blocked = limiter.check('127.0.0.1', 'POST');
        expect(blocked).not.toBeNull();
        expect(blocked!.status).toBe(429);
    });

    it('tracks read and mutation buckets independently', () => {
        // Fill up mutation bucket
        expect(limiter.check('127.0.0.1', 'POST')).toBeNull();
        expect(limiter.check('127.0.0.1', 'POST')).toBeNull();
        expect(limiter.check('127.0.0.1', 'POST')).not.toBeNull(); // blocked

        // Read bucket should still be fine
        expect(limiter.check('127.0.0.1', 'GET')).toBeNull();
    });

    it('tracks different IPs independently', () => {
        // Fill IP 1
        for (let i = 0; i < 5; i++) {
            expect(limiter.check('10.0.0.1', 'GET')).toBeNull();
        }
        expect(limiter.check('10.0.0.1', 'GET')).not.toBeNull(); // blocked

        // IP 2 should be fine
        expect(limiter.check('10.0.0.2', 'GET')).toBeNull();
    });

    it('treats HEAD and OPTIONS as read requests', () => {
        for (let i = 0; i < 5; i++) {
            const method = i % 2 === 0 ? 'HEAD' : 'OPTIONS';
            expect(limiter.check('127.0.0.1', method)).toBeNull();
        }
        // Read bucket is full — GET should be blocked too
        expect(limiter.check('127.0.0.1', 'GET')).not.toBeNull();
    });

    it('treats PUT and DELETE as mutation requests', () => {
        expect(limiter.check('127.0.0.1', 'PUT')).toBeNull();
        expect(limiter.check('127.0.0.1', 'DELETE')).toBeNull();
        // Mutation bucket is full
        expect(limiter.check('127.0.0.1', 'POST')).not.toBeNull();
    });

    it('returns valid JSON in the 429 response body', async () => {
        for (let i = 0; i < 5; i++) {
            limiter.check('127.0.0.1', 'GET');
        }
        const blocked = limiter.check('127.0.0.1', 'GET');
        expect(blocked).not.toBeNull();
        const body = await blocked!.json();
        expect(body.error).toBe('Too many requests');
        expect(typeof body.retryAfter).toBe('number');
        expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('resets the limiter', () => {
        for (let i = 0; i < 5; i++) {
            limiter.check('127.0.0.1', 'GET');
        }
        expect(limiter.check('127.0.0.1', 'GET')).not.toBeNull(); // blocked

        limiter.reset();
        expect(limiter.check('127.0.0.1', 'GET')).toBeNull(); // allowed again
    });
});

describe('checkRateLimit', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ maxGet: 2, maxMutation: 1, windowMs: 1000 });
    });

    afterEach(() => {
        limiter.stop();
    });

    function makeReq(method: string, path: string, headers?: Record<string, string>): { req: Request; url: URL } {
        const url = new URL(`http://localhost:3000${path}`);
        return { req: new Request(url.toString(), { method, headers }), url };
    }

    it('exempts /api/health from rate limiting', () => {
        const { req, url } = makeReq('GET', '/api/health');
        // Should never be blocked, even if we spam it
        for (let i = 0; i < 10; i++) {
            expect(checkRateLimit(req, url, limiter)).toBeNull();
        }
    });

    it('exempts /ws from rate limiting', () => {
        const { req, url } = makeReq('GET', '/ws');
        for (let i = 0; i < 10; i++) {
            expect(checkRateLimit(req, url, limiter)).toBeNull();
        }
    });

    it('rate-limits normal API routes', () => {
        const { req, url } = makeReq('GET', '/api/agents');
        expect(checkRateLimit(req, url, limiter)).toBeNull();
        expect(checkRateLimit(req, url, limiter)).toBeNull();
        expect(checkRateLimit(req, url, limiter)).not.toBeNull(); // 3rd request blocked (limit=2)
    });

    it('extracts IP from X-Forwarded-For header', () => {
        const { req: req1, url: url1 } = makeReq('POST', '/api/sessions', { 'X-Forwarded-For': '1.2.3.4, 10.0.0.1' });
        expect(checkRateLimit(req1, url1, limiter)).toBeNull();

        // Same IP from different request should hit the same bucket
        const { req: req2, url: url2 } = makeReq('POST', '/api/sessions', { 'X-Forwarded-For': '1.2.3.4' });
        expect(checkRateLimit(req2, url2, limiter)).not.toBeNull(); // 2nd mutation from same IP blocked (limit=1)
    });
});

describe('loadRateLimitConfig', () => {
    it('returns defaults when env vars are not set', () => {
        const original = { ...process.env };
        delete process.env.RATE_LIMIT_GET;
        delete process.env.RATE_LIMIT_MUTATION;

        const config = loadRateLimitConfig();
        expect(config.maxGet).toBe(240);
        expect(config.maxMutation).toBe(60);
        expect(config.windowMs).toBe(60_000);

        // Restore
        Object.assign(process.env, original);
    });

    it('reads values from environment variables', () => {
        const original = { ...process.env };
        process.env.RATE_LIMIT_GET = '100';
        process.env.RATE_LIMIT_MUTATION = '20';

        const config = loadRateLimitConfig();
        expect(config.maxGet).toBe(100);
        expect(config.maxMutation).toBe(20);

        // Restore
        Object.assign(process.env, original);
    });

    it('falls back to defaults for invalid values', () => {
        const original = { ...process.env };
        process.env.RATE_LIMIT_GET = 'not-a-number';
        process.env.RATE_LIMIT_MUTATION = '-5';

        const config = loadRateLimitConfig();
        expect(config.maxGet).toBe(240);
        expect(config.maxMutation).toBe(60); // -5 is not > 0, falls back to default 60

        // Restore
        Object.assign(process.env, original);
    });
});
