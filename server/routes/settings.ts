/**
 * Settings API routes — provides read/write access to system configuration
 * including credit config, operational mode info, AlgoChat status, and API key management.
 */

import type { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configFromEnv } from '../config/loader';
import { recordAudit } from '../db/audit';
import {
  deleteDiscordConfigKey,
  getDiscordConfigRaw,
  updateDiscordConfigBatch,
  VALID_DISCORD_CONFIG_KEYS,
} from '../db/discord-config';
import { purgeTestData } from '../db/purge-test-data';
import {
  deleteTelegramConfigKey,
  getTelegramConfigRaw,
  updateTelegramConfigBatch,
  VALID_TELEGRAM_CONFIG_KEYS,
} from '../db/telegram-config';
import { loadGuildCache } from '../discord/guild-api';
import { json } from '../lib/response';
import { parseBodyOrThrow, UpdateCreditConfigSchema, ValidationError } from '../lib/validation';
import {
  type AuthConfig,
  getApiKeyExpiryWarning,
  getApiKeyRotationStatus,
  isApiKeyExpired,
  rotateApiKey,
  setApiKeyExpiry,
} from '../middleware/auth';
import type { RequestContext } from '../middleware/guards';
import { tenantRoleGuard } from '../middleware/guards';

export function handleSettingsRoutes(
  req: Request,
  url: URL,
  db: Database,
  context?: RequestContext,
  authConfig?: AuthConfig | null,
): Response | Promise<Response> | null {
  // GET /api/settings — all settings (system metadata is admin-only)
  if (url.pathname === '/api/settings' && req.method === 'GET') {
    return handleGetSettings(db, context?.role === 'admin');
  }

  // GET /api/settings/runtime — sanitized view of current runtime configuration (operator+)
  if (url.pathname === '/api/settings/runtime' && req.method === 'GET') {
    if (context) {
      const denied = tenantRoleGuard('operator')(req, url, context);
      if (denied) return denied;
    }
    return handleGetRuntimeConfig();
  }

  // PUT /api/settings/credits — update credit config
  if (url.pathname === '/api/settings/credits' && req.method === 'PUT') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleUpdateCreditConfig(req, db);
  }

  // POST /api/settings/api-key/rotate — rotate the API key (admin-only, guarded by ADMIN_PATHS)
  if (url.pathname === '/api/settings/api-key/rotate' && req.method === 'POST') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleApiKeyRotate(req, db, authConfig ?? null);
  }

  // GET /api/settings/api-key/status — get API key rotation + expiry status (admin-only)
  if (url.pathname === '/api/settings/api-key/status' && req.method === 'GET') {
    return handleApiKeyStatus(authConfig ?? null);
  }

  // GET /api/settings/discord — get Discord runtime config (admin-only)
  if (url.pathname === '/api/settings/discord' && req.method === 'GET') {
    if (context) {
      const denied = tenantRoleGuard('operator')(req, url, context);
      if (denied) return denied;
    }
    return handleGetDiscordConfig(db);
  }

  // PUT /api/settings/discord — update Discord runtime config (owner-only)
  if (url.pathname === '/api/settings/discord' && req.method === 'PUT') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleUpdateDiscordConfig(req, db, context);
  }

  // GET /api/settings/discord/guild-cache — get cached guild channels/roles (operator+)
  if (url.pathname === '/api/settings/discord/guild-cache' && req.method === 'GET') {
    if (context) {
      const denied = tenantRoleGuard('operator')(req, url, context);
      if (denied) return denied;
    }
    return handleGetGuildCache(db);
  }

  // DELETE /api/settings/discord/:key — delete a Discord config key (owner-only)
  const discordKeyMatch = url.pathname.match(/^\/api\/settings\/discord\/([a-z_]+)$/);
  if (discordKeyMatch && req.method === 'DELETE') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleDeleteDiscordConfigKey(db, discordKeyMatch[1], context);
  }

  // GET /api/settings/telegram — get Telegram runtime config (operator+)
  if (url.pathname === '/api/settings/telegram' && req.method === 'GET') {
    if (context) {
      const denied = tenantRoleGuard('operator')(req, url, context);
      if (denied) return denied;
    }
    return handleGetTelegramConfig(db);
  }

  // PUT /api/settings/telegram — update Telegram runtime config (owner-only)
  if (url.pathname === '/api/settings/telegram' && req.method === 'PUT') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleUpdateTelegramConfig(req, db, context);
  }

  // DELETE /api/settings/telegram/:key — delete a Telegram config key (owner-only)
  const telegramKeyMatch = url.pathname.match(/^\/api\/settings\/telegram\/([a-z_]+)$/);
  if (telegramKeyMatch && req.method === 'DELETE') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleDeleteTelegramConfigKey(db, telegramKeyMatch[1], context);
  }

  // PUT /api/settings/env-vars — write allowlisted env vars to .env (owner-only)
  if (url.pathname === '/api/settings/env-vars' && req.method === 'PUT') {
    if (context) {
      const denied = tenantRoleGuard('owner')(req, url, context);
      if (denied) return denied;
    }
    return handleUpdateEnvVars(req);
  }

  // POST /api/settings/purge-test-data — remove test/sample data (admin-only via ADMIN_PATHS)
  if (url.pathname === '/api/settings/purge-test-data' && req.method === 'POST') {
    return handlePurgeTestData(req, db, context);
  }

  return null;
}

