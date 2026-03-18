import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { configFromEnv, validateConfig, loadAgentConfig, CONFIG_DEFAULTS } from '../config/loader';
import type { AgentDeploymentConfig } from '../../shared/types/agent-config';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal valid config for testing. */
function minimalConfig(overrides?: Partial<AgentDeploymentConfig>): AgentDeploymentConfig {
    return {
        agent: {
            name: 'test-agent',
            defaultModel: 'claude-sonnet-4-20250514',
            defaultProvider: 'anthropic',
        },
        server: {
            port: 3000,
            bindHost: '127.0.0.1',
        },
        database: {
            path: './test.db',
        },
        providers: {
            anthropic: { apiKey: 'sk-ant-test' },
            enabledProviders: ['anthropic'],
        },
        ...overrides,
    };
}

/** Save and restore process.env across tests. */
function withCleanEnv() {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Strip all env vars that configFromEnv reads
        const configEnvKeys = [
            'AGENT_NAME', 'AGENT_DESCRIPTION', 'DEFAULT_MODEL', 'DEFAULT_PROVIDER',
            'SYSTEM_PROMPT', 'PORT', 'BIND_HOST', 'API_KEY', 'ADMIN_API_KEY',
            'LOG_LEVEL', 'LOG_FORMAT', 'ALLOWED_ORIGINS', 'PUBLIC_URL',
            'SHUTDOWN_GRACE_MS', 'DATABASE_PATH', 'BACKUP_DIR', 'BACKUP_MAX_KEEP',
            'ANTHROPIC_API_KEY', 'OLLAMA_HOST', 'OLLAMA_MAX_PARALLEL',
            'OLLAMA_NUM_CTX', 'OLLAMA_NUM_PREDICT', 'OLLAMA_NUM_GPU',
            'OLLAMA_NUM_BATCH', 'OLLAMA_REQUEST_TIMEOUT', 'ENABLED_PROVIDERS',
            'COUNCIL_MODEL', 'WORK_MAX_ITERATIONS', 'WORK_TASK_MAX_PER_DAY',
            'WORKTREE_BASE_DIR', 'AGENT_TIMEOUT_MS', 'SANDBOX_ENABLED',
            'ALGOCHAT_MNEMONIC', 'ALGORAND_NETWORK', 'AGENT_NETWORK',
            'ALGOCHAT_SYNC_INTERVAL', 'ALGOCHAT_OWNER_ADDRESSES', 'ALGOCHAT_PSK_URI',
            'ALGOCHAT_DEFAULT_AGENT_ID', 'DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID',
            'DISCORD_ALLOWED_USER_IDS', 'DISCORD_ADDITIONAL_CHANNEL_IDS',
            'DISCORD_BRIDGE_MODE', 'DISCORD_APP_ID', 'DISCORD_GUILD_ID',
            'DISCORD_BOT_ROLE_ID', 'DISCORD_PUBLIC_MODE', 'DISCORD_DEFAULT_AGENT_ID',
            'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_ALLOWED_USER_IDS',
            'TELEGRAM_BRIDGE_MODE', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET',
            'SLACK_CHANNEL_ID', 'SLACK_ALLOWED_USER_IDS', 'GH_TOKEN',
            'GITHUB_WEBHOOK_SECRET', 'NOTIFICATION_GITHUB_REPO',
            'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_SERVICE_NAME', 'MULTI_TENANT',
        ];
        for (const key of configEnvKeys) {
            delete process.env[key];
        }
    });

    afterEach(() => {
        // Restore original env
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        Object.assign(process.env, originalEnv);
    });
}

// ── configFromEnv() ─────────────────────────────────────────────────────────

