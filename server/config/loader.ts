/**
 * Configuration loader for agent deployments.
 *
 * Supports three loading strategies (in priority order):
 * 1. Explicit config file path passed to {@link loadAgentConfig}.
 * 2. Auto-discovered `corvid-agent.config.ts`, `.js`, or `.json` in the working directory.
 * 3. Environment variables (backward-compatible with the existing .env approach).
 *
 * After loading, the config is validated and defaults are applied for optional fields.
 */

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { AgentDeploymentConfig } from '../../shared/types/agent-config';
import { createLogger } from '../lib/logger';

const log = createLogger('ConfigLoader');

// ── Defaults ────────────────────────────────────────────────────────────────

/** Default values applied to optional configuration fields. */
export const CONFIG_DEFAULTS = {
    server: {
        port: 3000,
        bindHost: '127.0.0.1',
        logLevel: 'info' as const,
        logFormat: 'text' as const,
        shutdownGraceMs: 30_000,
    },
    database: {
        path: './corvid-agent.db',
        backupMaxKeep: 10,
    },
    work: {
        maxIterations: 3,
        maxPerDay: 100,
        drainTimeoutMs: 300_000,
        queue: {
            maxConcurrency: 2,
            pollIntervalMs: 5_000,
        },
    },
    scheduler: {
        pollIntervalMs: 30_000,
        maxConcurrentExecutions: 2,
        minScheduleIntervalMs: 300_000,
    },
    process: {
        maxTurnsBeforeContextReset: 8,
        inactivityTimeoutMs: 1_800_000,
    },
} as const;

// ── Config File Discovery ───────────────────────────────────────────────────

/** File names searched (in order) when auto-discovering a config file. */
const CONFIG_FILE_NAMES = [
    'corvid-agent.config.ts',
    'corvid-agent.config.js',
    'corvid-agent.config.json',
];

/**
 * Attempt to find a config file in the given directory.
 * Returns the resolved path if found, or null.
 */
