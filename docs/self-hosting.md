# Self-Hosting Guide

This guide covers deploying corvid-agent on your own infrastructure. corvid-agent is a Bun-based server with an Angular client, backed by SQLite. It runs as a single binary with no external database dependencies.

## Prerequisites

- **Bun** v1.3.8+ (runtime for the server)
- **Node.js 18+** (only required if building the Angular client from source)
- **Git** (for cloning the repository and work task worktrees)

Install Bun if you have not already:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Quick Start

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
cp .env.example .env
# Edit .env with your API keys and configuration
bun install
bun run build:client
bun run start
```

The server starts on `http://localhost:3000` by default.

## Environment Variables

All configuration is done through environment variables. Bun loads `.env` automatically -- no dotenv package is needed. Copy the example file and customize it:

```bash
cp .env.example .env
```

The most important variables are documented below. See `.env.example` for the full list with inline comments.

### Core Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `BIND_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` for Docker/VM deployments (requires `API_KEY`) |
| `API_KEY` | (none) | API key for HTTP/WS authentication. Auto-generated on first non-localhost start |
| `ADMIN_API_KEY` | (none) | Separate key for elevated admin operations |
| `ALLOWED_ORIGINS` | `*` on localhost | Comma-separated CORS origins |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `text` | Log format: `text` (human-readable) or `json` (structured) |

### AI Providers

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | (none) | OpenAI API key (used for voice TTS/STT) |
| `ENABLED_PROVIDERS` | `anthropic,ollama` | Comma-separated list. Use `ollama` for 100% local mode |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |

### Multi-Tenant

| Variable | Default | Description |
|---|---|---|
| `MULTI_TENANT` | `false` | Enable multi-tenant isolation and billing |

### Database Backups

| Variable | Default | Description |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Directory for database backup files |
| `BACKUP_MAX_KEEP` | `10` | Maximum backup files to retain (oldest are pruned) |

## Single-Tenant Mode

Single-tenant mode is the default. No special configuration is required -- leave `MULTI_TENANT` unset or set it to `false`. In this mode:

- All resources (agents, sessions, projects, work tasks) belong to a single implicit tenant with ID `default`.
- No tenant registration endpoint is available.
- Authentication uses the global `API_KEY` if set.
- There are no plan-based limits on agent or session counts.

This is the recommended mode for personal or team deployments where you do not need tenant isolation.

```bash
# .env -- single-tenant (default)
# MULTI_TENANT=false   # or simply omit this line
API_KEY=your-secret-key
ANTHROPIC_API_KEY=sk-ant-...
```

## Multi-Tenant Mode

Set `MULTI_TENANT=true` to enable tenant isolation. This activates:

- **Tenant registration** via `POST /api/tenants/register` (public, no auth required).
- **Per-tenant isolation** -- each tenant's agents, sessions, projects, and work tasks are scoped by `tenant_id`.
- **API key to tenant mapping** -- each registered tenant receives a unique API key that maps to their tenant ID via the `api_keys` table.
- **RBAC** -- tenant members have roles: `owner`, `operator`, `viewer`.
- **Plan-based limits** -- agent count, concurrent session count, storage, and feature flags are enforced per plan (`free`, `starter`, `pro`, `enterprise`).
- **Billing integration** -- optional Stripe integration for paid plans (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).

```bash
# .env -- multi-tenant
MULTI_TENANT=true
API_KEY=your-admin-api-key
ANTHROPIC_API_KEY=sk-ant-...
# Optional Stripe billing
# STRIPE_SECRET_KEY=sk_...
# STRIPE_WEBHOOK_SECRET=whsec_...
```

Tenants register themselves and receive an API key in the response:

```bash
curl -X POST https://your-corvid-instance.example.com/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "ownerEmail": "admin@acme.com",
    "plan": "starter"
  }'
```

The response includes the tenant object and an API key. All subsequent requests from that tenant must include `Authorization: Bearer <apiKey>`.