/** Keys users are allowed to write via the dashboard UI. */
const ALLOWED_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ENABLED_PROVIDERS',
  'COUNCIL_MODEL',
  'GH_TOKEN',
  'GITHUB_OWNER',
  'GITHUB_REPO',
  'OLLAMA_HOST',
  'OLLAMA_DEFAULT_MODEL',
  'BRAVE_SEARCH_API_KEY',
  'LOG_LEVEL',
  'LOG_FORMAT',
  'PUBLIC_URL',
  'AGENT_NAME',
  'AGENT_DESCRIPTION',
  'WORK_MAX_ITERATIONS',
  'WORK_TASK_MAX_PER_DAY',
]);

function handleGetRuntimeConfig(): Response {
  const config = configFromEnv();
  const env = process.env;

  return json({
    configurableKeys: [...ALLOWED_ENV_KEYS],
    agent: {
      name: config.agent.name,
      description: config.agent.description ?? null,
      defaultModel: config.agent.defaultModel,
      defaultProvider: config.agent.defaultProvider,
    },
    server: {
      port: config.server.port,
      bindHost: config.server.bindHost,
      logLevel: config.server.logLevel ?? 'info',
      logFormat: config.server.logFormat ?? 'text',
      apiKeyConfigured: Boolean(config.server.apiKey),
      adminApiKeyConfigured: Boolean(config.server.adminApiKey),
      allowedOrigins: config.server.allowedOrigins ?? null,
      publicUrl: config.server.publicUrl ?? null,
    },
    database: {
      path: config.database.path,
    },
    providers: {
      enabled: config.providers.enabledProviders,
      anthropicConfigured: Boolean(config.providers.anthropic?.apiKey),
      ollamaHost: config.providers.ollama?.host ?? 'http://localhost:11434',
      openrouterConfigured: Boolean(env.OPENROUTER_API_KEY),
      councilModel: config.providers.councilModel ?? null,
    },
    integrations: {
      discord: {
        enabled: config.integrations?.discord?.enabled ?? false,
        tokenConfigured: Boolean(config.integrations?.discord?.botToken),
        channelConfigured: Boolean(config.integrations?.discord?.channelId),
      },
      telegram: {
        enabled: config.integrations?.telegram?.enabled ?? false,
        tokenConfigured: Boolean(config.integrations?.telegram?.botToken),
        chatIdConfigured: Boolean(config.integrations?.telegram?.chatId),
      },
      algochat: {
        enabled: config.integrations?.algochat?.enabled ?? false,
        mnemonicConfigured: Boolean(config.integrations?.algochat?.mnemonic),
        network: config.integrations?.algochat?.network ?? 'localnet',
      },
      github: {
        tokenConfigured: Boolean(config.integrations?.github?.token),
        owner: config.integrations?.github?.owner ?? null,
        repo: config.integrations?.github?.repo ?? null,
      },
      slack: {
        enabled: config.integrations?.slack?.enabled ?? false,
        tokenConfigured: Boolean(config.integrations?.slack?.botToken),
      },
    },
  });
}

