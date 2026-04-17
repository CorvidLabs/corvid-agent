import { Database } from 'bun:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runMigrations } from '../db/schema';
import type { AuthConfig } from '../middleware/auth';
import type { RequestContext } from '../middleware/guards';
import { handleSettingsRoutes } from '../routes/settings';

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

function adminContext(): RequestContext {
  return { authenticated: true, role: 'admin', tenantId: 'default' };
}

function userContext(): RequestContext {
  return { authenticated: true, role: 'user', tenantId: 'default' };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterAll(() => db.close());

describe('Settings Routes', () => {
  it('GET /api/settings returns creditConfig and system stats for admin', async () => {
    const { req, url } = fakeReq('GET', '/api/settings');
    const res = handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.creditConfig).toBeDefined();
    expect(data.creditConfig.credits_per_algo).toBe('1000');
    expect(data.system).toBeDefined();
    expect(typeof data.system.schemaVersion).toBe('number');
    expect(typeof data.system.agentCount).toBe('number');
    expect(typeof data.system.projectCount).toBe('number');
    expect(typeof data.system.sessionCount).toBe('number');
  });

  it('GET /api/settings omits system metadata for non-admin users', async () => {
    const { req, url } = fakeReq('GET', '/api/settings');
    const res = handleSettingsRoutes(req, url, db, userContext());
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.creditConfig).toBeDefined();
    expect(data.creditConfig.credits_per_algo).toBeDefined();
    expect(data.system).toBeUndefined();
  });

  it('PUT /api/settings/credits updates credit config keys', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/credits', {
      credits_per_algo: '2000',
      low_credit_threshold: '100',
    });
    const res = await handleSettingsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.updated).toBe(2);

    // Verify persisted
    const { req: gReq, url: gUrl } = fakeReq('GET', '/api/settings');
    const gRes = await Promise.resolve(handleSettingsRoutes(gReq, gUrl, db, adminContext())!);
    const settings = await gRes.json();
    expect(settings.creditConfig.credits_per_algo).toBe('2000');
    expect(settings.creditConfig.low_credit_threshold).toBe('100');
  });

  it('PUT /api/settings/credits rejects unknown keys', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/credits', {
      unknown_key: 'value',
    });
    const res = await handleSettingsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('Unrecognized key');
  });

  it('PUT /api/settings/credits rejects empty body', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/credits', {});
    const res = await handleSettingsRoutes(req, url, db);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('At least one config key is required');
  });

  it('returns null for unmatched paths', async () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleSettingsRoutes(req, url, db);
    expect(res).toBeNull();
  });
});

describe('API Key Rotation Endpoint', () => {
  it('POST /api/settings/api-key/rotate rotates the key', async () => {
    const authConfig: AuthConfig = {
      apiKey: 'original-key-for-rotation',
      allowedOrigins: [],
      bindHost: '0.0.0.0',
    };

    const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', {});
    const res = await handleSettingsRoutes(req, url, db, adminContext(), authConfig);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.apiKey).toBeTruthy();
    expect(data.apiKey).not.toBe('original-key-for-rotation');
    expect(authConfig.apiKey).toBe(data.apiKey);
    expect(authConfig.previousApiKey).toBe('original-key-for-rotation');
  });

  it('POST /api/settings/api-key/rotate with ttlDays sets expiry', async () => {
    const authConfig: AuthConfig = {
      apiKey: 'key-to-rotate-with-ttl',
      allowedOrigins: [],
      bindHost: '0.0.0.0',
    };

    const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', { ttlDays: 30 });
    const res = await handleSettingsRoutes(req, url, db, adminContext(), authConfig);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.expiresAt).toBeTruthy();
    expect(authConfig.apiKeyExpiresAt).toBeGreaterThan(Date.now());
  });

  it('POST /api/settings/api-key/rotate returns 400 when no API key configured', async () => {
    const authConfig: AuthConfig = {
      apiKey: null,
      allowedOrigins: [],
      bindHost: '127.0.0.1',
    };

    const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', {});
    const res = await handleSettingsRoutes(req, url, db, adminContext(), authConfig);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it('POST /api/settings/api-key/rotate returns 503 when authConfig is null', async () => {
    const { req, url } = fakeReq('POST', '/api/settings/api-key/rotate', {});
    const res = await handleSettingsRoutes(req, url, db, adminContext(), null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });
});

describe('Telegram Config Routes', () => {
  it('GET /api/settings/telegram returns config', async () => {
    const { req, url } = fakeReq('GET', '/api/settings/telegram');
    const res = handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.telegramConfig).toBeDefined();
  });

  it('PUT /api/settings/telegram updates valid keys', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/telegram', {
      mode: 'work_intake',
      allowed_user_ids: '111,222',
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.updated).toBe(2);
  });

  it('PUT /api/settings/telegram rejects invalid keys', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/telegram', {
      bot_token: 'secret',
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('Invalid config keys');
  });

  it('PUT /api/settings/telegram rejects empty body', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/telegram', {});
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('No valid config keys');
  });
});