## Docker Deployment

The repository includes a multi-stage Dockerfile and a Docker Compose configuration in `deploy/`.

### Using Docker Compose

From the repository root:

```bash
docker compose -f deploy/docker-compose.yml up -d
```

This builds the image (compiling the Angular client in stage 1, then assembling the production image in stage 2) and starts the server on port 3000.

The compose file mounts a named volume (`db-data`) at `/app/data` for database persistence.

### Environment Variables in Docker

Pass environment variables through your shell or a `.env` file. The compose file forwards key variables:

```bash
# Export variables before running compose, or set them in .env
export ANTHROPIC_API_KEY=sk-ant-...
export API_KEY=your-secret-key
export LOG_LEVEL=info
export ALGORAND_NETWORK=testnet

docker compose -f deploy/docker-compose.yml up -d
```

### Dockerfile Details

The Dockerfile at `deploy/Dockerfile` uses two stages:

1. **client-build** -- installs client dependencies and builds the Angular app with `bun run build`.
2. **production** -- installs server dependencies (production only), copies server source, shared types, and the built client. Runs as a non-root `corvid` user.

Key defaults baked into the image:

- `PORT=3000`
- `BIND_HOST=0.0.0.0` (all interfaces -- use a reverse proxy with TLS in production)
- `NODE_ENV=production`
- Healthcheck on `/health/live` every 30 seconds

### Reverse Proxy

When `BIND_HOST=0.0.0.0`, the API is exposed on all interfaces. In production, always place the server behind a reverse proxy with TLS. The `deploy/` directory includes configurations for both Nginx and Caddy:

- `deploy/nginx/` -- Nginx reverse proxy configuration
- `deploy/caddy/` -- Caddy reverse proxy configuration (automatic HTTPS)

### Localnet Docker Networking

If you run an Algorand localnet on the host machine while corvid-agent runs inside Docker, the container cannot reach `localhost` on the host. Use:

```bash
LOCALNET_ALGOD_URL=http://host.docker.internal:4001
LOCALNET_KMD_URL=http://host.docker.internal:4002
LOCALNET_INDEXER_URL=http://host.docker.internal:8980
```

The compose file includes `extra_hosts: ["host.docker.internal:host-gateway"]` for Linux compatibility.

## Database Backup and Restore

corvid-agent uses SQLite with WAL mode. The backup system performs a WAL checkpoint (flushing pending writes) before copying the database file.

### Creating a Backup

Trigger a backup via the API:

```bash
curl -X POST https://your-corvid-instance.example.com/api/backup \
  -H "Authorization: Bearer $API_KEY"
```

Response:

```json
{
  "path": "./backups/corvid-agent-2026-02-28T12-00-00-000Z.db",
  "timestamp": "2026-02-28T12:00:00.000Z",
  "sizeBytes": 4194304,
  "pruned": 0
}
```

### Backup Configuration

| Variable | Default | Description |
|---|---|---|
| `BACKUP_DIR` | `./backups` | Directory where backup files are stored |
| `BACKUP_MAX_KEEP` | `10` | Maximum number of backup files to keep. After each backup, the oldest files beyond this count are automatically pruned. |

### Restoring from Backup

To restore, stop the server and replace the database file:

```bash
# Stop the server
# (Ctrl-C, systemctl stop corvid-agent, or docker compose down)

# Replace the database
cp backups/corvid-agent-2026-02-28T12-00-00-000Z.db corvid-agent.db

# Remove WAL/SHM files (they are stale after restore)
rm -f corvid-agent.db-wal corvid-agent.db-shm

# Restart the server
bun run start
```

### Automated Backups

You can schedule backups with cron:

```bash
# Backup every 6 hours
0 */6 * * * curl -s -X POST http://localhost:3000/api/backup -H "Authorization: Bearer $API_KEY" >> /var/log/corvid-backup.log 2>&1
```

## Security