describe('configFromEnv', () => {
    withCleanEnv();

    describe('agent identity', () => {
        it('uses default agent name when AGENT_NAME is not set', () => {
            const config = configFromEnv();
            expect(config.agent.name).toBe('corvid-agent');
        });

        it('reads AGENT_NAME from env', () => {
            process.env.AGENT_NAME = 'my-custom-agent';
            const config = configFromEnv();
            expect(config.agent.name).toBe('my-custom-agent');
        });

        it('reads AGENT_DESCRIPTION from env', () => {
            process.env.AGENT_DESCRIPTION = 'A test agent';
            const config = configFromEnv();
            expect(config.agent.description).toBe('A test agent');
        });

        it('defaults defaultModel to claude-sonnet-4-20250514', () => {
            const config = configFromEnv();
            expect(config.agent.defaultModel).toBe('claude-sonnet-4-20250514');
        });

        it('reads DEFAULT_MODEL from env', () => {
            process.env.DEFAULT_MODEL = 'claude-opus-4-20250514';
            const config = configFromEnv();
            expect(config.agent.defaultModel).toBe('claude-opus-4-20250514');
        });

        it('reads SYSTEM_PROMPT from env', () => {
            process.env.SYSTEM_PROMPT = 'You are helpful.';
            const config = configFromEnv();
            expect(config.agent.systemPrompt).toBe('You are helpful.');
        });
    });

    describe('provider auto-detection', () => {
        it('defaults to ollama when no ANTHROPIC_API_KEY', () => {
            const config = configFromEnv();
            expect(config.agent.defaultProvider).toBe('ollama');
        });

        it('defaults to anthropic when ANTHROPIC_API_KEY is set', () => {
            process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
            const config = configFromEnv();
            expect(config.agent.defaultProvider).toBe('anthropic');
        });

        it('reads DEFAULT_PROVIDER from env when explicitly set', () => {
            process.env.DEFAULT_PROVIDER = 'ollama';
            process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
            const config = configFromEnv();
            expect(config.agent.defaultProvider).toBe('ollama');
        });

        it('auto-detects enabledProviders with anthropic when key present', () => {
            process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
            const config = configFromEnv();
            expect(config.providers.enabledProviders).toContain('anthropic');
            expect(config.providers.enabledProviders).toContain('ollama');
        });

        it('only includes ollama in enabledProviders when no anthropic key', () => {
            const config = configFromEnv();
            expect(config.providers.enabledProviders).toEqual(['ollama']);
        });

        it('reads ENABLED_PROVIDERS csv from env', () => {
            process.env.ENABLED_PROVIDERS = 'anthropic, ollama';
            const config = configFromEnv();
            expect(config.providers.enabledProviders).toEqual(['anthropic', 'ollama']);
        });
    });

    describe('server settings', () => {
        it('defaults port to 3000', () => {
            const config = configFromEnv();
            expect(config.server.port).toBe(3000);
        });

        it('reads PORT from env', () => {
            process.env.PORT = '8080';
            const config = configFromEnv();
            expect(config.server.port).toBe(8080);
        });

        it('defaults bindHost to 127.0.0.1', () => {
            const config = configFromEnv();
            expect(config.server.bindHost).toBe('127.0.0.1');
        });

        it('reads BIND_HOST from env', () => {
            process.env.BIND_HOST = '0.0.0.0';
            const config = configFromEnv();
            expect(config.server.bindHost).toBe('0.0.0.0');
        });

        it('reads API_KEY and ADMIN_API_KEY from env', () => {
            process.env.API_KEY = 'my-api-key';
            process.env.ADMIN_API_KEY = 'my-admin-key';
            const config = configFromEnv();
            expect(config.server.apiKey).toBe('my-api-key');
            expect(config.server.adminApiKey).toBe('my-admin-key');
        });

        it('defaults logLevel to info', () => {
            const config = configFromEnv();
            expect(config.server.logLevel).toBe('info');
        });

        it('defaults logFormat to text', () => {
            const config = configFromEnv();
            expect(config.server.logFormat).toBe('text');
        });

        it('defaults shutdownGraceMs to 30000', () => {
            const config = configFromEnv();
            expect(config.server.shutdownGraceMs).toBe(30_000);
        });

        it('reads SHUTDOWN_GRACE_MS from env', () => {
            process.env.SHUTDOWN_GRACE_MS = '10000';
            const config = configFromEnv();
            expect(config.server.shutdownGraceMs).toBe(10_000);
        });
    });

    describe('database settings', () => {
        it('defaults database path to ./corvid-agent.db', () => {
            const config = configFromEnv();
            expect(config.database.path).toBe('./corvid-agent.db');
        });

        it('reads DATABASE_PATH from env', () => {
            process.env.DATABASE_PATH = '/data/agent.db';
            const config = configFromEnv();
            expect(config.database.path).toBe('/data/agent.db');
        });

        it('defaults backupMaxKeep to 10', () => {
            const config = configFromEnv();
            expect(config.database.backupMaxKeep).toBe(10);
        });

        it('reads BACKUP_MAX_KEEP from env', () => {
            process.env.BACKUP_MAX_KEEP = '5';
            const config = configFromEnv();
            expect(config.database.backupMaxKeep).toBe(5);
        });
    });

    describe('providers', () => {
        it('sets anthropic config when ANTHROPIC_API_KEY is present', () => {
            process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
            const config = configFromEnv();
            expect(config.providers.anthropic).toEqual({ apiKey: 'sk-ant-test123' });
        });

        it('leaves anthropic undefined when no key set', () => {
            const config = configFromEnv();
            expect(config.providers.anthropic).toBeUndefined();
        });

        it('defaults ollama host to localhost:11434', () => {
            const config = configFromEnv();
            expect(config.providers.ollama?.host).toBe('http://localhost:11434');
        });

        it('reads OLLAMA_HOST from env', () => {
            process.env.OLLAMA_HOST = 'http://gpu-server:11434';
            const config = configFromEnv();
            expect(config.providers.ollama?.host).toBe('http://gpu-server:11434');
        });

        it('reads ollama numeric parameters from env', () => {
            process.env.OLLAMA_MAX_PARALLEL = '4';
            process.env.OLLAMA_NUM_CTX = '8192';
            process.env.OLLAMA_NUM_PREDICT = '4096';
            process.env.OLLAMA_NUM_GPU = '2';
            process.env.OLLAMA_NUM_BATCH = '128';
            process.env.OLLAMA_REQUEST_TIMEOUT = '60000';
            const config = configFromEnv();
            expect(config.providers.ollama?.maxParallel).toBe(4);
            expect(config.providers.ollama?.numCtx).toBe(8192);
            expect(config.providers.ollama?.numPredict).toBe(4096);
            expect(config.providers.ollama?.numGpu).toBe(2);
            expect(config.providers.ollama?.numBatch).toBe(128);
            expect(config.providers.ollama?.requestTimeoutMs).toBe(60000);
        });

        it('reads COUNCIL_MODEL from env', () => {
            process.env.COUNCIL_MODEL = 'claude-opus-4-20250514';
            const config = configFromEnv();
            expect(config.providers.councilModel).toBe('claude-opus-4-20250514');
        });
    });

    describe('work pipeline', () => {
        it('applies work defaults', () => {
            const config = configFromEnv();
            expect(config.work?.maxIterations).toBe(CONFIG_DEFAULTS.work.maxIterations);
            expect(config.work?.maxPerDay).toBe(CONFIG_DEFAULTS.work.maxPerDay);
            expect(config.work?.drainTimeoutMs).toBe(CONFIG_DEFAULTS.work.drainTimeoutMs);
            expect(config.work?.queue?.maxConcurrency).toBe(CONFIG_DEFAULTS.work.queue.maxConcurrency);
            expect(config.work?.queue?.pollIntervalMs).toBe(CONFIG_DEFAULTS.work.queue.pollIntervalMs);
        });

        it('reads WORK_MAX_ITERATIONS from env', () => {
            process.env.WORK_MAX_ITERATIONS = '5';
            const config = configFromEnv();
            expect(config.work?.maxIterations).toBe(5);
        });

        it('reads WORK_TASK_MAX_PER_DAY from env', () => {
            process.env.WORK_TASK_MAX_PER_DAY = '50';
            const config = configFromEnv();
            expect(config.work?.maxPerDay).toBe(50);
        });
    });

    describe('process manager', () => {
        it('applies process defaults', () => {
            const config = configFromEnv();
            expect(config.process?.maxTurnsBeforeContextReset).toBe(CONFIG_DEFAULTS.process.maxTurnsBeforeContextReset);
            expect(config.process?.inactivityTimeoutMs).toBe(CONFIG_DEFAULTS.process.inactivityTimeoutMs);
        });

        it('reads AGENT_TIMEOUT_MS from env', () => {
            process.env.AGENT_TIMEOUT_MS = '900000';
            const config = configFromEnv();
            expect(config.process?.inactivityTimeoutMs).toBe(900_000);
        });

        it('reads SANDBOX_ENABLED from env', () => {
            process.env.SANDBOX_ENABLED = 'true';
            const config = configFromEnv();
            expect(config.process?.sandbox?.enabled).toBe(true);
        });

        it('defaults sandbox to disabled', () => {
            const config = configFromEnv();
            expect(config.process?.sandbox?.enabled).toBe(false);
        });
    });

    describe('integrations', () => {
        it('enables discord when both token and channel are set', () => {
            process.env.DISCORD_BOT_TOKEN = 'bot-token';
            process.env.DISCORD_CHANNEL_ID = '123456';
            const config = configFromEnv();
            expect(config.integrations?.discord?.enabled).toBe(true);
        });

        it('disables discord when token is missing', () => {
            process.env.DISCORD_CHANNEL_ID = '123456';
            const config = configFromEnv();
            expect(config.integrations?.discord?.enabled).toBe(false);
        });

        it('disables discord when channel is missing', () => {
            process.env.DISCORD_BOT_TOKEN = 'bot-token';
            const config = configFromEnv();
            expect(config.integrations?.discord?.enabled).toBe(false);
        });

        it('parses DISCORD_ALLOWED_USER_IDS as csv', () => {
            process.env.DISCORD_ALLOWED_USER_IDS = 'user1, user2, user3';
            const config = configFromEnv();
            expect(config.integrations?.discord?.allowedUserIds).toEqual(['user1', 'user2', 'user3']);
        });

        it('enables telegram when both token and chat id are set', () => {
            process.env.TELEGRAM_BOT_TOKEN = 'tg-token';
            process.env.TELEGRAM_CHAT_ID = '789';
            const config = configFromEnv();
            expect(config.integrations?.telegram?.enabled).toBe(true);
        });

        it('enables slack when both token and signing secret are set', () => {
            process.env.SLACK_BOT_TOKEN = 'xoxb-token';
            process.env.SLACK_SIGNING_SECRET = 'secret';
            const config = configFromEnv();
            expect(config.integrations?.slack?.enabled).toBe(true);
        });

        it('enables algochat when mnemonic is set', () => {
            process.env.ALGOCHAT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
            const config = configFromEnv();
            expect(config.integrations?.algochat?.enabled).toBe(true);
        });

        it('disables algochat when mnemonic is not set', () => {
            const config = configFromEnv();
            expect(config.integrations?.algochat?.enabled).toBe(false);
        });

        it('reads GH_TOKEN from env', () => {
            process.env.GH_TOKEN = 'ghp_test';
            const config = configFromEnv();
            expect(config.integrations?.github?.token).toBe('ghp_test');
        });

        it('reads DISCORD_PUBLIC_MODE from env', () => {
            process.env.DISCORD_PUBLIC_MODE = 'true';
            const config = configFromEnv();
            expect(config.integrations?.discord?.publicMode).toBe(true);
        });
    });

    describe('observability', () => {
        it('reads OTEL endpoint from env', () => {
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4317';
            const config = configFromEnv();
            expect(config.observability?.otel?.endpoint).toBe('http://otel:4317');
        });

        it('reads OTEL_SERVICE_NAME from env', () => {
            process.env.OTEL_SERVICE_NAME = 'my-service';
            const config = configFromEnv();
            expect(config.observability?.otel?.serviceName).toBe('my-service');
        });
    });

    describe('multi-tenant', () => {
        it('defaults multiTenant to false', () => {
            const config = configFromEnv();
            expect(config.multiTenant).toBe(false);
        });

        it('sets multiTenant to true when MULTI_TENANT=true', () => {
            process.env.MULTI_TENANT = 'true';
            const config = configFromEnv();
            expect(config.multiTenant).toBe(true);
        });
    });

    describe('empty env edge cases', () => {
        it('handles completely empty environment gracefully', () => {
            const config = configFromEnv();
            // Should not throw, should return valid defaults
            expect(config.agent.name).toBe('corvid-agent');
            expect(config.server.port).toBe(3000);
            expect(config.database.path).toBe('./corvid-agent.db');
            expect(config.providers.enabledProviders).toContain('ollama');
        });

        it('treats empty ENABLED_PROVIDERS as unset (triggers auto-detect)', () => {
            process.env.ENABLED_PROVIDERS = '';
            const config = configFromEnv();
            // Empty csv should be filtered, triggering auto-detect
            expect(config.providers.enabledProviders).toContain('ollama');
        });

        it('trims whitespace in csv lists', () => {
            process.env.DISCORD_ALLOWED_USER_IDS = '  user1 , user2  ,  user3  ';
            const config = configFromEnv();
            expect(config.integrations?.discord?.allowedUserIds).toEqual(['user1', 'user2', 'user3']);
        });

        it('filters empty entries in csv lists', () => {
            process.env.DISCORD_ALLOWED_USER_IDS = 'user1,,user2,';
            const config = configFromEnv();
            expect(config.integrations?.discord?.allowedUserIds).toEqual(['user1', 'user2']);
        });
    });
});