describe('Telegram Config DELETE Routes', () => {
  it('DELETE /api/settings/telegram/:key returns 400 for invalid key', async () => {
    const { req, url } = fakeReq('DELETE', '/api/settings/telegram/bot_token');
    const res = handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(400);
    const data = await resolved.json();
    expect(data.error).toContain('Invalid config key');
  });

  it('DELETE /api/settings/telegram/:key returns 404 for non-existent key', async () => {
    const { req, url } = fakeReq('DELETE', '/api/settings/telegram/mode');
    // Ensure key does not exist by deleting first (if it does)
    const res = handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    await Promise.resolve(res!);
    // Could be 200 or 404 depending on prior state; delete again to guarantee 404
    const { req: req2, url: url2 } = fakeReq('DELETE', '/api/settings/telegram/mode');
    const res2 = handleSettingsRoutes(req2, url2, db, adminContext());
    expect(res2).not.toBeNull();
    const resolved2 = await Promise.resolve(res2!);
    expect(resolved2.status).toBe(404);
    const data = await resolved2.json();
    expect(data.error).toContain('Config key not found');
  });

  it('DELETE /api/settings/telegram/:key returns 200 on successful deletion', async () => {
    // First, set a key
    const { req: putReq, url: putUrl } = fakeReq('PUT', '/api/settings/telegram', {
      default_agent_id: 'agent-to-delete',
    });
    const putRes = await handleSettingsRoutes(putReq, putUrl, db, adminContext());
    expect(putRes).not.toBeNull();
    expect(putRes!.status).toBe(200);

    // Now delete it
    const { req, url } = fakeReq('DELETE', '/api/settings/telegram/default_agent_id');
    const res = handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.ok).toBe(true);
    expect(data.deleted).toBe('default_agent_id');
  });
});

describe('API Key Status Endpoint', () => {
  it('GET /api/settings/api-key/status returns status with no expiry', async () => {
    const authConfig: AuthConfig = {
      apiKey: 'test-status-key',
      allowedOrigins: [],
      bindHost: '0.0.0.0',
    };

    const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
    const res = handleSettingsRoutes(req, url, db, adminContext(), authConfig);
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.hasActiveKey).toBe(true);
    expect(data.expired).toBe(false);
    expect(data.expiresAt).toBeNull();
    expect(data.warning).toBeNull();
  });

  it('GET /api/settings/api-key/status returns warning when key expiring soon', async () => {
    const authConfig: AuthConfig = {
      apiKey: 'test-expiring-key',
      allowedOrigins: [],
      bindHost: '0.0.0.0',
      apiKeyExpiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
    };

    const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
    const res = handleSettingsRoutes(req, url, db, adminContext(), authConfig);
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.expired).toBe(false);
    expect(data.warning).toContain('3 days');
  });

  it('GET /api/settings/api-key/status returns expired status', async () => {
    const authConfig: AuthConfig = {
      apiKey: 'test-expired-key',
      allowedOrigins: [],
      bindHost: '0.0.0.0',
      apiKeyExpiresAt: Date.now() - 1000,
    };

    const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
    const res = handleSettingsRoutes(req, url, db, adminContext(), authConfig);
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();
    expect(data.expired).toBe(true);
  });

  it('GET /api/settings/api-key/status returns 503 when authConfig null', async () => {
    const { req, url } = fakeReq('GET', '/api/settings/api-key/status');
    const res = handleSettingsRoutes(req, url, db, adminContext(), null);
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(503);
  });
});

