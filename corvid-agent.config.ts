/**
 * Default deployment configuration for corvid-agent.
 *
 * This file demonstrates how to configure an agent deployment using the
 * framework's configuration schema. It reads from environment variables
 * for secrets and deployment-specific values, providing a single source
 * of truth for the corvid-agent deployment.
 *
 * For a new agent, copy this file, change the agent identity section,
 * and adjust integrations as needed.
 */

import type { AgentDeploymentConfig } from './shared/types/agent-config';

/** Split a comma-separated env var into a trimmed string array. */
function csvList(key: string): string[] {
    return (process.env[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

const config: AgentDeploymentConfig = {
    // ── Agent Identity ──────────────────────────────────────────────────
    agent: {
        name: 'corvid-agent',
        description: 'AI agent framework with on-chain identity and messaging via AlgoChat on Algorand',
        defaultModel: process.env.DEFAULT_MODEL ?? 'claude-sonnet-4-20250514',
        defaultProvider: process.env.DEFAULT_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'ollama'),
    },

    // ── Server ──────────────────────────────────────────────────────────
    server: {
        port: parseInt(process.env.PORT ?? '3000', 10),
        bindHost: process.env.BIND_HOST ?? '127.0.0.1',
        apiKey: process.env.API_KEY,
        adminApiKey: process.env.ADMIN_API_KEY,
        logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'info',
        logFormat: (process.env.LOG_FORMAT as 'text' | 'json') ?? 'text',
        allowedOrigins: process.env.ALLOWED_ORIGINS,
        publicUrl: process.env.PUBLIC_URL,
        shutdownGraceMs: parseInt(process.env.SHUTDOWN_GRACE_MS ?? '30000', 10),
    },

    // ── Database ────────────────────────────────────────────────────────
    database: {
        path: process.env.DATABASE_PATH ?? './corvid-agent.db',
        backupDir: process.env.BACKUP_DIR,
        backupMaxKeep: process.env.BACKUP_MAX_KEEP ? parseInt(process.env.BACKUP_MAX_KEEP, 10) : 10,
    },

    // ── LLM Providers ──────────────────────────────────────────────────
    providers: {
        anthropic: process.env.ANTHROPIC_API_KEY
            ? { apiKey: process.env.ANTHROPIC_API_KEY }
            : undefined,
        ollama: {
            host: process.env.OLLAMA_HOST ?? 'http://localhost:11434',
            maxParallel: process.env.OLLAMA_MAX_PARALLEL ? parseInt(process.env.OLLAMA_MAX_PARALLEL, 10) : 1,
            numCtx: process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : 16384,
            numPredict: process.env.OLLAMA_NUM_PREDICT ? parseInt(process.env.OLLAMA_NUM_PREDICT, 10) : 2048,
            numGpu: process.env.OLLAMA_NUM_GPU ? parseInt(process.env.OLLAMA_NUM_GPU, 10) : -1,
        },
        enabledProviders: csvList('ENABLED_PROVIDERS').length > 0
            ? csvList('ENABLED_PROVIDERS')
            : process.env.ANTHROPIC_API_KEY ? ['anthropic', 'ollama'] : ['ollama'],
        councilModel: process.env.COUNCIL_MODEL,
    },

    // ── Work Pipeline ──────────────────────────────────────────────────
    work: {
        maxIterations: parseInt(process.env.WORK_MAX_ITERATIONS ?? '3', 10),
        maxPerDay: parseInt(process.env.WORK_TASK_MAX_PER_DAY ?? '100', 10),
        drainTimeoutMs: 300_000,
        worktreeBaseDir: process.env.WORKTREE_BASE_DIR,
        queue: {
            maxConcurrency: 2,
            pollIntervalMs: 5_000,
        },
    },

    // ── Scheduler ──────────────────────────────────────────────────────
    scheduler: {
        pollIntervalMs: 30_000,
        maxConcurrentExecutions: 2,
        minScheduleIntervalMs: 300_000,
    },

    // ── Process Manager ────────────────────────────────────────────────
    process: {
        maxTurnsBeforeContextReset: 8,
        inactivityTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS ?? '7200000', 10),
        sandbox: {
            enabled: process.env.SANDBOX_ENABLED === 'true',
        },
    },

    // ── Integrations ───────────────────────────────────────────────────
    integrations: {
        algochat: {
            enabled: Boolean(process.env.ALGOCHAT_MNEMONIC),
            mnemonic: process.env.ALGOCHAT_MNEMONIC,
            network: (process.env.ALGORAND_NETWORK as 'localnet' | 'testnet' | 'mainnet') ?? 'localnet',
            agentNetwork: process.env.AGENT_NETWORK as 'localnet' | 'testnet' | 'mainnet' | undefined,
            syncInterval: process.env.ALGOCHAT_SYNC_INTERVAL ? parseInt(process.env.ALGOCHAT_SYNC_INTERVAL, 10) : 30_000,
            ownerAddresses: csvList('ALGOCHAT_OWNER_ADDRESSES'),
            pskUri: process.env.ALGOCHAT_PSK_URI,
            defaultAgentId: process.env.ALGOCHAT_DEFAULT_AGENT_ID,
        },
        discord: {
            enabled: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID),
            botToken: process.env.DISCORD_BOT_TOKEN,
            channelId: process.env.DISCORD_CHANNEL_ID,
            allowedUserIds: csvList('DISCORD_ALLOWED_USER_IDS'),
            additionalChannelIds: csvList('DISCORD_ADDITIONAL_CHANNEL_IDS'),
            mode: process.env.DISCORD_BRIDGE_MODE as 'chat' | 'work_intake' | undefined,
            appId: process.env.DISCORD_APP_ID,
            guildId: process.env.DISCORD_GUILD_ID,
            botRoleId: process.env.DISCORD_BOT_ROLE_ID,
            publicMode: process.env.DISCORD_PUBLIC_MODE === 'true',
            defaultAgentId: process.env.DISCORD_DEFAULT_AGENT_ID,
        },
        telegram: {
            enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID,
            allowedUserIds: csvList('TELEGRAM_ALLOWED_USER_IDS'),
            mode: process.env.TELEGRAM_BRIDGE_MODE as 'chat' | 'work_intake' | undefined,
        },
        slack: {
            enabled: Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET),
            botToken: process.env.SLACK_BOT_TOKEN,
            signingSecret: process.env.SLACK_SIGNING_SECRET,
            channelId: process.env.SLACK_CHANNEL_ID,
            allowedUserIds: csvList('SLACK_ALLOWED_USER_IDS'),
        },
        github: {
            token: process.env.GH_TOKEN,
            webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
            notificationRepo: process.env.NOTIFICATION_GITHUB_REPO,
        },
    },

    // ── Observability ──────────────────────────────────────────────────
    observability: {
        otel: {
            endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
            serviceName: process.env.OTEL_SERVICE_NAME ?? 'corvid-agent',
        },
    },

    // ── Multi-Tenant ───────────────────────────────────────────────────
    multiTenant: process.env.MULTI_TENANT === 'true',
};

export default config;