// ── validateConfig() ────────────────────────────────────────────────────────

describe('validateConfig', () => {
    it('returns no errors for a valid minimal config', () => {
        const config = minimalConfig();
        const errors = validateConfig(config);
        expect(errors).toEqual([]);
    });

    describe('required fields', () => {
        it('requires agent.name', () => {
            const config = minimalConfig();
            config.agent.name = '';
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'agent.name')).toBe(true);
        });

        it('requires agent.defaultModel', () => {
            const config = minimalConfig();
            config.agent.defaultModel = '';
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'agent.defaultModel')).toBe(true);
        });

        it('requires agent.defaultProvider', () => {
            const config = minimalConfig();
            config.agent.defaultProvider = '';
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'agent.defaultProvider')).toBe(true);
        });

        it('requires database.path', () => {
            const config = minimalConfig();
            config.database.path = '';
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'database.path')).toBe(true);
        });

        it('requires at least one enabled provider', () => {
            const config = minimalConfig();
            config.providers.enabledProviders = [];
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'providers.enabledProviders')).toBe(true);
        });
    });

    describe('port validation', () => {
        it('rejects negative port', () => {
            const config = minimalConfig();
            config.server.port = -1;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.port')).toBe(true);
        });

        it('rejects port above 65535', () => {
            const config = minimalConfig();
            config.server.port = 70000;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.port')).toBe(true);
        });

        it('accepts port 0 (OS-assigned)', () => {
            const config = minimalConfig();
            config.server.port = 0;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.port')).toBe(false);
        });

        it('accepts port 65535', () => {
            const config = minimalConfig();
            config.server.port = 65535;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.port')).toBe(false);
        });
    });

    describe('API key requirement for non-localhost', () => {
        it('requires API key when bindHost is 0.0.0.0', () => {
            const config = minimalConfig();
            config.server.bindHost = '0.0.0.0';
            config.server.apiKey = undefined;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.apiKey')).toBe(true);
        });

        it('does not require API key when bindHost is 127.0.0.1', () => {
            const config = minimalConfig();
            config.server.bindHost = '127.0.0.1';
            config.server.apiKey = undefined;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.apiKey')).toBe(false);
        });

        it('does not require API key when bindHost is localhost', () => {
            const config = minimalConfig();
            config.server.bindHost = 'localhost';
            config.server.apiKey = undefined;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.apiKey')).toBe(false);
        });

        it('accepts non-localhost when API key is provided', () => {
            const config = minimalConfig();
            config.server.bindHost = '0.0.0.0';
            config.server.apiKey = 'my-secret-key';
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'server.apiKey')).toBe(false);
        });
    });

    describe('provider API key validation', () => {
        it('requires anthropic API key when anthropic is in enabledProviders', () => {
            const config = minimalConfig();
            config.providers.enabledProviders = ['anthropic'];
            config.providers.anthropic = undefined;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'providers.anthropic.apiKey')).toBe(true);
        });

        it('does not require anthropic key when only ollama is enabled', () => {
            const config = minimalConfig();
            config.providers.enabledProviders = ['ollama'];
            config.providers.anthropic = undefined;
            const errors = validateConfig(config);
            expect(errors.some((e) => e.path === 'providers.anthropic.apiKey')).toBe(false);
        });
    });

    describe('multiple errors', () => {
        it('collects multiple validation errors at once', () => {
            const config = minimalConfig();
            config.agent.name = '';
            config.agent.defaultModel = '';
            config.server.port = -1;
            const errors = validateConfig(config);
            expect(errors.length).toBeGreaterThanOrEqual(3);
        });
    });
});

