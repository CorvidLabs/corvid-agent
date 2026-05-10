import { describe, expect, test } from 'bun:test';
import { BridgeService } from '../bridge/service';
import { handleDevBridgeRoutes } from './bridge';

describe('bridge routes', () => {
  const service = new BridgeService();
  const context = { role: 'operator' } as any;

  test('GET /api/bridge/sessions returns empty list', async () => {
    const req = new Request('http://localhost/api/bridge/sessions');
    const url = new URL(req.url);
    const res = await handleDevBridgeRoutes(req, url, null as any, context, service);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.sessions).toEqual([]);
    expect(body.count).toBe(0);
  });

  test('GET /api/bridge/sessions/:id returns 404 for unknown', async () => {
    const req = new Request('http://localhost/api/bridge/sessions/nonexistent');
    const url = new URL(req.url);
    const res = await handleDevBridgeRoutes(req, url, null as any, context, service);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error).toBe('Session not found');
  });

  test('non-bridge path returns null', async () => {
    const req = new Request('http://localhost/api/other');
    const url = new URL(req.url);
    const res = await handleDevBridgeRoutes(req, url, null as any, context, service);
    expect(res).toBeNull();
  });

  test('returns 503 when bridge service is null', async () => {
    const req = new Request('http://localhost/api/bridge/sessions');
    const url = new URL(req.url);
    const res = await handleDevBridgeRoutes(req, url, null as any, context, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  test('GET /api/bridge/sessions lists registered sessions', async () => {
    const svc = new BridgeService();
    const mockWs = { send: () => {}, close: () => {} } as any;
    svc.registerSession('s1', 'kyn-laptop', 'proj-1', { read: true, write: false, exec: false }, mockWs);

    const req = new Request('http://localhost/api/bridge/sessions');
    const url = new URL(req.url);
    const res = await handleDevBridgeRoutes(req, url, null as any, context, svc);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.count).toBe(1);
    expect(body.sessions[0].sessionId).toBe('s1');
    expect(body.sessions[0].label).toBe('kyn-laptop');
  });

  test('GET /api/bridge/sessions/:id returns session details', async () => {
    const svc = new BridgeService();
    const mockWs = { send: () => {}, close: () => {} } as any;
    svc.registerSession('s2', 'leif-desktop', 'sandbox', { read: true, write: true, exec: false }, mockWs);

    const req = new Request('http://localhost/api/bridge/sessions/s2');
    const url = new URL(req.url);
    const res = await handleDevBridgeRoutes(req, url, null as any, context, svc);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.sessionId).toBe('s2');
    expect(body.label).toBe('leif-desktop');
    expect(body.capabilities.write).toBe(true);
    expect(body.capabilities.exec).toBe(false);
  });
});
