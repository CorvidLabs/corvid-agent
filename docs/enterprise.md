# Enterprise Guide

Deploying corvid-agent for organizations that need security, compliance, multi-team isolation, and production-grade infrastructure.

---

## Why enterprise teams choose corvid-agent

- **Self-hosted** — runs on your infrastructure, your code never leaves your network
- **Multi-tenant** — isolated environments for different teams, projects, or clients
- **RBAC** — owner, operator, and viewer roles per tenant
- **Audit trail** — every action logged, optionally recorded on-chain (Algorand)
- **Container sandboxing** — agent code execution in isolated Docker containers
- **API-first** — ~300 REST endpoints, OpenAPI spec, Swagger UI
- **Deployment flexibility** — Docker, Kubernetes (Helm + raw manifests), systemd, macOS LaunchAgent

---

## Quick evaluation

### Try it locally (5 minutes)

```bash
curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
```

This installs locally with zero configuration. Explore the dashboard, create an agent, run a session.

### Production deployment (30 minutes)

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
cp .env.example .env
# Configure .env (see below)
docker compose -f deploy/docker-compose.yml up -d
```

---

## Architecture overview

```
                    +--------------------------+
                    |   Angular 21 Dashboard   |
                    +------------+-------------+
                                 |
                            HTTP / WebSocket
                                 |
+--------------------------------+--------------------------------+
|                     Bun Server (port 3000)                      |
|                                                                 |
|  Process Manager | Council Engine | Scheduler | Work Tasks      |
|  Telegram Bridge | Discord Bridge | Slack     | Voice (TTS/STT) |
|  Workflow Engine | A2A Protocol   | MCP Tools | Sandbox         |
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                    SQLite (WAL mode)                       |  |
|  |  16 migrations | FTS5 search | 90+ tables | foreign keys  |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

Single binary, single database file, no external dependencies beyond the AI provider.

---

## Multi-tenant setup

Enable tenant isolation for multiple teams or clients:

```bash
# .env
MULTI_TENANT=true
API_KEY=your-admin-api-key
ANTHROPIC_API_KEY=sk-ant-...
```

### Tenant registration

```bash
curl -X POST https://corvid.yourcompany.com/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frontend Team",
    "slug": "frontend",
    "ownerEmail": "lead@yourcompany.com",
    "plan": "pro"
  }'
```

Returns a tenant-specific API key. All subsequent requests with that key are scoped to that tenant's data.

### What's isolated per tenant

- Agents, sessions, projects, work tasks
- Schedules and workflow executions
- Memory and conversation history
- API keys and RBAC roles

### Plans and limits

| Plan | Agents | Concurrent sessions | Features |
|------|--------|-------------------|----------|
| **free** | 2 | 1 | Basic tools |
| **starter** | 5 | 3 | + GitHub, schedules |
| **pro** | 20 | 10 | + councils, workflows, voice |
| **enterprise** | Unlimited | Unlimited | + custom limits, priority support |

### RBAC roles

| Role | Capabilities |
|------|-------------|
| **owner** | Full access, manage members, billing |
| **operator** | Create/manage agents, sessions, schedules, work tasks |
| **viewer** | Read-only access to dashboards and logs |

---

## Security

### Authentication

| Feature | Details |
|---------|---------|
| API key auth | Required when server is exposed beyond localhost |
| Admin API key | Separate key for elevated operations (backups, mode changes) |
| Key rotation | Zero-downtime rotation with 24-hour grace period |
| WebSocket auth | Bearer token header (preferred) or query parameter (deprecated) |

### Data protection

| Feature | Details |
|---------|---------|
| Wallet encryption | AES-256-GCM at rest |
| Protected files | `.env`, credentials, security files blocked from agent access |
| Bash validation | Commands validated before execution |
| Prompt injection detection | Built-in detection and blocking |
| Malicious code scanning | Diffs scanned before PR creation |
| Social engineering protection | Agent resists manipulation attempts |

### Network security

| Feature | Details |
|---------|---------|
| CORS | Explicit origin allowlists in production |
| Rate limiting | Per-IP, per-endpoint, auth-tier-based multipliers |
| TLS | Via reverse proxy (Nginx/Caddy configs included) |
| Non-root execution | Docker image runs as dedicated `corvid` user |