// ── loadAgentConfig() ───────────────────────────────────────────────────────

describe('loadAgentConfig', () => {
    withCleanEnv();

    it('falls back to env vars when no config file is found', async () => {
        // When called without a path, loadAgentConfig discovers corvid-agent.config.ts
        // in the repo root. To test env fallback, we call configFromEnv() directly.
        process.env.AGENT_NAME = 'env-agent';
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
        const config = configFromEnv();
        expect(config.agent.name).toBe('env-agent');
    });

    it('applies defaults to optional fields', async () => {
        // With minimal env, optional fields should get defaults
        const config = await loadAgentConfig();
        expect(config.work?.maxIterations).toBe(CONFIG_DEFAULTS.work.maxIterations);
        expect(config.work?.maxPerDay).toBe(CONFIG_DEFAULTS.work.maxPerDay);
        expect(config.work?.drainTimeoutMs).toBe(CONFIG_DEFAULTS.work.drainTimeoutMs);
        expect(config.work?.queue?.maxConcurrency).toBe(CONFIG_DEFAULTS.work.queue.maxConcurrency);
        expect(config.scheduler?.pollIntervalMs).toBe(CONFIG_DEFAULTS.scheduler.pollIntervalMs);
        expect(config.scheduler?.maxConcurrentExecutions).toBe(CONFIG_DEFAULTS.scheduler.maxConcurrentExecutions);
        expect(config.process?.maxTurnsBeforeContextReset).toBe(CONFIG_DEFAULTS.process.maxTurnsBeforeContextReset);
        expect(config.process?.inactivityTimeoutMs).toBe(CONFIG_DEFAULTS.process.inactivityTimeoutMs);
    });

    it('loads config from explicit JSON file path', async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
        const configPath = join(tmpDir, 'test-config.json');
        const jsonConfig: AgentDeploymentConfig = {
            agent: {
                name: 'json-agent',
                defaultModel: 'test-model',
                defaultProvider: 'ollama',
            },
            server: {
                port: 4000,
                bindHost: '127.0.0.1',
            },
            database: {
                path: './json-test.db',
            },
            providers: {
                ollama: { host: 'http://localhost:11434' },
                enabledProviders: ['ollama'],
            },
        };
        writeFileSync(configPath, JSON.stringify(jsonConfig));

        try {
            const config = await loadAgentConfig(configPath);
            expect(config.agent.name).toBe('json-agent');
            expect(config.server.port).toBe(4000);
            expect(config.database.path).toBe('./json-test.db');
            // Defaults should be applied
            expect(config.work?.maxIterations).toBe(CONFIG_DEFAULTS.work.maxIterations);
            expect(config.scheduler?.pollIntervalMs).toBe(CONFIG_DEFAULTS.scheduler.pollIntervalMs);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('loads config from explicit .ts file path', async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
        const configPath = join(tmpDir, 'test-config.ts');
        const tsContent = `
            const config = {
                agent: {
                    name: 'ts-agent',
                    defaultModel: 'test-model',
                    defaultProvider: 'ollama',
                },
                server: {
                    port: 5000,
                    bindHost: '127.0.0.1',
                },
                database: {
                    path: './ts-test.db',
                },
                providers: {
                    ollama: { host: 'http://localhost:11434' },
                    enabledProviders: ['ollama'],
                },
            };
            export default config;
        `;
        writeFileSync(configPath, tsContent);

        try {
            const config = await loadAgentConfig(configPath);
            expect(config.agent.name).toBe('ts-agent');
            expect(config.server.port).toBe(5000);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('throws when config file has no default or named config export', async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
        const configPath = join(tmpDir, 'bad-config.ts');
        writeFileSync(configPath, 'export const notConfig = 42;');

        try {
            await expect(loadAgentConfig(configPath)).rejects.toThrow('must export a default or named');
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('does not throw on validation warnings (logs instead)', async () => {
        // Empty env produces a config that may have validation warnings
        // (e.g. no anthropic key when anthropic is auto-enabled)
        // loadAgentConfig should NOT throw
        const config = await loadAgentConfig();
        expect(config).toBeDefined();
        expect(config.agent.name).toBeDefined();
    });
});

// ── CONFIG_DEFAULTS ─────────────────────────────────────────────────────────

describe('CONFIG_DEFAULTS', () => {
    it('has expected server defaults', () => {
        expect(CONFIG_DEFAULTS.server.port).toBe(3000);
        expect(CONFIG_DEFAULTS.server.bindHost).toBe('127.0.0.1');
        expect(CONFIG_DEFAULTS.server.logLevel).toBe('info');
        expect(CONFIG_DEFAULTS.server.logFormat).toBe('text');
        expect(CONFIG_DEFAULTS.server.shutdownGraceMs).toBe(30_000);
    });

    it('has expected database defaults', () => {
        expect(CONFIG_DEFAULTS.database.path).toBe('./corvid-agent.db');
        expect(CONFIG_DEFAULTS.database.backupMaxKeep).toBe(10);
    });

    it('has expected work defaults', () => {
        expect(CONFIG_DEFAULTS.work.maxIterations).toBe(3);
        expect(CONFIG_DEFAULTS.work.maxPerDay).toBe(100);
        expect(CONFIG_DEFAULTS.work.drainTimeoutMs).toBe(300_000);
        expect(CONFIG_DEFAULTS.work.queue.maxConcurrency).toBe(2);
        expect(CONFIG_DEFAULTS.work.queue.pollIntervalMs).toBe(5_000);
    });

    it('has expected scheduler defaults', () => {
        expect(CONFIG_DEFAULTS.scheduler.pollIntervalMs).toBe(30_000);
        expect(CONFIG_DEFAULTS.scheduler.maxConcurrentExecutions).toBe(2);
        expect(CONFIG_DEFAULTS.scheduler.minScheduleIntervalMs).toBe(300_000);
    });

    it('has expected process defaults', () => {
        expect(CONFIG_DEFAULTS.process.maxTurnsBeforeContextReset).toBe(8);
        expect(CONFIG_DEFAULTS.process.inactivityTimeoutMs).toBe(1_800_000);
    });
});
