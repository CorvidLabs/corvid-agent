import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import type { RequestContext } from '../middleware/guards';
import { createRequestContext } from '../middleware/guards';
import { handleRepoBlocklistRoutes } from '../routes/repo-blocklist';

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

describe('Repo Blocklist Routes', () => {
  it('GET /api/repo-blocklist returns empty list initially', async () => {
    const { req, url } = fakeReq('GET', '/api/repo-blocklist');
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    const data = await (res as Response).json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('POST /api/repo-blocklist rejects empty body', async () => {
    const { req, url } = fakeReq('POST', '/api/repo-blocklist', {});
    const res = await handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(400);
  });

  it('POST /api/repo-blocklist rejects missing repo field', async () => {
    const { req, url } = fakeReq('POST', '/api/repo-blocklist', { reason: 'spam' });
    const res = await handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(400);
  });

  it('POST /api/repo-blocklist adds a repo', async () => {
    const { req, url } = fakeReq('POST', '/api/repo-blocklist', {
      repo: 'EvilOrg/spam-repo',
      reason: 'spam PRs',
      source: 'manual',
    });
    const res = await handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(201);
    const data = await (res as Response).json();
    expect(data.repo).toBe('evilorg/spam-repo'); // lowercased
    expect(data.reason).toBe('spam PRs');
    expect(data.source).toBe('manual');
  });

  it('GET /api/repo-blocklist lists added entry', async () => {
    const { req, url } = fakeReq('GET', '/api/repo-blocklist');
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    const data = await (res as Response).json();
    expect(data.length).toBeGreaterThanOrEqual(1);
    const entry = data.find((e: { repo: string }) => e.repo === 'evilorg/spam-repo');
    expect(entry).toBeDefined();
  });

  it('POST /api/repo-blocklist upserts on conflict', async () => {
    const { req, url } = fakeReq('POST', '/api/repo-blocklist', {
      repo: 'EvilOrg/spam-repo',
      reason: 'updated reason',
      source: 'pr_rejection',
    });
    const res = await handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(201);
    const data = await (res as Response).json();
    expect(data.reason).toBe('updated reason');
    expect(data.source).toBe('pr_rejection');
  });

  it('DELETE /api/repo-blocklist/:repo removes entry', async () => {
    // First add a repo to delete
    const addReq = fakeReq('POST', '/api/repo-blocklist', { repo: 'temp/delete-me' });
    await handleRepoBlocklistRoutes(addReq.req, addReq.url, db, defaultContext);

    const encoded = encodeURIComponent('temp/delete-me');
    const { req, url } = fakeReq('DELETE', `/api/repo-blocklist/${encoded}`);
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.ok).toBe(true);
  });

  it('DELETE /api/repo-blocklist/:repo returns 404 for unknown repo', async () => {
    const encoded = encodeURIComponent('unknown/repo');
    const { req, url } = fakeReq('DELETE', `/api/repo-blocklist/${encoded}`);
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(404);
  });

  it('DELETE normalizes repo to lowercase', async () => {
    // Add with lowercase (via POST which normalizes)
    const addReq = fakeReq('POST', '/api/repo-blocklist', { repo: 'CaseTest/Repo' });
    await handleRepoBlocklistRoutes(addReq.req, addReq.url, db, defaultContext);

    // Delete with mixed case — route lowercases the param
    const { req, url } = fakeReq('DELETE', `/api/repo-blocklist/${encodeURIComponent('CaseTest/Repo')}`);
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect((res as Response).status).toBe(200);
  });

  it('tenant isolation — different tenants see different lists', async () => {
    const tenantA: RequestContext = { authenticated: false, tenantId: 'tenant-a' };
    const tenantB: RequestContext = { authenticated: false, tenantId: 'tenant-b' };

    // Add to tenant A
    const addReq = fakeReq('POST', '/api/repo-blocklist', { repo: 'isolated/repo' });
    await handleRepoBlocklistRoutes(addReq.req, addReq.url, db, tenantA);

    // Tenant A sees it
    const getA = fakeReq('GET', '/api/repo-blocklist');
    const resA = handleRepoBlocklistRoutes(getA.req, getA.url, db, tenantA);
    const dataA = await (resA as Response).json();
    expect(dataA.some((e: { repo: string }) => e.repo === 'isolated/repo')).toBe(true);

    // Tenant B does not
    const getB = fakeReq('GET', '/api/repo-blocklist');
    const resB = handleRepoBlocklistRoutes(getB.req, getB.url, db, tenantB);
    const dataB = await (resB as Response).json();
    expect(dataB.some((e: { repo: string }) => e.repo === 'isolated/repo')).toBe(false);
  });

  it('returns null for unmatched paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).toBeNull();
  });

  it('returns null for unmatched method on /api/repo-blocklist', () => {
    const { req, url } = fakeReq('PUT', '/api/repo-blocklist');
    const res = handleRepoBlocklistRoutes(req, url, db, defaultContext);
    expect(res).toBeNull();
  });
});