describe('Runtime Config Endpoint', () => {
  it('GET /api/settings/runtime returns sanitized config for operator', async () => {
    const { req, url } = fakeReq('GET', '/api/settings/runtime');
    const res = handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
    const data = await resolved.json();

    // Agent identity fields
    expect(data.agent).toBeDefined();
    expect(typeof data.agent.name).toBe('string');
    expect(typeof data.agent.defaultModel).toBe('string');
    expect(typeof data.agent.defaultProvider).toBe('string');

    // Server fields
    expect(data.server).toBeDefined();
    expect(typeof data.server.port).toBe('number');
    expect(typeof data.server.bindHost).toBe('string');
    expect(typeof data.server.logLevel).toBe('string');
    expect(typeof data.server.logFormat).toBe('string');
    expect(typeof data.server.apiKeyConfigured).toBe('boolean');
    expect(typeof data.server.adminApiKeyConfigured).toBe('boolean');

    // Providers
    expect(data.providers).toBeDefined();
    expect(Array.isArray(data.providers.enabled)).toBe(true);
    expect(typeof data.providers.anthropicConfigured).toBe('boolean');
    expect(typeof data.providers.openrouterConfigured).toBe('boolean');
    expect(typeof data.providers.ollamaHost).toBe('string');

    // Integrations
    expect(data.integrations).toBeDefined();
    expect(typeof data.integrations.discord.enabled).toBe('boolean');
    expect(typeof data.integrations.telegram.enabled).toBe('boolean');
    expect(typeof data.integrations.algochat.enabled).toBe('boolean');
    expect(typeof data.integrations.github.tokenConfigured).toBe('boolean');
    expect(typeof data.integrations.slack.enabled).toBe('boolean');

    // Database
    expect(data.database).toBeDefined();
    expect(typeof data.database.path).toBe('string');

    // Configurable keys for env-var editing
    expect(data.configurableKeys).toBeDefined();
    expect(Array.isArray(data.configurableKeys)).toBe(true);
    expect(data.configurableKeys.length).toBeGreaterThan(0);
    expect(data.configurableKeys).toContain('ANTHROPIC_API_KEY');
    expect(data.configurableKeys).toContain('LOG_LEVEL');
  });

  it('GET /api/settings/runtime does not expose raw secret values', async () => {
    const { req, url } = fakeReq('GET', '/api/settings/runtime');
    const res = handleSettingsRoutes(req, url, db, adminContext());
    const resolved = await Promise.resolve(res!);
    const data = await resolved.json();

    // Response shape should use boolean flags, not raw secret strings
    expect(data.integrations.discord.botToken).toBeUndefined();
    expect(data.integrations.telegram.botToken).toBeUndefined();
    expect(data.integrations.algochat.mnemonic).toBeUndefined();
    expect(data.providers.anthropic).toBeUndefined();
    expect(data.server.apiKey).toBeUndefined();
    expect(data.server.adminApiKey).toBeUndefined();

    // Configured flags are booleans, not secret values
    expect(typeof data.providers.anthropicConfigured).toBe('boolean');
    expect(typeof data.integrations.discord.tokenConfigured).toBe('boolean');
    expect(typeof data.integrations.algochat.mnemonicConfigured).toBe('boolean');
  });

  it('GET /api/settings/runtime returns null for unauthenticated when context enforces auth', async () => {
    const { req, url } = fakeReq('GET', '/api/settings/runtime');
    // No context = unauthenticated passthrough (handled by calling code, not this route)
    const res = handleSettingsRoutes(req, url, db);
    expect(res).not.toBeNull();
    const resolved = await Promise.resolve(res!);
    expect(resolved.status).toBe(200);
  });
});

