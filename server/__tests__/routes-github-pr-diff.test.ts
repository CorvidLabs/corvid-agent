import { afterEach, describe, expect, it, mock } from 'bun:test';
import { handleGitHubPRDiffRoutes } from '../routes/github-pr-diff';

const originalFetch = globalThis.fetch;

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitHub PR Diff Routes', () => {
  it('returns null for non-matching pathname', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    expect(handleGitHubPRDiffRoutes(req, url)).toBeNull();
  });

  it('returns null for non-GET method', () => {
    const { req, url } = fakeReq('POST', '/api/github/pr-diff?owner=x&repo=y&number=1');
    expect(handleGitHubPRDiffRoutes(req, url)).toBeNull();
  });

  it('returns 400 when owner is missing', async () => {
    const { req, url } = fakeReq('GET', '/api/github/pr-diff?repo=y&number=1');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 when repo is missing', async () => {
    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=x&number=1');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it('returns 400 when number is missing', async () => {
    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=x&repo=y');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it('returns 400 for invalid owner format (SSRF prevention)', async () => {
    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=../../etc&repo=y&number=1');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toContain('Invalid');
  });

  it('returns 400 for invalid repo format', async () => {
    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=x&repo=y%20z&number=1');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toContain('Invalid');
  });

  it('returns 400 for non-numeric PR number', async () => {
    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=x&repo=y&number=abc');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.error).toContain('Invalid');
  });

  it('fetches diff from GitHub API on valid input', async () => {
    const diffText = 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts';
    globalThis.fetch = mock(() => Promise.resolve(new Response(diffText, { status: 200 }))) as unknown as typeof fetch;

    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=CorvidLabs&repo=corvid-agent&number=123');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toBe(diffText);
  });

  it('returns error status when GitHub API returns non-ok', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Not Found', { status: 404 })),
    ) as unknown as typeof fetch;

    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=CorvidLabs&repo=corvid-agent&number=999');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error).toContain('404');
  });

  it('handles fetch errors gracefully', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network failure'))) as unknown as typeof fetch;

    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=CorvidLabs&repo=corvid-agent&number=1');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it('includes Authorization header when GITHUB_TOKEN is set', async () => {
    const origToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token-123';

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock((_fetchUrl: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(Object.entries(init?.headers || {}));
      return Promise.resolve(new Response('diff content', { status: 200 }));
    }) as unknown as typeof fetch;

    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=CorvidLabs&repo=corvid-agent&number=1');
    await handleGitHubPRDiffRoutes(req, url);

    expect(capturedHeaders.Authorization).toBe('token test-token-123');

    if (origToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = origToken;
    }
  });

  it('allows valid owner with dots, hyphens, and underscores', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response('"ok"', { status: 200 }))) as unknown as typeof fetch;

    const { req, url } = fakeReq('GET', '/api/github/pr-diff?owner=my-org.name_1&repo=my-repo.test_2&number=42');
    const res = await handleGitHubPRDiffRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});
