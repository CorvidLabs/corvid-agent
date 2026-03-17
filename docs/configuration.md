# Configuration Reference

All configuration is done via environment variables in a `.env` file at the project root. Bun loads `.env` automatically — no extra packages needed.

```bash
cp .env.example .env
```

Or run `corvid-agent init` for guided setup.

For the annotated source, see [.env.example](../.env.example).

---

## Table of Contents

- [Minimal Configuration](#minimal-configuration)
- [AI Provider](#ai-provider)
- [Server](#server)
- [Logging](#logging)
- [Algorand / AlgoChat](#algorand--algochat)
- [Localnet URL Overrides](#localnet-url-overrides)
- [Wallet Security](#wallet-security)
- [Spending Limits](#spending-limits)
- [Rate Limiting](#rate-limiting)
- [Agent Sessions](#agent-sessions)
- [Ollama](#ollama)
- [Multi-Model Provider Routing](#multi-model-provider-routing)
- [Council Model Override](#council-model-override)
- [GitHub Integration](#github-integration)
- [Work Tasks](#work-tasks)
- [Web Search](#web-search)
- [Notifications](#notifications)
- [Telegram Bridge](#telegram-bridge)
- [Discord Bridge](#discord-bridge)
- [Voice](#voice)
- [Billing](#billing)
- [Observability](#observability)
- [Sandbox](#sandbox)
- [Multi-Tenant](#multi-tenant)
- [Database Backups](#database-backups)
- [Directory Browsing Security](#directory-browsing-security)
- [MCP Stdio Mode](#mcp-stdio-mode)

---

## Minimal Configuration

To get started, you only need one AI provider. Everything else has sensible defaults.

**Claude API (recommended):**

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Claude Code CLI (uses your existing subscription):**

No environment variables needed — if the `claude` CLI is on your PATH, corvid-agent uses it automatically.

**Local only (Ollama):**

```bash
ENABLED_PROVIDERS=ollama
```

---

## AI Provider

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models | — | No (one provider needed) |

When no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set, the system auto-restricts to Ollama and validates connectivity on startup. If Claude Code CLI is installed (`claude` on PATH), it is used automatically without an API key.

---

## Server

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3000` | No |
| `BIND_HOST` | Bind address. `127.0.0.1` = localhost only (safe default). Set to `0.0.0.0` for Docker/VM — requires `API_KEY`. | `127.0.0.1` | No |
| `API_KEY` | API key for HTTP/WS authentication. Required when `BIND_HOST` is not localhost. | — | Conditional |
| `ADMIN_API_KEY` | Separate API key for elevated admin operations. | — | No |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins. | `*` on localhost | No |
| `PUBLIC_URL` | Public URL for device auth flow callbacks. | — | No |

---

## Logging

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error` | `info` | No |
| `LOG_FORMAT` | Output format: `text` (human-readable) or `json` (structured) | `text` | No |

---

## Algorand / AlgoChat

On-chain identity and messaging via Algorand. Optional for local development.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ALGOCHAT_MNEMONIC` | 25-word Algorand mnemonic for the agent's wallet | — | No |
| `ALGORAND_NETWORK` | Network: `localnet`, `testnet`, `mainnet` | `localnet` | No |
| `AGENT_NETWORK` | Network for agent sub-wallets | Value of `ALGORAND_NETWORK` | No |
| `ALGOCHAT_SYNC_INTERVAL` | Polling interval for new messages (ms) | `30000` | No |
| `ALGOCHAT_DEFAULT_AGENT_ID` | Default agent profile ID (UUID). Auto-created if blank. | — | No |
| `ALGOCHAT_PSK_URI` | Pre-shared key URI for encrypted channels | — | No |
| `ALGOCHAT_OWNER_ADDRESSES` | Comma-separated Algorand addresses authorized as owner | — | No |
| `ALGORAND_INDEXER_URL` | Indexer URL for on-chain reputation verification | `https://mainnet-idx.algonode.cloud` | No |

---

## Localnet URL Overrides

For Docker/container deployments where localhost points to the container, not the host.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LOCALNET_ALGOD_URL` | Algod URL for localnet | `http://localhost:4001` | No |
| `LOCALNET_KMD_URL` | KMD URL for localnet | `http://localhost:4002` | No |
| `LOCALNET_INDEXER_URL` | Indexer URL for localnet | `http://localhost:8980` | No |

On Docker Desktop (macOS/Windows), use `http://host.docker.internal:<port>`. On Linux Docker, add `--add-host=host.docker.internal:host-gateway` to your run command.

---

## Wallet Security

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WALLET_ENCRYPTION_KEY` | AES-256 encryption key for agent sub-wallets at rest | Derived from `ALGOCHAT_MNEMONIC` on localnet | Conditional |
| `WALLET_KEYSTORE_PATH` | Path to the wallet keystore file | `./wallet-keystore.json` | No |

`WALLET_ENCRYPTION_KEY` is required on testnet/mainnet if `ALGOCHAT_MNEMONIC` is set.

---

## Spending Limits

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DAILY_ALGO_LIMIT_MICRO` | Daily ALGO spending cap in microALGOs | `10000000` (10 ALGO) | No |

---

## Rate Limiting

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RATE_LIMIT_GET` | Global per-IP GET requests per minute | `600` | No |
| `RATE_LIMIT_MUTATION` | Global per-IP mutation requests per minute | `60` | No |

Per-endpoint rate limiting is enabled by default. Different auth tiers receive different limits:

| Tier | Reads | Mutations |
|------|-------|-----------|
| Public | `RATE_LIMIT_GET / 2` | `RATE_LIMIT_MUTATION / 2` |
| User | `RATE_LIMIT_GET` | `RATE_LIMIT_MUTATION` |
| Admin | `RATE_LIMIT_GET * 2` | `RATE_LIMIT_MUTATION * 2` |

Exempt paths: `/api/health`, `/webhooks/github`, `/ws`, `/.well-known/agent-card.json`.

All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

---

## Agent Sessions

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AGENT_TIMEOUT_MS` | Session timeout in milliseconds | `1800000` (30 min) | No |

---

## Ollama

Local LLM provider. Only needed if using Ollama.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OLLAMA_HOST` | Ollama API URL | `http://localhost:11434` | No |
| `OLLAMA_MAX_PARALLEL` | Max concurrent requests | `1` | No |
| `OLLAMA_NUM_CTX` | Context window size per request | `16384` | No |
| `OLLAMA_NUM_PREDICT` | Max tokens to predict per response | `2048` | No |
| `OLLAMA_NUM_GPU` | Number of GPU layers (`-1` = all) | `-1` | No |
| `OLLAMA_NUM_BATCH` | Batch size for prompt processing | `512` | No |
| `OLLAMA_REQUEST_TIMEOUT` | Request timeout in ms | `1800000` (30 min) | No |

---

## Multi-Model Provider Routing

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENABLED_PROVIDERS` | Comma-separated list: `anthropic`, `ollama` | Auto-detected from available keys | No |

Set `ENABLED_PROVIDERS=ollama` for 100% local mode.

---

## Council Model Override

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `COUNCIL_MODEL` | Model for council chairman/synthesis (e.g. `qwen3:32b`) | Same as agent model | No |

Only applies to council sessions with `councilRole=chairman`.

---

## GitHub Integration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GH_TOKEN` | GitHub token for work tasks, PRs, webhooks, and mention polling | — | No |
| `GITHUB_WEBHOOK_SECRET` | HMAC SHA-256 secret for validating incoming webhook payloads | — | No |

The `GH_TOKEN` needs the `repo` scope for PR creation and webhook operations.

---

## Work Tasks

Self-improvement workflow configuration.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WORKTREE_BASE_DIR` | Base directory for git worktrees | Sibling `.corvid-worktrees` directory | No |
| `WORK_MAX_ITERATIONS` | Max validation iterations before marking a task as failed | `3` | No |
| `WORK_TASK_MAX_PER_DAY` | Max work tasks an agent can create per day | `100` | No |

---

## Web Search

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BRAVE_SEARCH_API_KEY` | Brave Search API key for `corvid_web_search` and `corvid_deep_research` tools | — | No |

---

## Notifications

All notification channels are optional. Agents can override global settings via the `corvid_configure_notifications` tool.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DISCORD_WEBHOOK_URL` | Discord webhook URL for notifications | — | No |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (shared with Telegram bridge) | — | No |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications | — | No |
| `NOTIFICATION_GITHUB_REPO` | GitHub repo for issue-based notifications | — | No |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp access token | — | No |
| `SIGNAL_API_URL` | Signal messenger API URL (requires signal-cli-rest-api) | — | No |
| `SIGNAL_SENDER_NUMBER` | Signal sender phone number | — | No |

---

## Telegram Bridge

Bidirectional bridge for talking to agents from Telegram.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (shared with notifications) | — | No |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated Telegram numeric user IDs (empty = allow all) | — | No |

---

## Discord Bridge

Bidirectional bridge for talking to agents from Discord.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DISCORD_BOT_TOKEN` | Discord bot token (requires MESSAGE_CONTENT intent) | — | No |
| `DISCORD_CHANNEL_ID` | Discord channel ID to listen in | — | No |

---

## Voice

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API key for TTS/STT in Telegram voice notes | — | No |

---

## Billing

Optional Stripe integration.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key | — | No |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | — | No |

---

## Observability

Optional OpenTelemetry tracing.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint for trace export | — (tracing disabled) | No |
| `OTEL_SERVICE_NAME` | Service name for traces | `corvid-agent` | No |

---

## Sandbox

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SANDBOX_ENABLED` | Enable Docker container sandboxing for agent execution | `false` | No |

---

## Multi-Tenant

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MULTI_TENANT` | Enable multi-tenant isolation and billing | `false` | No |

When enabled:

- `POST /api/tenants/register` becomes available (public, no auth)
- Each tenant gets isolated agents, sessions, projects, and work tasks
- API keys are mapped to tenants via the `api_keys` table
- Tenant members get RBAC roles (owner, operator, viewer)
- Plan-based limits are enforced (agent count, session count, etc.)

When false (default): single-tenant mode, all data uses `tenant_id='default'`.

---

## Database Backups

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BACKUP_DIR` | Directory for database backup files | `./backups` | No |
| `BACKUP_MAX_KEEP` | Maximum number of backup files to keep | `10` | No |

---

## Directory Browsing Security

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ALLOWED_BROWSE_ROOTS` | Comma-separated additional directories the `/api/browse-dirs` endpoint may serve | Home directory + registered project dirs | No |

---

## MCP Stdio Mode

Only needed when running corvid-agent as an MCP stdio server for external clients.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORVID_AGENT_ID` | Agent ID for MCP stdio mode | — | No |
| `CORVID_API_URL` | API URL for MCP stdio mode | `http://localhost:3000` | No |

Set up MCP integration with `corvid-agent init --mcp`.