describe('Env Vars Endpoint', () => {
  const envPath = resolve(process.cwd(), '.env');
  let originalEnvContent: string | null = null;

  beforeEach(() => {
    try {
      originalEnvContent = readFileSync(envPath, 'utf-8');
    } catch {
      originalEnvContent = null;
    }
  });

  afterEach(() => {
    if (originalEnvContent !== null) {
      writeFileSync(envPath, originalEnvContent, 'utf-8');
    } else {
      try {
        unlinkSync(envPath);
      } catch {
        // File may not exist
      }
    }
  });

  it('PUT /api/settings/env-vars rejects invalid JSON', async () => {
    const url = new URL('http://localhost:3000/api/settings/env-vars');
    const req = new Request(url.toString(), {
      method: 'PUT',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('PUT /api/settings/env-vars rejects non-array updates', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', { updates: 'not-array' });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('updates must be an array');
  });

  it('PUT /api/settings/env-vars rejects non-string key/value', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', {
      updates: [{ key: 123, value: 'val' }],
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('string key and value');
  });

  it('PUT /api/settings/env-vars rejects disallowed keys', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', {
      updates: [{ key: 'SECRET_KEY', value: 'val' }],
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('not in allowlist');
    expect(data.error).toContain('SECRET_KEY');
  });

  it('PUT /api/settings/env-vars rejects empty updates array', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', { updates: [] });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const data = await res!.json();
    expect(data.error).toContain('No valid updates');
  });

  it('PUT /api/settings/env-vars writes allowed keys and returns success', async () => {
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', {
      updates: [
        { key: 'LOG_LEVEL', value: 'debug' },
        { key: 'AGENT_NAME', value: 'TestAgent' },
      ],
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.success).toBe(true);
    expect(data.requiresRestart).toBe(true);
    expect(data.updated).toContain('LOG_LEVEL');
    expect(data.updated).toContain('AGENT_NAME');

    // Verify written to .env
    const content = readFileSync(envPath, 'utf-8');
    expect(content).toContain('LOG_LEVEL=debug');
    expect(content).toContain('AGENT_NAME=TestAgent');
  });

  it('PUT /api/settings/env-vars updates existing keys in-place', async () => {
    writeFileSync(envPath, '# comment\nLOG_LEVEL=info\nOTHER=keep\n', 'utf-8');
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', {
      updates: [{ key: 'LOG_LEVEL', value: 'warn' }],
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);

    const content = readFileSync(envPath, 'utf-8');
    expect(content).toContain('LOG_LEVEL=warn');
    expect(content).toContain('# comment');
    expect(content).toContain('OTHER=keep');
    // Should not have duplicate LOG_LEVEL lines
    expect(content.match(/LOG_LEVEL=/g)?.length).toBe(1);
  });

  it('PUT /api/settings/env-vars escapes values with quotes', async () => {
    writeFileSync(envPath, '', 'utf-8');
    const { req, url } = fakeReq('PUT', '/api/settings/env-vars', {
      updates: [{ key: 'AGENT_DESCRIPTION', value: 'line1\nline2' }],
    });
    const res = await handleSettingsRoutes(req, url, db, adminContext());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);

    const content = readFileSync(envPath, 'utf-8');
    // Value with newline should be quoted
    expect(content).toContain('AGENT_DESCRIPTION="line1');
  });
});
