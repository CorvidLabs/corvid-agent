/**
 * Agent deployment configuration schema.
 *
 * Defines the shape of a complete agent deployment — identity, server settings,
 * database, LLM providers, integrations, and plugins. Any agent built on this
 * framework can be fully configured via this interface.
 *
 * @see {@link ../server/config/loader.ts} for loading and validation logic.
 */

// ── Agent Identity ──────────────────────────────────────────────────────────

/** Core identity and default behavior for the deployed agent. */
export interface AgentIdentityConfig {
    /** Human-readable agent name (e.g. 'corvid-agent'). */
    name: string;
    /** Optional description shown in health endpoints and directory listings. */
    description?: string;
    /** Default LLM model identifier (e.g. 'claude-sonnet-4-20250514'). */
    defaultModel: string;
    /** Default LLM provider name (e.g. 'anthropic'). */
    defaultProvider: string;
    /** Optional system prompt prepended to all agent sessions. */
    systemPrompt?: string;
}

// ── Server ──────────────────────────────────────────────────────────────────

/** HTTP server and authentication settings. */
export interface ServerConfig {
    /** Port to listen on. */
    port: number;
    /** Bind address (e.g. '127.0.0.1' or '0.0.0.0'). */
    bindHost: string;
    /** API key for HTTP/WS authentication. Required when bindHost is not localhost. */
    apiKey?: string;
    /** Separate admin API key for elevated operations. */
    adminApiKey?: string;
    /** Minimum log level. */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    /** Log output format. */
    logFormat?: 'text' | 'json';
    /** Comma-separated allowed CORS origins. */
    allowedOrigins?: string;
    /** Public URL for device auth flow callbacks. */
    publicUrl?: string;
    /** Graceful shutdown timeout in milliseconds. */
    shutdownGraceMs?: number;
}

// ── Database ────────────────────────────────────────────────────────────────

/** SQLite database configuration. */
export interface DatabaseConfig {
    /** Path to the SQLite database file. */
    path: string;
    /** Directory for database backup files. */
    backupDir?: string;
    /** Maximum number of backup files to keep before pruning. */
    backupMaxKeep?: number;
}

// ── LLM Providers ───────────────────────────────────────────────────────────

/** Anthropic provider configuration. */
export interface AnthropicProviderConfig {
    /** Anthropic API key (sk-ant-...). */
    apiKey: string;
}

/** Ollama local provider configuration. */
export interface OllamaProviderConfig {
    /** Ollama API host URL. */
    host: string;
    /** Default model to use when none is specified. Defaults to 'qwen3:14b'. */
    defaultModel?: string;
    /** Maximum concurrent Ollama requests. */
    maxParallel?: number;
    /** Context window size per request. */
    numCtx?: number;
    /** Max tokens to predict per response. */
    numPredict?: number;
    /** Number of GPU layers (-1 = all). */
    numGpu?: number;
    /** Batch size for prompt processing. */
    numBatch?: number;
    /** Request timeout in milliseconds. */
    requestTimeoutMs?: number;
}

/** LLM provider registry configuration. */
export interface ProvidersConfig {
    /** Anthropic provider settings (omit to disable). */
    anthropic?: AnthropicProviderConfig;
    /** Ollama provider settings (omit to disable). */
    ollama?: OllamaProviderConfig;
    /** Explicitly enabled provider names (e.g. ['anthropic'] or ['anthropic', 'ollama']). */
    enabledProviders: string[];
    /** Model override for council chairman/synthesis sessions. */
    councilModel?: string;
}

// ── Work Pipeline ───────────────────────────────────────────────────────────

/** Task queue sub-configuration. */
export interface QueueConfig {
    /** Maximum concurrent task executions. */
    maxConcurrency?: number;
    /** Polling interval for queued tasks in milliseconds. */
    pollIntervalMs?: number;
}

/** Work pipeline and task execution settings. */
export interface WorkConfig {
    /** Maximum validation iterations before marking a task as failed. */
    maxIterations?: number;
    /** Maximum work tasks an agent can create per day. */
    maxPerDay?: number;
    /** Timeout for draining running tasks on shutdown in milliseconds. */
    drainTimeoutMs?: number;
    /** Base directory for git worktrees. */
    worktreeBaseDir?: string;
    /** Task queue settings. */
    queue?: QueueConfig;
}

// ── Scheduler ───────────────────────────────────────────────────────────────

/** Scheduler service settings. */
export interface SchedulerConfig {
    /** Polling interval for scheduled actions in milliseconds. */
    pollIntervalMs?: number;
    /** Maximum concurrent schedule executions. */
    maxConcurrentExecutions?: number;
    /** Minimum interval between schedule runs in milliseconds. */
    minScheduleIntervalMs?: number;
}

// ── Process Manager ─────────────────────────────────────────────────────────

/** Sandbox sub-configuration. */
export interface SandboxConfig {
    /** Whether Docker container sandboxing is enabled. */
    enabled: boolean;
}

/** Process manager settings. */
export interface ProcessConfig {
    /** Max conversation turns before resetting context. */
    maxTurnsBeforeContextReset?: number;
    /** Agent session inactivity timeout in milliseconds. */
    inactivityTimeoutMs?: number;
    /** Container sandbox settings. */
    sandbox?: SandboxConfig;
}

// ── Integration Plugins ─────────────────────────────────────────────────────

