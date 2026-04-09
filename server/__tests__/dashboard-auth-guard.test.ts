import { afterEach, describe, expect, it } from 'bun:test';
import { createRequestContext, dashboardAuthGuard } from '../middleware/guards';

function fakeReq(path: string, headers?: Record<string, string>): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { headers }), url };
}

describe('dashboardAuthGuard', () => {
  const originalEnv = process.env.DASHBOARD_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DASHBOARD_API_KEY;
    } else {
      process.env.DASHBOARD_API_KEY = originalEnv;
    }
  });

  describe('localhost bypass', () => {
    it('allows unauthenticated access on 127.0.0.1', () => {
      process.env.DASHBOARD_API_KEY = 'test-dashboard-key';
      const guard = dashboardAuthGuard('127.0.0.1');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary');
      expect(guard(req, url, ctx)).toBeNull();
    });

    it('allows unauthenticated access on localhost', () => {
      process.env.DASHBOARD_API_KEY = 'test-dashboard-key';
      const guard = dashboardAuthGuard('localhost');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary');
      expect(guard(req, url, ctx)).toBeNull();
    });

    it('allows unauthenticated access on ::1', () => {
      process.env.DASHBOARD_API_KEY = 'test-dashboard-key';
      const guard = dashboardAuthGuard('::1');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary');
      expect(guard(req, url, ctx)).toBeNull();
    });
  });

  describe('non-dashboard paths passthrough', () => {
    it('ignores non-dashboard paths', () => {
      process.env.DASHBOARD_API_KEY = 'test-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/agents');
      expect(guard(req, url, ctx)).toBeNull();
    });
  });

  describe('already authenticated via API_KEY', () => {
    it('allows through when context.authenticated is true', () => {
      process.env.DASHBOARD_API_KEY = 'test-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      ctx.authenticated = true;
      const { req, url } = fakeReq('/api/dashboard/summary');
      expect(guard(req, url, ctx)).toBeNull();
    });
  });

  describe('DASHBOARD_API_KEY not set', () => {
    it('returns 401 when no DASHBOARD_API_KEY and not authenticated on non-localhost', () => {
      delete process.env.DASHBOARD_API_KEY;
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary');
      const res = guard(req, url, ctx);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    });
  });

  describe('DASHBOARD_API_KEY set on non-localhost', () => {
    it('returns 401 when no Authorization header', () => {
      process.env.DASHBOARD_API_KEY = 'secret-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary');
      const res = guard(req, url, ctx);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    });

    it('returns 401 for malformed Authorization header', () => {
      process.env.DASHBOARD_API_KEY = 'secret-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary', {
        Authorization: 'Basic abc123',
      });
      const res = guard(req, url, ctx);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    });

    it('returns 403 for invalid dashboard key', () => {
      process.env.DASHBOARD_API_KEY = 'secret-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary', {
        Authorization: 'Bearer wrong-key',
      });
      const res = guard(req, url, ctx);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    it('allows valid dashboard key', () => {
      process.env.DASHBOARD_API_KEY = 'secret-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/summary', {
        Authorization: 'Bearer secret-dashboard-key',
      });
      const res = guard(req, url, ctx);
      expect(res).toBeNull();
      expect(ctx.authenticated).toBe(true);
    });

    it('works with sub-paths under /api/dashboard', () => {
      process.env.DASHBOARD_API_KEY = 'secret-dashboard-key';
      const guard = dashboardAuthGuard('0.0.0.0');
      const ctx = createRequestContext();
      const { req, url } = fakeReq('/api/dashboard/other', {
        Authorization: 'Bearer secret-dashboard-key',
      });
      expect(guard(req, url, ctx)).toBeNull();
    });
  });
});
