import { describe, expect, it } from 'bun:test';
import { checkGitHubToken, validateGitHubTokenOnStartup } from '../lib/github-token-check';

// --- Helpers ----------------------------------------------------------------

function mockFetch(status: number, scopeHeader: string | null): (url: string, init?: RequestInit) => Promise<Response> {
  return async () =>
    new Response('{}', {
      status,
      headers: scopeHeader !== null ? { 'x-oauth-scopes': scopeHeader } : {},
    });
}

function mockFetchError(error: Error): (url: string, init?: RequestInit) => Promise<Response> {
  return async () => {
    throw error;
  };
}

// --- checkGitHubToken -------------------------------------------------------

describe('checkGitHubToken', () => {
  it('returns not configured when no token provided', async () => {
    const result = await checkGitHubToken('', mockFetch(200, 'repo'));
    expect(result.configured).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.missingScopes).toEqual(['repo', 'read:org']);
  });

  it('reports all scopes present', async () => {
    const result = await checkGitHubToken('ghp_test123', mockFetch(200, 'repo, read:org, user'));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.scopes).toEqual(['repo', 'read:org', 'user']);
    expect(result.missingScopes).toEqual([]);
    expect(result.fineGrained).toBe(false);
  });

  it('reports missing scopes', async () => {
    const result = await checkGitHubToken('ghp_test123', mockFetch(200, 'user'));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.missingScopes).toEqual(['repo', 'read:org']);
  });

  it('reports partially missing scopes', async () => {
    const result = await checkGitHubToken('ghp_test123', mockFetch(200, 'repo, user'));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.missingScopes).toEqual(['read:org']);
  });

  it('handles fine-grained tokens (no scope header)', async () => {
    const result = await checkGitHubToken('github_pat_test123', mockFetch(200, null));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.fineGrained).toBe(true);
    expect(result.missingScopes).toEqual([]);
  });

  it('handles HTTP 401 (bad token)', async () => {
    const result = await checkGitHubToken('ghp_bad', mockFetch(401, null));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
  });

  it('handles HTTP 403 (forbidden)', async () => {
    const result = await checkGitHubToken('ghp_forbidden', mockFetch(403, null));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('403');
  });

  it('handles network errors gracefully', async () => {
    const result = await checkGitHubToken('ghp_test', mockFetchError(new Error('ECONNREFUSED')));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('handles empty scope header', async () => {
    const result = await checkGitHubToken('ghp_test', mockFetch(200, ''));
    expect(result.configured).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.scopes).toEqual([]);
    expect(result.missingScopes).toEqual(['repo', 'read:org']);
    expect(result.fineGrained).toBe(false);
  });
});

// --- validateGitHubTokenOnStartup -------------------------------------------

describe('validateGitHubTokenOnStartup', () => {
  it('does not throw when token is not set', async () => {
    const saved = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;
    try {
      await validateGitHubTokenOnStartup(mockFetch(200, 'repo'));
    } finally {
      if (saved !== undefined) process.env.GH_TOKEN = saved;
    }
  });

  it('does not throw when scopes are valid', async () => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = 'ghp_validtoken';
    try {
      await validateGitHubTokenOnStartup(mockFetch(200, 'repo, read:org'));
    } finally {
      if (saved !== undefined) process.env.GH_TOKEN = saved;
      else delete process.env.GH_TOKEN;
    }
  });

  it('does not throw when scopes are missing', async () => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = 'ghp_limited';
    try {
      await validateGitHubTokenOnStartup(mockFetch(200, 'user'));
    } finally {
      if (saved !== undefined) process.env.GH_TOKEN = saved;
      else delete process.env.GH_TOKEN;
    }
  });

  it('does not throw on network error', async () => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = 'ghp_test';
    try {
      await validateGitHubTokenOnStartup(mockFetchError(new Error('DNS resolution failed')));
    } finally {
      if (saved !== undefined) process.env.GH_TOKEN = saved;
      else delete process.env.GH_TOKEN;
    }
  });

  it('does not throw on fine-grained token', async () => {
    const saved = process.env.GH_TOKEN;
    process.env.GH_TOKEN = 'github_pat_fine_grained';
    try {
      await validateGitHubTokenOnStartup(mockFetch(200, null));
    } finally {
      if (saved !== undefined) process.env.GH_TOKEN = saved;
      else delete process.env.GH_TOKEN;
    }
  });
});