/** AlgoChat on-chain messaging integration. */
export interface AlgoChatIntegrationConfig {
    /** Whether the AlgoChat bridge is enabled. */
    enabled: boolean;
    /** 25-word Algorand mnemonic for the agent wallet. */
    mnemonic?: string;
    /** Algorand network for the main wallet. */
    network?: 'localnet' | 'testnet' | 'mainnet';
    /** Network for agent sub-wallets (defaults to network). */
    agentNetwork?: 'localnet' | 'testnet' | 'mainnet';
    /** Polling interval for new AlgoChat messages in milliseconds. */
    syncInterval?: number;
    /** Algorand addresses authorized as owner (admin commands). */
    ownerAddresses?: string[];
    /** Pre-shared key URI for encrypted channels. */
    pskUri?: string;
    /** Default agent profile ID (UUID). */
    defaultAgentId?: string;
}

/** Discord bot integration. */
export interface DiscordIntegrationConfig {
    /** Whether the Discord bridge is enabled. */
    enabled: boolean;
    /** Discord bot token. */
    botToken?: string;
    /** Primary channel ID to listen in. */
    channelId?: string;
    /** Telegram-style user ID allowlist (empty = allow all with role). */
    allowedUserIds?: string[];
    /** Additional channel IDs to monitor. */
    additionalChannelIds?: string[];
    /** Bridge operating mode. */
    mode?: 'chat' | 'work_intake';
    /** Discord application ID. */
    appId?: string;
    /** Discord guild (server) ID. */
    guildId?: string;
    /** Bot role ID for permission checks. */
    botRoleId?: string;
    /** Whether the bot responds to all users (not just allowlisted). */
    publicMode?: boolean;
    /** Default agent ID for Discord sessions. */
    defaultAgentId?: string;
}

/** Telegram bot integration. */
export interface TelegramIntegrationConfig {
    /** Whether the Telegram bridge is enabled. */
    enabled: boolean;
    /** Telegram bot token. */
    botToken?: string;
    /** Primary chat ID for notifications. */
    chatId?: string;
    /** Allowed Telegram user IDs (empty = allow all). */
    allowedUserIds?: string[];
    /** Bridge operating mode. */
    mode?: 'chat' | 'work_intake';
}

/** Slack bot integration. */
export interface SlackIntegrationConfig {
    /** Whether the Slack bridge is enabled. */
    enabled: boolean;
    /** Slack bot OAuth token. */
    botToken?: string;
    /** Slack signing secret for request verification. */
    signingSecret?: string;
    /** Primary channel ID. */
    channelId?: string;
    /** Allowed Slack user IDs. */
    allowedUserIds?: string[];
}

/** GitHub integration for webhooks and work tasks. */
export interface GitHubIntegrationConfig {
    /** GitHub personal access token. */
    token?: string;
    /** Webhook secret for HMAC SHA-256 validation. */
    webhookSecret?: string;
    /** Repository for GitHub notification routing (e.g. 'CorvidLabs/corvid-agent'). */
    notificationRepo?: string;
}

/** All integration plugin configurations. */
export interface IntegrationsConfig {
    /** AlgoChat on-chain messaging. */
    algochat?: AlgoChatIntegrationConfig;
    /** Discord bot bridge. */
    discord?: DiscordIntegrationConfig;
    /** Telegram bot bridge. */
    telegram?: TelegramIntegrationConfig;
    /** Slack bot bridge. */
    slack?: SlackIntegrationConfig;
    /** GitHub webhooks and work tasks. */
    github?: GitHubIntegrationConfig;
}

// ── Observability ───────────────────────────────────────────────────────────

/** OpenTelemetry configuration. */
export interface OtelConfig {
    /** OTLP exporter endpoint URL. */
    endpoint?: string;
    /** Service name for traces. */
    serviceName?: string;
}

/** Observability and tracing settings. */
export interface ObservabilityConfig {
    /** OpenTelemetry settings. */
    otel?: OtelConfig;
}

// ── Custom Tools ────────────────────────────────────────────────────────────

/** Declaration for a custom MCP tool registered via config. */
export interface CustomToolDeclaration {
    /** Unique tool name. */
    name: string;
    /** Human-readable description. */
    description: string;
}

/** Tool plugin management configuration. */
export interface ToolsConfig {
    /** Custom tool declarations (handlers are registered programmatically). */
    custom?: CustomToolDeclaration[];
    /** Tool names to explicitly enable from defaults. */
    enabled?: string[];
    /** Tool names to explicitly disable from defaults. */
    disabled?: string[];
}

// ── Top-Level Config ────────────────────────────────────────────────────────

/**
 * Complete deployment configuration for an agent built on the framework.
 *
 * All sections except `agent`, `server`, `database`, and `providers` are
 * optional — the framework applies sensible defaults for omitted fields.
 *
 * @example
 * ```typescript
 * const config: AgentDeploymentConfig = {
 *   agent: { name: 'my-agent', defaultModel: 'claude-sonnet-4-20250514', defaultProvider: 'anthropic' },
 *   server: { port: 3000, bindHost: '127.0.0.1' },
 *   database: { path: './my-agent.db' },
 *   providers: { anthropic: { apiKey: 'sk-ant-...' }, enabledProviders: ['anthropic'] },
 * };
 * ```
 */
export interface AgentDeploymentConfig {
    /** Agent identity and default behavior. */
    agent: AgentIdentityConfig;
    /** HTTP server settings. */
    server: ServerConfig;
    /** SQLite database settings. */
    database: DatabaseConfig;
    /** LLM provider configuration. */
    providers: ProvidersConfig;
    /** Work pipeline and task execution settings. */
    work?: WorkConfig;
    /** Scheduler service settings. */
    scheduler?: SchedulerConfig;
    /** Process manager settings. */
    process?: ProcessConfig;
    /** Integration plugin configurations (all optional). */
    integrations?: IntegrationsConfig;
    /** Observability and tracing. */
    observability?: ObservabilityConfig;
    /** Whether multi-tenant isolation is enabled. */
    multiTenant?: boolean;
    /** Tool plugin management. */
    tools?: ToolsConfig;
}