### API Key Authentication

When `API_KEY` is set, all non-public routes require `Authorization: Bearer <key>`.

If `BIND_HOST` is not `127.0.0.1` and no `API_KEY` is configured, the server auto-generates a key on first start, prints it to stdout, and persists it to `.env`. This prevents accidental exposure.

Public routes that bypass authentication:

- `/api/health` -- health checks for monitoring
- `/.well-known/agent-card.json` -- A2A agent card discovery
- `/api/tenants/register` -- tenant registration (multi-tenant mode only)

### Admin API Key

Set `ADMIN_API_KEY` for elevated operations that should be restricted beyond normal API access. This is a separate key from `API_KEY` and is intended for administrative endpoints.

### API Key Rotation

The server supports zero-downtime key rotation with a 24-hour grace period. During rotation, both the old and new keys are accepted until the grace period expires.

### CORS

CORS is configured via `ALLOWED_ORIGINS`:

- **Localhost mode** (no `API_KEY`): all origins are allowed (`*`).
- **Production** (with `API_KEY`): set `ALLOWED_ORIGINS` to your specific domains.

```bash
ALLOWED_ORIGINS=https://dashboard.example.com,https://admin.example.com
```

When specific origins are configured, only matching request origins receive CORS headers. Non-matching origins are rejected by the browser.

### WebSocket Authentication

WebSocket connections authenticate via:

1. `Authorization: Bearer <key>` header (standard path)
2. `?key=<key>` query parameter (for browsers that cannot set headers on WebSocket upgrade)

### Rate Limiting

Rate limiting is enabled by default with configurable thresholds:

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_GET` | `600` | Max GET requests per minute per IP |
| `RATE_LIMIT_MUTATION` | `60` | Max mutation requests per minute per IP |

Per-endpoint rate limiting is also active with auth-tier-based multipliers:

- **Public (unauthenticated)**: base limits / 2
- **User (authenticated)**: base limits
- **Admin**: base limits * 2

All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Health, webhook, and WebSocket endpoints are exempt.

### Non-Root Execution

The Docker image creates a dedicated `corvid` system user and runs the server as non-root.

## Upgrading

1. Pull the latest code:

```bash
git pull origin main
```

2. Install updated dependencies:

```bash
bun install
```

3. Rebuild the client (if applicable):

```bash
bun run build:client
```

4. Restart the server:

```bash
bun run start
```

Database migrations run automatically on startup. There is no separate migration step required. You can check migration status at any time:

```bash
bun run migrate:status
```

If you need to manually run or roll back migrations:

```bash
bun run migrate:up      # Apply pending migrations
bun run migrate:down    # Roll back the last migration
```

### Docker Upgrades

For Docker deployments, rebuild the image:

```bash
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

### Pre-Upgrade Backup

Always create a database backup before upgrading:

```bash
curl -X POST http://localhost:3000/api/backup \
  -H "Authorization: Bearer $API_KEY"
```

## Additional Deployment Options

The `deploy/` directory contains configurations for several deployment methods:

- `deploy/docker-compose.yml` -- Docker Compose
- `deploy/Dockerfile` -- Multi-stage Docker build
- `deploy/corvid-agent.service` -- systemd service unit
- `deploy/com.corvidlabs.corvid-agent.plist` -- macOS LaunchAgent
- `deploy/helm/` -- Helm chart for Kubernetes
- `deploy/k8s/` -- Raw Kubernetes manifests
- `deploy/nginx/` -- Nginx reverse proxy config
- `deploy/caddy/` -- Caddy reverse proxy config

## Health Checks

The server exposes health endpoints for monitoring and orchestration:

```bash
# Liveness probe (is the process running?)
curl http://localhost:3000/health/live

# Readiness probe (is the server ready to handle requests?)
curl http://localhost:3000/health/ready
```

Both return HTTP 200 when healthy. The Docker healthcheck uses `/health/live` with a 30-second interval.
