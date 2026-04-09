import { describe, expect, it } from 'bun:test';
import { handleBridgeDeliveryRoutes } from '../routes/bridge-delivery';

describe('GET /api/bridges/delivery', () => {
  it('returns delivery metrics', () => {
    const req = new Request('http://localhost/api/bridges/delivery', { method: 'GET' });
    const url = new URL(req.url);
    const response = handleBridgeDeliveryRoutes(req, url);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });

  it('returns null for non-matching paths', () => {
    const req = new Request('http://localhost/api/bridges/other', { method: 'GET' });
    const url = new URL(req.url);
    expect(handleBridgeDeliveryRoutes(req, url)).toBeNull();
  });

  it('returns null for non-GET methods', () => {
    const req = new Request('http://localhost/api/bridges/delivery', { method: 'POST' });
    const url = new URL(req.url);
    expect(handleBridgeDeliveryRoutes(req, url)).toBeNull();
  });

  it('response body has all platform keys', async () => {
    const req = new Request('http://localhost/api/bridges/delivery', { method: 'GET' });
    const url = new URL(req.url);
    const response = handleBridgeDeliveryRoutes(req, url)!;
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toHaveProperty('discord');
    expect(body).toHaveProperty('telegram');
    expect(body).toHaveProperty('slack');
  });
});
