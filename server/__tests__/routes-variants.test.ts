import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import type { RequestContext } from '../middleware/guards';
import { createRequestContext } from '../middleware/guards';
import { handleVariantRoutes } from '../routes/variants';

let db: Database;
const defaultContext = createRequestContext();

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  const opts: RequestInit = { method };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers = { 'Content-Type': 'application/json' };
  }
  return { req: new Request(url.toString(), opts), url };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterAll(() => db.close());

describe('Variant Routes — CRUD', () => {
  let variantId: string;

  it('GET /api/variants returns empty list initially', async () => {
    const { req, url } = fakeReq('GET', '/api/variants');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    const data = await (res as Response).json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('POST /api/variants rejects empty body', async () => {
    const { req, url } = fakeReq('POST', '/api/variants', {});
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(400);
  });

  it('POST /api/variants creates a variant', async () => {
    const { req, url } = fakeReq('POST', '/api/variants', {
      name: 'Security Hardened',
      description: 'Variant for security-focused agents',
      skillBundleIds: ['sb-1', 'sb-2'],
      personaIds: ['p-1'],
      preset: true,
    });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(201);
    const data = await (res as Response).json();
    expect(data.name).toBe('Security Hardened');
    expect(data.description).toBe('Variant for security-focused agents');
    expect(data.skillBundleIds).toEqual(['sb-1', 'sb-2']);
    expect(data.personaIds).toEqual(['p-1']);
    expect(data.preset).toBe(true);
    expect(data.id).toBeDefined();
    variantId = data.id;
  });

  it('GET /api/variants lists created variant', async () => {
    const { req, url } = fakeReq('GET', '/api/variants');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    const data = await (res as Response).json();
    expect(data.length).toBe(1);
    expect(data[0].name).toBe('Security Hardened');
  });

  it('GET /api/variants/:id returns single variant', async () => {
    const { req, url } = fakeReq('GET', `/api/variants/${variantId}`);
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.id).toBe(variantId);
    expect(data.name).toBe('Security Hardened');
  });

  it('GET /api/variants/:id returns 404 for unknown id', async () => {
    const { req, url } = fakeReq('GET', '/api/variants/nonexistent');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });

  it('PUT /api/variants/:id updates variant', async () => {
    const { req, url } = fakeReq('PUT', `/api/variants/${variantId}`, {
      name: 'Updated Name',
      description: 'Updated description',
    });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.name).toBe('Updated Name');
    expect(data.description).toBe('Updated description');
  });

  it('PUT /api/variants/:id returns 404 for unknown id', async () => {
    const { req, url } = fakeReq('PUT', '/api/variants/nonexistent', { name: 'x' });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });

  it('DELETE /api/variants/:id removes variant', async () => {
    // Create a variant to delete
    const createReq = fakeReq('POST', '/api/variants', { name: 'ToDelete' });
    const createRes = await handleVariantRoutes(createReq.req, createReq.url, db, defaultContext);
    const { id: delId } = await (createRes as Response).json();

    const { req, url } = fakeReq('DELETE', `/api/variants/${delId}`);
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.ok).toBe(true);

    // Confirm it's gone
    const getReq = fakeReq('GET', `/api/variants/${delId}`);
    const getRes = handleVariantRoutes(getReq.req, getReq.url, db, defaultContext);
    expect((getRes as Response).status).toBe(404);
  });

  it('DELETE /api/variants/:id returns 404 for unknown id', () => {
    const { req, url } = fakeReq('DELETE', '/api/variants/nonexistent');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });
});

describe('Variant Routes — Agent Assignment', () => {
  let agentId: string;
  let variantId: string;

  it('setup: create agent and variant', async () => {
    const agent = createAgent(db, { name: 'VariantTestAgent' });
    agentId = agent.id;

    const { req, url } = fakeReq('POST', '/api/variants', {
      name: 'AssignMe',
      personaIds: [],
    });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    const data = await (res as Response).json();
    variantId = data.id;
  });

  it('GET /api/agents/:id/variant returns null when no variant assigned', async () => {
    const { req, url } = fakeReq('GET', `/api/agents/${agentId}/variant`);
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data).toBeNull();
  });

  it('GET /api/agents/:id/variant returns 404 for unknown agent', async () => {
    const { req, url } = fakeReq('GET', '/api/agents/no-such-agent/variant');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });

  it('POST /api/agents/:id/variant applies variant', async () => {
    const { req, url } = fakeReq('POST', `/api/agents/${agentId}/variant`, {
      variantId,
    });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(201);
    const data = await (res as Response).json();
    expect(data.ok).toBe(true);
  });

  it('GET /api/agents/:id/variant returns applied variant', async () => {
    const { req, url } = fakeReq('GET', `/api/agents/${agentId}/variant`);
    const res = handleVariantRoutes(req, url, db, defaultContext);
    const data = await (res as Response).json();
    expect(data).not.toBeNull();
    expect(data.id).toBe(variantId);
    expect(data.name).toBe('AssignMe');
  });

  it('POST /api/agents/:id/variant returns 404 for unknown agent', async () => {
    const { req, url } = fakeReq('POST', '/api/agents/no-such-agent/variant', {
      variantId,
    });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });

  it('POST /api/agents/:id/variant returns 404 for unknown variant', async () => {
    const { req, url } = fakeReq('POST', `/api/agents/${agentId}/variant`, {
      variantId: 'no-such-variant',
    });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });

  it('POST /api/agents/:id/variant rejects missing variantId', async () => {
    const { req, url } = fakeReq('POST', `/api/agents/${agentId}/variant`, {});
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(400);
  });

  it('DELETE /api/agents/:id/variant removes assignment', async () => {
    const { req, url } = fakeReq('DELETE', `/api/agents/${agentId}/variant`);
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.ok).toBe(true);
  });

  it('DELETE /api/agents/:id/variant returns 404 when no variant assigned', () => {
    const { req, url } = fakeReq('DELETE', `/api/agents/${agentId}/variant`);
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });

  it('DELETE /api/agents/:id/variant returns 404 for unknown agent', () => {
    const { req, url } = fakeReq('DELETE', '/api/agents/no-such-agent/variant');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(404);
  });
});

describe('Variant Routes — Role Guard', () => {
  it('POST /api/variants blocked for viewer role in multi-tenant', async () => {
    const viewerContext: RequestContext = {
      authenticated: true,
      tenantId: 'org-1',
      tenantRole: 'viewer',
    };
    const { req, url } = fakeReq('POST', '/api/variants', { name: 'Blocked' });
    const res = await handleVariantRoutes(req, url, db, viewerContext);
    expect((res as Response).status).toBe(403);
  });

  it('POST /api/variants allowed for operator role', async () => {
    const operatorContext: RequestContext = {
      authenticated: true,
      tenantId: 'default',
      tenantRole: 'operator',
    };
    const { req, url } = fakeReq('POST', '/api/variants', { name: 'Allowed' });
    const res = await handleVariantRoutes(req, url, db, operatorContext);
    expect((res as Response).status).toBe(201);
  });

  it('no guard enforcement in single-tenant default mode', async () => {
    // defaultContext has tenantId='default' and no tenantRole — guard is a no-op
    const { req, url } = fakeReq('POST', '/api/variants', { name: 'DefaultTenant' });
    const res = await handleVariantRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(201);
  });
});

describe('Variant Routes — Unmatched', () => {
  it('returns null for unmatched paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleVariantRoutes(req, url, db, defaultContext);
    expect(res).toBeNull();
  });
});
