import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { handleGitHubAllowlistRoutes } from '../routes/github-allowlist';

let db: Database;

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

describe('GitHub Allowlist Routes', () => {
  it('GET /api/github-allowlist returns empty list initially', async () => {
    const { req, url } = fakeReq('GET', '/api/github-allowlist');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    expect(res).not.toBeNull();
    const data = await (res as Response).json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('POST /api/github-allowlist rejects empty body', async () => {
    const { req, url } = fakeReq('POST', '/api/github-allowlist', {});
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(400);
  });

  it('POST /api/github-allowlist adds a user', async () => {
    const { req, url } = fakeReq('POST', '/api/github-allowlist', {
      username: 'TestUser',
      label: 'Test contributor',
    });
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(201);
    const data = await (res as Response).json();
    expect(data.username).toBe('testuser'); // lowercased
    expect(data.label).toBe('Test contributor');
  });

  it('POST /api/github-allowlist normalizes username to lowercase', async () => {
    const { req, url } = fakeReq('POST', '/api/github-allowlist', {
      username: 'MixedCase',
    });
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect((res as Response).status).toBe(201);
    const data = await (res as Response).json();
    expect(data.username).toBe('mixedcase');
  });

  it('GET /api/github-allowlist lists added entries', async () => {
    const { req, url } = fakeReq('GET', '/api/github-allowlist');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    const data = await (res as Response).json();
    expect(data.length).toBeGreaterThanOrEqual(2);
    const usernames = data.map((e: { username: string }) => e.username);
    expect(usernames).toContain('testuser');
    expect(usernames).toContain('mixedcase');
  });

  it('PUT /api/github-allowlist/:username updates label', async () => {
    const { req, url } = fakeReq('PUT', '/api/github-allowlist/testuser', {
      label: 'Updated label',
    });
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.label).toBe('Updated label');
  });

  it('PUT /api/github-allowlist/:username returns 404 for unknown user', async () => {
    const { req, url } = fakeReq('PUT', '/api/github-allowlist/unknown-user', {
      label: 'Does not exist',
    });
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect((res as Response).status).toBe(404);
  });

  it('PUT /api/github-allowlist/:username rejects missing label', async () => {
    const { req, url } = fakeReq('PUT', '/api/github-allowlist/testuser', {});
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect((res as Response).status).toBe(400);
  });

  it('PUT normalizes username path param to lowercase', async () => {
    const { req, url } = fakeReq('PUT', '/api/github-allowlist/TestUser', {
      label: 'Case normalized',
    });
    const res = await handleGitHubAllowlistRoutes(req, url, db);
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.username).toBe('testuser');
  });

  it('DELETE /api/github-allowlist/:username removes entry', async () => {
    // Add a user to delete
    const addReq = fakeReq('POST', '/api/github-allowlist', { username: 'deleteme' });
    await handleGitHubAllowlistRoutes(addReq.req, addReq.url, db);

    const { req, url } = fakeReq('DELETE', '/api/github-allowlist/deleteme');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);
    const data = await (res as Response).json();
    expect(data.ok).toBe(true);
  });

  it('DELETE /api/github-allowlist/:username returns 404 for unknown user', () => {
    const { req, url } = fakeReq('DELETE', '/api/github-allowlist/nonexistent');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(404);
  });

  it('DELETE normalizes username to lowercase', async () => {
    // Add entry
    const addReq = fakeReq('POST', '/api/github-allowlist', { username: 'delcase' });
    await handleGitHubAllowlistRoutes(addReq.req, addReq.url, db);

    // Delete with different casing
    const { req, url } = fakeReq('DELETE', '/api/github-allowlist/DelCase');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    expect((res as Response).status).toBe(200);
  });

  it('returns null for unmatched paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    expect(res).toBeNull();
  });

  it('returns null for unmatched method on base path', () => {
    const { req, url } = fakeReq('PATCH', '/api/github-allowlist');
    const res = handleGitHubAllowlistRoutes(req, url, db);
    expect(res).toBeNull();
  });
});
