import { describe, expect, it } from 'bun:test';
import { handleCursorRoutes } from '../routes/cursor';

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

describe('Cursor Routes', () => {
  it('returns null for non-cursor paths', async () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = await handleCursorRoutes(req, url);
    expect(res).toBeNull();
  });

  it('GET /api/cursor/status returns status object', async () => {
    const { req, url } = fakeReq('GET', '/api/cursor/status');
    const res = await handleCursorRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(['available', 'unavailable']).toContain(data.status);
    if (data.status === 'unavailable') {
      expect(data.bin).toBeNull();
    } else {
      expect(typeof data.bin).toBe('string');
    }
    expect(typeof data.configuredModels).toBe('number');
  });

  it('GET /api/cursor/models returns response', async () => {
    const { req, url } = fakeReq('GET', '/api/cursor/models');
    const res = await handleCursorRoutes(req, url);
    expect(res).not.toBeNull();
    const data = await res!.json();
    // 503 with error when cursor unavailable, 200 with models when available
    if (res!.status === 503) {
      expect(data.error).toBe('cursor-agent CLI not available');
      expect(data.models).toEqual([]);
    } else {
      expect(res!.status).toBe(200);
      expect(Array.isArray(data.models)).toBe(true);
    }
  });

  it('GET /api/cursor/models/configured returns configured models', async () => {
    const { req, url } = fakeReq('GET', '/api/cursor/models/configured');
    const res = await handleCursorRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data.models)).toBe(true);
  });

  it('returns null for POST to cursor endpoints', async () => {
    const { req, url } = fakeReq('POST', '/api/cursor/status');
    const res = await handleCursorRoutes(req, url);
    expect(res).toBeNull();
  });
});