### Operational controls

| Feature | Details |
|---------|---------|
| Operational modes | `autonomous`, `supervised` (queue for approval), `paused` |
| Escalation queue | Pending approvals visible in dashboard and API |
| Spending limits | Daily ALGO caps for on-chain operations |
| Protected paths | Governance-annotated files require explicit approval |

---

## Deployment options

### Docker (recommended)

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Multi-stage build, non-root user, health checks included. Database persisted via named volume.

### Kubernetes

**Helm:**
```bash
helm install corvid-agent deploy/helm/corvid-agent \
  --set env.ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --set env.API_KEY=$API_KEY \
  --set env.MULTI_TENANT=true
```

**Raw manifests:**
```bash
kubectl apply -f deploy/k8s/
```

### systemd (bare metal)

```bash
sudo cp deploy/corvid-agent.service /etc/systemd/system/
sudo systemctl enable --now corvid-agent
```

### macOS LaunchAgent

```bash
cp deploy/com.corvidlabs.corvid-agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.corvidlabs.corvid-agent.plist
```

---

## Reverse proxy

Always use a reverse proxy with TLS in production. Configs are provided for both:

- `deploy/nginx/` — Nginx with WebSocket upgrade support
- `deploy/caddy/` — Caddy with automatic HTTPS

---

## Monitoring and health

### Health endpoints

```bash
# Liveness (is the process running?)
curl https://corvid.yourcompany.com/health/live

# Readiness (can it handle requests?)
curl https://corvid.yourcompany.com/health/ready
```

### OpenTelemetry

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.yourcompany.com:4318
OTEL_SERVICE_NAME=corvid-agent-prod
```

Traces export to any OTLP-compatible backend (Jaeger, Grafana Tempo, Datadog, etc.).

### Self-test

```bash
curl -X POST https://corvid.yourcompany.com/api/selftest/run \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scope": "all"}'
```

Runs built-in diagnostics to verify server health.

---

## Database management

### Backups

```bash
# Manual backup
curl -X POST https://corvid.yourcompany.com/api/backup \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# Automated (cron)
0 */6 * * * curl -s -X POST http://localhost:3000/api/backup \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

Configurable retention: `BACKUP_MAX_KEEP=10` (default).

### Restore

```bash
# Stop server
# Replace database file
cp backups/corvid-agent-TIMESTAMP.db corvid-agent.db
rm -f corvid-agent.db-wal corvid-agent.db-shm
# Restart server
```

### Migrations

Automatic on startup. No manual migration step required.

```bash
bun run migrate:status   # Check migration state
bun run migrate:up       # Apply pending (manual)
bun run migrate:down     # Roll back last (manual)
```

---

## Image verification

Docker images are signed with Cosign (keyless, Sigstore/Fulcio) and include SPDX SBOM attestations:

```bash
# Verify signature
cosign verify \
  --certificate-identity-regexp "https://github.com/CorvidLabs/corvid-agent" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/corvidlabs/corvid-agent:latest

# Verify and extract SBOM
cosign verify-attestation \
  --type spdxjson \
  --certificate-identity-regexp "https://github.com/CorvidLabs/corvid-agent" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/corvidlabs/corvid-agent:latest
```

---

## API access

- **REST API:** ~236 endpoints across 55 route modules
- **OpenAPI spec:** `GET /api/openapi.json`
- **Swagger UI:** `GET /api/docs`
- **WebSocket:** Real-time streaming for sessions and events
- **A2A Protocol:** Google Agent-to-Agent interoperability

---

## On-chain audit trail (optional)

For organizations that need immutable, tamper-proof records:

```bash
ALGOCHAT_MNEMONIC=your 25 word mnemonic
ALGORAND_NETWORK=mainnet
```

Agent decisions, council deliberations, and inter-agent messages are recorded as Algorand transactions — verifiable by anyone, deletable by no one.

---

## Next steps

- **[Self-Hosting Guide](self-hosting.md)** — Detailed deployment instructions
- **[Configuration](configuration.md)** — All environment variables
- **[Security Model](../SECURITY.md)** — Full security documentation
- **[API Reference](api-reference.md)** — Complete endpoint documentation
- **[Business Guide](business-guide.md)** — Non-technical team setup guide
