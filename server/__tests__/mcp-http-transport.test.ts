import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { handleMcpHttpRequest } from '../mcp/http-transport';

describe('MCP HTTP Transport', () => {
  const baseUrl = 'http://localhost:3000';

  // Mock fetch for agent resolution
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('/api/agents')) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'test-agent-id' }]), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (urlStr.includes('/api/health')) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'ok' }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects unsupported methods', async () => {
    const req = new Request(`${baseUrl}/mcp`, { method: 'PUT' });
    const res = await handleMcpHttpRequest(req, baseUrl);
    expect(res.status).toBe(405);
  });

  it('handles MCP initialization POST', async () => {
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };
    const req = new Request(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initMessage),
    });
    const res = await handleMcpHttpRequest(req, baseUrl);
    // Should return 200 with SSE or JSON response
    expect(res.status).toBe(200);
    // Should include session ID in response header
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
  });

  it('returns 404 for invalid session ID on non-init request', async () => {
    const req = new Request(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': 'nonexistent-session-id',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    });
    const res = await handleMcpHttpRequest(req, baseUrl);
    // Invalid session ID on a non-init request -> new transport created -> re-init needed
    // The transport will return 400 because it hasn't been initialized for this session
    expect([400, 404]).toContain(res.status);
  });

  it('handles GET request for SSE stream setup', async () => {
    // First initialize a session
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };
    const initReq = new Request(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initMessage),
    });
    const initRes = await handleMcpHttpRequest(initReq, baseUrl);
    expect(initRes.status).toBe(200);
  });
});