async function handleUpdateEnvVars(req: Request): Promise<Response> {
  let body: { updates?: unknown };
  try {
    body = (await req.json()) as { updates?: unknown };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!Array.isArray(body.updates)) {
    return json({ error: 'updates must be an array' }, 400);
  }

  const updates = body.updates as Array<{ key?: unknown; value?: unknown }>;
  const rejected: string[] = [];
  const valid: Array<{ key: string; value: string }> = [];

  for (const update of updates) {
    if (typeof update.key !== 'string' || typeof update.value !== 'string') {
      return json({ error: 'Each update must have string key and value' }, 400);
    }
    if (!ALLOWED_ENV_KEYS.has(update.key)) {
      rejected.push(update.key);
    } else {
      valid.push({ key: update.key, value: update.value });
    }
  }

  if (rejected.length > 0) {
    return json({ error: `Keys not in allowlist: ${rejected.join(', ')}` }, 400);
  }

  if (valid.length === 0) {
    return json({ error: 'No valid updates provided' }, 400);
  }

  // Read existing .env, update or append keys, write back
  const envPath = resolve(process.cwd(), '.env');
  let envContent = '';
  try {
    envContent = readFileSync(envPath, 'utf-8');
  } catch {
    // .env may not exist yet — start empty
  }

  const lines = envContent.split('\n');
  const updated: string[] = [];

  for (const { key, value } of valid) {
    const escaped = value.includes('\n') || value.includes('"') ? `"${value.replace(/"/g, '\\"')}"` : value;
    const newLine = `${key}=${escaped}`;
    const idx = lines.findIndex((l) => l.match(new RegExp(`^\\s*${key}\\s*=`)));
    if (idx >= 0) {
      lines[idx] = newLine;
    } else {
      lines.push(newLine);
    }
    updated.push(key);
  }

  writeFileSync(envPath, lines.join('\n'), 'utf-8');

  return json({ success: true, requiresRestart: true, updated });
}

function handleGetSettings(db: Database, isAdmin: boolean): Response {
  // Credit configuration (public — users need to know rates)
  const creditRows = db.query(`SELECT key, value FROM credit_config`).all() as { key: string; value: string }[];
  const creditConfig: Record<string, string> = {};
  for (const row of creditRows) {
    creditConfig[row.key] = row.value;
  }

  const result: Record<string, unknown> = { creditConfig };

  // Discord configuration — admin-only
  if (isAdmin) {
    try {
      result.discordConfig = getDiscordConfigRaw(db);
    } catch {
      // Table may not exist yet if file-based migrations haven't run
      result.discordConfig = {};
    }
  }

  // System stats — admin-only to avoid leaking operational metadata
  if (isAdmin) {
    const agentCount = (db.query(`SELECT COUNT(*) as c FROM agents`).get() as { c: number }).c;
    const projectCount = (db.query(`SELECT COUNT(*) as c FROM projects`).get() as { c: number }).c;
    const sessionCount = (db.query(`SELECT COUNT(*) as c FROM sessions`).get() as { c: number }).c;
    const schemaVersion =
      (db.query(`SELECT version FROM schema_version LIMIT 1`).get() as { version: number } | null)?.version ?? 0;

    result.system = {
      schemaVersion,
      agentCount,
      projectCount,
      sessionCount,
    };
  }

  return json(result);
}

async function handleUpdateCreditConfig(req: Request, db: Database): Promise<Response> {
  let data: Record<string, string | number>;
  try {
    data = await parseBodyOrThrow(req, UpdateCreditConfigSchema);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    throw err;
  }

  const updates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(data)) {
    updates.push({ key, value: String(value) });
  }

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO credit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
  );
  db.transaction(() => {
    for (const { key, value } of updates) {
      stmt.run(key, value);
    }
  })();

  return json({ ok: true, updated: updates.length });
}

async function handleApiKeyRotate(req: Request, db: Database, authConfig: AuthConfig | null): Promise<Response> {
  if (!authConfig) {
    return json({ error: 'Auth not configured' }, 503);
  }
  if (!authConfig.apiKey) {
    return json({ error: 'No API key configured (localhost mode)' }, 400);
  }

  // Parse optional body for ttlDays
  let ttlDays = 0;
  try {
    const body = (await req.json()) as { ttlDays?: number };
    if (body.ttlDays !== undefined) {
      ttlDays = typeof body.ttlDays === 'number' ? body.ttlDays : 0;
    }
  } catch {
    // Empty body is fine — use defaults
  }

  const newKey = rotateApiKey(authConfig);

  // Set expiry if ttlDays provided
  if (ttlDays > 0) {
    setApiKeyExpiry(authConfig, ttlDays * 24 * 60 * 60 * 1000);
  }

  // Audit log
  recordAudit(
    db,
    'api_key_rotation',
    'admin',
    'api_key',
    null,
    JSON.stringify({
      ttlDays: ttlDays || null,
      expiresAt: authConfig.apiKeyExpiresAt ? new Date(authConfig.apiKeyExpiresAt).toISOString() : null,
    }),
  );

  return json({
    ok: true,
    apiKey: newKey,
    expiresAt: authConfig.apiKeyExpiresAt ? new Date(authConfig.apiKeyExpiresAt).toISOString() : null,
    gracePeriodExpiry: authConfig.previousKeyExpiry ? new Date(authConfig.previousKeyExpiry).toISOString() : null,
  });
}

