import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CorvidClient, CorvidApiError } from '../src/client.js';

// Minimal mock HTTP server for testing
let mockServer: ReturnType<typeof Bun.serve> | null = null;
let mockHandler: (req: Request) => Response | Promise<Response> = () =>
  new Response('not found', { status: 404 });

function startMock(port: number) {
  mockServer = Bun.serve({
    port,
    fetch: (req) => mockHandler(req),
  });
}

function stopMock() {
  mockServer?.stop(true);
  mockServer = null;
}

describe('CorvidClient', () => {
  const PORT = 19876;
  const BASE = `http://localhost:${PORT}`;

  beforeEach(() => startMock(PORT));
  afterEach(() => stopMock());

  it('sends GET requests', async () => {
    mockHandler = (req) => {
      expect(new URL(req.url).pathname).toBe('/api/agents');
      expect(req.method).toBe('GET');
      return Response.json([{ id: 'a1', name: 'test-agent' }]);
    };

    const client = new CorvidClient({ baseUrl: BASE });
    const result = await client.get('/api/agents');
    expect(result).toEqual([{ id: 'a1', name: 'test-agent' }]);
  });

  it('sends POST requests with body', async () => {
    mockHandler = async (req) => {
      expect(req.method).toBe('POST');
      const body = await req.json();
      expect(body).toEqual({ projectId: 'p1' });
      return Response.json({ id: 's1', status: 'running' });
    };

    const client = new CorvidClient({ baseUrl: BASE });
    const result = await client.post('/api/sessions', { projectId: 'p1' });
    expect(result).toEqual({ id: 's1', status: 'running' });
  });

  it('includes Authorization header when apiKey is set', async () => {
    mockHandler = (req) => {
      expect(req.headers.get('Authorization')).toBe('Bearer test-key-123');
      return Response.json({ ok: true });
    };

    const client = new CorvidClient({ baseUrl: BASE, apiKey: 'test-key-123' });
    await client.get('/api/health');
  });

  it('throws CorvidApiError on non-2xx responses', async () => {
    mockHandler = () => Response.json({ error: 'Not found' }, { status: 404 });

    const client = new CorvidClient({ baseUrl: BASE });
    await expect(client.get('/api/agents/missing')).rejects.toThrow(CorvidApiError);
    try {
      await client.get('/api/agents/missing');
    } catch (err) {
      expect(err).toBeInstanceOf(CorvidApiError);
      expect((err as CorvidApiError).status).toBe(404);
      expect((err as CorvidApiError).message).toBe('Not found');
    }
  });

  it('strips trailing slashes from baseUrl', async () => {
    mockHandler = (req) => {
      expect(new URL(req.url).pathname).toBe('/api/agents');
      return Response.json([]);
    };

    const client = new CorvidClient({ baseUrl: `${BASE}///` });
    await client.get('/api/agents');
  });
});