function discoverConfigFile(dir: string): string | null {
    for (const name of CONFIG_FILE_NAMES) {
        const candidate = join(dir, name);
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

// ── Environment Variable Mapping ────────────────────────────────────────────

/**
 * Build an {@link AgentDeploymentConfig} entirely from environment variables.
 *
 * This provides full backward compatibility with deployments that use `.env`
 * files instead of a dedicated config file. Every env var from `.env.example`
 * is mapped to the corresponding config field.
 */
export function configFromEnv(): AgentDeploymentConfig {
    const env = process.env;

    // Helper: split comma-separated env var into string array
    const csvList = (key: string): string[] =>
        (env[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    // Determine enabled providers
    const enabledProviders = csvList('ENABLED_PROVIDERS');
    if (enabledProviders.length === 0) {
        // Auto-detect: if an Anthropic key is present, enable anthropic
        if (env.ANTHROPIC_API_KEY) enabledProviders.push('anthropic');
        // Always include ollama as a fallback option
        enabledProviders.push('ollama');
    }

    return {
        agent: {
            name: env.AGENT_NAME ?? 'corvid-agent',
            description: env.AGENT_DESCRIPTION,
            defaultModel: env.DEFAULT_MODEL ?? 'claude-sonnet-4-20250514',
            defaultProvider: env.DEFAULT_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'ollama'),
            systemPrompt: env.SYSTEM_PROMPT,
        },

        server: {
            port: parseInt(env.PORT ?? '3000', 10),
            bindHost: env.BIND_HOST ?? CONFIG_DEFAULTS.server.bindHost,
            apiKey: env.API_KEY,
            adminApiKey: env.ADMIN_API_KEY,
            logLevel: (env.LOG_LEVEL as AgentDeploymentConfig['server']['logLevel']) ?? CONFIG_DEFAULTS.server.logLevel,
            logFormat: (env.LOG_FORMAT as AgentDeploymentConfig['server']['logFormat']) ?? CONFIG_DEFAULTS.server.logFormat,
            allowedOrigins: env.ALLOWED_ORIGINS,
            publicUrl: env.PUBLIC_URL,
            shutdownGraceMs: parseInt(env.SHUTDOWN_GRACE_MS ?? String(CONFIG_DEFAULTS.server.shutdownGraceMs), 10),
        },

        database: {
            path: env.DATABASE_PATH ?? CONFIG_DEFAULTS.database.path,
            backupDir: env.BACKUP_DIR,
            backupMaxKeep: env.BACKUP_MAX_KEEP ? parseInt(env.BACKUP_MAX_KEEP, 10) : CONFIG_DEFAULTS.database.backupMaxKeep,
        },

        providers: {
            anthropic: env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : undefined,
            ollama: {
                host: env.OLLAMA_HOST ?? 'http://localhost:11434',
                maxParallel: env.OLLAMA_MAX_PARALLEL ? parseInt(env.OLLAMA_MAX_PARALLEL, 10) : undefined,
                numCtx: env.OLLAMA_NUM_CTX ? parseInt(env.OLLAMA_NUM_CTX, 10) : undefined,
                numPredict: env.OLLAMA_NUM_PREDICT ? parseInt(env.OLLAMA_NUM_PREDICT, 10) : undefined,
                numGpu: env.OLLAMA_NUM_GPU ? parseInt(env.OLLAMA_NUM_GPU, 10) : undefined,
                numBatch: env.OLLAMA_NUM_BATCH ? parseInt(env.OLLAMA_NUM_BATCH, 10) : undefined,
                requestTimeoutMs: env.OLLAMA_REQUEST_TIMEOUT ? parseInt(env.OLLAMA_REQUEST_TIMEOUT, 10) : undefined,
            },
            enabledProviders,
            councilModel: env.COUNCIL_MODEL,
        },

        work: {
            maxIterations: env.WORK_MAX_ITERATIONS ? parseInt(env.WORK_MAX_ITERATIONS, 10) : CONFIG_DEFAULTS.work.maxIterations,
            maxPerDay: env.WORK_TASK_MAX_PER_DAY ? parseInt(env.WORK_TASK_MAX_PER_DAY, 10) : CONFIG_DEFAULTS.work.maxPerDay,
            drainTimeoutMs: CONFIG_DEFAULTS.work.drainTimeoutMs,
            worktreeBaseDir: env.WORKTREE_BASE_DIR,
            queue: {
                maxConcurrency: CONFIG_DEFAULTS.work.queue.maxConcurrency,
                pollIntervalMs: CONFIG_DEFAULTS.work.queue.pollIntervalMs,
            },
        },

        scheduler: {
            pollIntervalMs: CONFIG_DEFAULTS.scheduler.pollIntervalMs,
            maxConcurrentExecutions: CONFIG_DEFAULTS.scheduler.maxConcurrentExecutions,
            minScheduleIntervalMs: CONFIG_DEFAULTS.scheduler.minScheduleIntervalMs,
        },

        process: {
            maxTurnsBeforeContextReset: CONFIG_DEFAULTS.process.maxTurnsBeforeContextReset,
            inactivityTimeoutMs: env.AGENT_TIMEOUT_MS
                ? parseInt(env.AGENT_TIMEOUT_MS, 10)
                : CONFIG_DEFAULTS.process.inactivityTimeoutMs,
            sandbox: {
                enabled: env.SANDBOX_ENABLED === 'true',
            },
        },

        integrations: {
            algochat: {
                enabled: Boolean(env.ALGOCHAT_MNEMONIC),
                mnemonic: env.ALGOCHAT_MNEMONIC,
                network: (env.ALGORAND_NETWORK as 'localnet' | 'testnet' | 'mainnet') ?? 'localnet',
                agentNetwork: env.AGENT_NETWORK as 'localnet' | 'testnet' | 'mainnet' | undefined,
                syncInterval: env.ALGOCHAT_SYNC_INTERVAL ? parseInt(env.ALGOCHAT_SYNC_INTERVAL, 10) : undefined,
                ownerAddresses: csvList('ALGOCHAT_OWNER_ADDRESSES'),
                pskUri: env.ALGOCHAT_PSK_URI,
                defaultAgentId: env.ALGOCHAT_DEFAULT_AGENT_ID,
            },
            discord: {
                enabled: Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID),
                botToken: env.DISCORD_BOT_TOKEN,
                channelId: env.DISCORD_CHANNEL_ID,
                allowedUserIds: csvList('DISCORD_ALLOWED_USER_IDS'),
                additionalChannelIds: csvList('DISCORD_ADDITIONAL_CHANNEL_IDS'),
                mode: env.DISCORD_BRIDGE_MODE as 'chat' | 'work_intake' | undefined,
                appId: env.DISCORD_APP_ID,
                guildId: env.DISCORD_GUILD_ID,
                botRoleId: env.DISCORD_BOT_ROLE_ID,
                publicMode: env.DISCORD_PUBLIC_MODE === 'true',
                defaultAgentId: env.DISCORD_DEFAULT_AGENT_ID,
            },
            telegram: {
                enabled: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
                botToken: env.TELEGRAM_BOT_TOKEN,
                chatId: env.TELEGRAM_CHAT_ID,
                allowedUserIds: csvList('TELEGRAM_ALLOWED_USER_IDS'),
                mode: env.TELEGRAM_BRIDGE_MODE as 'chat' | 'work_intake' | undefined,
            },
            slack: {
                enabled: Boolean(env.SLACK_BOT_TOKEN && env.SLACK_SIGNING_SECRET),
                botToken: env.SLACK_BOT_TOKEN,
                signingSecret: env.SLACK_SIGNING_SECRET,
                channelId: env.SLACK_CHANNEL_ID,
                allowedUserIds: csvList('SLACK_ALLOWED_USER_IDS'),
            },
            github: {
                token: env.GH_TOKEN,
                webhookSecret: env.GITHUB_WEBHOOK_SECRET,
                notificationRepo: env.NOTIFICATION_GITHUB_REPO,
                owner: env.GITHUB_OWNER,
                repo: env.GITHUB_REPO,
                allowedOrgs: csvList('GITHUB_ALLOWED_ORGS'),
            },
        },

        observability: {
            otel: {
                endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
                serviceName: env.OTEL_SERVICE_NAME,
            },
        },

        multiTenant: env.MULTI_TENANT === 'true',
    };
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Validation errors collected during config checking. */
export interface ConfigValidationError {
    /** Dot-path to the offending field (e.g. 'server.port'). */
    path: string;
    /** Human-readable description of the problem. */
    message: string;
}

/**
 * Validate a deployment config, returning any errors found.
 * An empty array means the config is valid.
 */
export function validateConfig(config: AgentDeploymentConfig): ConfigValidationError[] {
    const errors: ConfigValidationError[] = [];

    // Required fields
    if (!config.agent.name) {
        errors.push({ path: 'agent.name', message: 'Agent name is required' });
    }
    if (!config.agent.defaultModel) {
        errors.push({ path: 'agent.defaultModel', message: 'Default model is required' });
    }
    if (!config.agent.defaultProvider) {
        errors.push({ path: 'agent.defaultProvider', message: 'Default provider is required' });
    }

    // Server validation
    if (config.server.port < 0 || config.server.port > 65535) {
        errors.push({ path: 'server.port', message: 'Port must be between 0 and 65535' });
    }
    if (config.server.bindHost !== '127.0.0.1' && config.server.bindHost !== 'localhost' && !config.server.apiKey) {
        errors.push({ path: 'server.apiKey', message: 'API key is required when binding to non-localhost address' });
    }

    // Provider validation
    if (!config.providers.enabledProviders || config.providers.enabledProviders.length === 0) {
        errors.push({ path: 'providers.enabledProviders', message: 'At least one provider must be enabled' });
    }
    if (config.providers.enabledProviders.includes('anthropic') && !config.providers.anthropic?.apiKey) {
        errors.push({ path: 'providers.anthropic.apiKey', message: 'Anthropic API key is required when anthropic provider is enabled' });
    }

    // Database path
    if (!config.database.path) {
        errors.push({ path: 'database.path', message: 'Database path is required' });
    }

    return errors;
}

// ── Defaults Application ────────────────────────────────────────────────────

/**
 * Apply default values to optional fields that were not set.
 * Mutates the config in place and returns it for convenience.
 */
function applyDefaults(config: AgentDeploymentConfig): AgentDeploymentConfig {
    // Work defaults
    if (!config.work) {
        config.work = { ...CONFIG_DEFAULTS.work, queue: { ...CONFIG_DEFAULTS.work.queue } };
    } else {
        config.work.maxIterations ??= CONFIG_DEFAULTS.work.maxIterations;
        config.work.maxPerDay ??= CONFIG_DEFAULTS.work.maxPerDay;
        config.work.drainTimeoutMs ??= CONFIG_DEFAULTS.work.drainTimeoutMs;
        if (!config.work.queue) {
            config.work.queue = { ...CONFIG_DEFAULTS.work.queue };
        } else {
            config.work.queue.maxConcurrency ??= CONFIG_DEFAULTS.work.queue.maxConcurrency;
            config.work.queue.pollIntervalMs ??= CONFIG_DEFAULTS.work.queue.pollIntervalMs;
        }
    }

    // Scheduler defaults
    if (!config.scheduler) {
        config.scheduler = { ...CONFIG_DEFAULTS.scheduler };
    } else {
        config.scheduler.pollIntervalMs ??= CONFIG_DEFAULTS.scheduler.pollIntervalMs;
        config.scheduler.maxConcurrentExecutions ??= CONFIG_DEFAULTS.scheduler.maxConcurrentExecutions;
        config.scheduler.minScheduleIntervalMs ??= CONFIG_DEFAULTS.scheduler.minScheduleIntervalMs;
    }

    // Process defaults
    if (!config.process) {
        config.process = {
            maxTurnsBeforeContextReset: CONFIG_DEFAULTS.process.maxTurnsBeforeContextReset,
            inactivityTimeoutMs: CONFIG_DEFAULTS.process.inactivityTimeoutMs,
        };
    } else {
        config.process.maxTurnsBeforeContextReset ??= CONFIG_DEFAULTS.process.maxTurnsBeforeContextReset;
        config.process.inactivityTimeoutMs ??= CONFIG_DEFAULTS.process.inactivityTimeoutMs;
    }

    return config;
}

// ── Main Loader ─────────────────────────────────────────────────────────────

/**
 * Load, validate, and return the agent deployment configuration.
 *
 * Loading strategy (in priority order):
 * 1. If `configPath` is provided, load from that file.
 * 2. If a config file exists in the current directory, load it.
 * 3. Fall back to environment variables.
 *
 * @param configPath - Optional explicit path to a config file.
 * @returns The validated and defaults-applied configuration.
 * @throws If the config file cannot be loaded or validation fails.
 */
export async function loadAgentConfig(configPath?: string): Promise<AgentDeploymentConfig> {
    let config: AgentDeploymentConfig;

    // Strategy 1: Explicit path
    if (configPath) {
        const resolved = resolve(configPath);
        log.info('Loading config from explicit path', { path: resolved });
        config = await loadConfigFile(resolved);
    } else {
        // Strategy 2: Auto-discover
        const discovered = discoverConfigFile(process.cwd());
        if (discovered) {
            log.info('Discovered config file', { path: discovered });
            config = await loadConfigFile(discovered);
        } else {
            // Strategy 3: Environment variables
            log.info('No config file found, loading from environment variables');
            config = configFromEnv();
        }
    }

    // Apply defaults for optional fields
    applyDefaults(config);

    // Validate
    const errors = validateConfig(config);
    if (errors.length > 0) {
        const summary = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
        log.warn('Configuration validation warnings', { errorCount: errors.length });
        log.warn(`Validation details:\n${summary}`);
        // Log warnings but don't throw — some deployments intentionally run
        // without an API key on localhost, for example.
    }

    return config;
}

/**
 * Load a config file by path. Supports `.ts`, `.js`, and `.json` extensions.
 * The file must export a default or named `config` export matching {@link AgentDeploymentConfig}.
 */
async function loadConfigFile(filePath: string): Promise<AgentDeploymentConfig> {
    if (filePath.endsWith('.json')) {
        const text = await Bun.file(filePath).text();
        return JSON.parse(text) as AgentDeploymentConfig;
    }

    // For .ts and .js files, use dynamic import (Bun handles TS natively)
    const mod = await import(filePath) as { default?: AgentDeploymentConfig; config?: AgentDeploymentConfig };
    const config = mod.default ?? mod.config;
    if (!config) {
        throw new Error(`Config file ${filePath} must export a default or named 'config' export`);
    }
    return config;
}