function handleApiKeyStatus(authConfig: AuthConfig | null): Response {
  if (!authConfig) {
    return json({ error: 'Auth not configured' }, 503);
  }

  const rotationStatus = getApiKeyRotationStatus(authConfig);
  const expired = isApiKeyExpired(authConfig);
  const warning = getApiKeyExpiryWarning(authConfig);

  return json({
    ...rotationStatus,
    expired,
    expiresAt: authConfig.apiKeyExpiresAt ? new Date(authConfig.apiKeyExpiresAt).toISOString() : null,
    warning,
  });
}

// ─── Discord Config ───────────────────────────────────────────────────────

function handleGetDiscordConfig(db: Database): Response {
  const config = getDiscordConfigRaw(db);
  return json({ discordConfig: config });
}

async function handleUpdateDiscordConfig(req: Request, db: Database, context?: RequestContext): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate keys
  const updates: Record<string, string> = {};
  const invalidKeys: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!VALID_DISCORD_CONFIG_KEYS.has(key)) {
      invalidKeys.push(key);
      continue;
    }
    // Stringify objects/arrays for JSON fields, otherwise use string value
    updates[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  if (invalidKeys.length > 0) {
    return json(
      {
        error: `Invalid config keys: ${invalidKeys.join(', ')}`,
        validKeys: [...VALID_DISCORD_CONFIG_KEYS],
      },
      400,
    );
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No valid config keys provided' }, 400);
  }

  const count = updateDiscordConfigBatch(db, updates);
  const actor = context?.walletAddress ?? context?.tenantId ?? 'admin';
  recordAudit(db, 'discord_config_update', actor, 'discord_config', null, JSON.stringify(Object.keys(updates)));

  return json({ ok: true, updated: count });
}

function handleDeleteDiscordConfigKey(db: Database, key: string, context?: RequestContext): Response {
  if (!VALID_DISCORD_CONFIG_KEYS.has(key)) {
    return json({ error: `Invalid config key: ${key}` }, 400);
  }

  const deleted = deleteDiscordConfigKey(db, key);
  if (!deleted) {
    return json({ error: `Config key not found: ${key}` }, 404);
  }

  const actor = context?.walletAddress ?? context?.tenantId ?? 'admin';
  recordAudit(db, 'discord_config_delete', actor, 'discord_config', null, key);
  return json({ ok: true, deleted: key });
}

function handleGetGuildCache(db: Database): Response {
  const cache = loadGuildCache(db);
  return json({
    channels: cache.channels,
    roles: cache.roles,
    info: cache.info,
  });
}

// ─── Telegram Config ──────────────────────────────────────────────────────

function handleGetTelegramConfig(db: Database): Response {
  const config = getTelegramConfigRaw(db);
  return json({ telegramConfig: config });
}

async function handleUpdateTelegramConfig(req: Request, db: Database, context?: RequestContext): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate keys
  const updates: Record<string, string> = {};
  const invalidKeys: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!VALID_TELEGRAM_CONFIG_KEYS.has(key)) {
      invalidKeys.push(key);
      continue;
    }
    updates[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  if (invalidKeys.length > 0) {
    return json(
      {
        error: `Invalid config keys: ${invalidKeys.join(', ')}`,
        validKeys: [...VALID_TELEGRAM_CONFIG_KEYS],
      },
      400,
    );
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No valid config keys provided' }, 400);
  }

  const count = updateTelegramConfigBatch(db, updates);
  const actor = context?.walletAddress ?? context?.tenantId ?? 'admin';
  recordAudit(db, 'telegram_config_update', actor, 'telegram_config', null, JSON.stringify(Object.keys(updates)));

  return json({ ok: true, updated: count });
}

function handleDeleteTelegramConfigKey(db: Database, key: string, context?: RequestContext): Response {
  if (!VALID_TELEGRAM_CONFIG_KEYS.has(key)) {
    return json({ error: `Invalid config key: ${key}` }, 400);
  }

  const deleted = deleteTelegramConfigKey(db, key);
  if (!deleted) {
    return json({ error: `Config key not found: ${key}` }, 404);
  }

  const actor = context?.walletAddress ?? context?.tenantId ?? 'admin';
  recordAudit(db, 'telegram_config_delete', actor, 'telegram_config', null, key);
  return json({ ok: true, deleted: key });
}

async function handlePurgeTestData(req: Request, db: Database, context?: RequestContext): Promise<Response> {
  let dryRun = true;
  try {
    const body = (await req.json()) as { force?: boolean };
    if (body.force === true) dryRun = false;
  } catch {
    // Empty body = dry run
  }

  const result = purgeTestData(db, { dryRun });

  if (!dryRun) {
    const actor = context?.walletAddress ?? context?.tenantId ?? 'admin';
    recordAudit(db, 'purge_test_data', actor, 'database', null, JSON.stringify(result));
  }

  return json(result);
}
