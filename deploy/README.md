# Deployment Configs

Optional configs for running corvid-agent as a production service. For local development, just use `bun run dev`.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Docker build (Angular client + Bun server) |
| `docker-compose.yml` | Docker Compose orchestration with health checks and persistent volume |
| `daemon.sh` | Cross-platform daemon installer (auto-detects launchd/systemd) |
| `corvid-agent.service` | systemd unit file (Linux) with security hardening |
| `com.corvidlabs.corvid-agent.plist` | macOS launchd plist |
| `corvid-agent.newsyslog.conf` | macOS log rotation |
| `caddy/Caddyfile` | Caddy reverse proxy with auto-TLS |
| `nginx/corvid-agent.conf` | nginx reverse proxy with rate limiting |
| `k8s/` | Raw Kubernetes manifests (StatefulSet, Service, Ingress, ConfigMap, Secret) |
| `helm/` | Helm chart for production Kubernetes deployments |

## Quick Start

### Docker (simplest)

```bash
cp .env.example .env   # add your API keys
docker compose up -d   # uses root-level docker-compose.yml
```

Or from inside `deploy/`:

```bash
cp ../.env.example ../.env
docker compose up -d   # uses deploy/docker-compose.yml (adds resource limits)
```

> **Data persistence**: Both compose files set `DATABASE_PATH=/app/data/corvid-agent.db` and
> `WALLET_KEYSTORE_PATH=/app/data/wallet-keystore.json`, mounting a Docker volume at `/app/data`.
> Your database and wallet keystore survive container restarts and upgrades.

### Running Inside Containers (with Algorand localnet)

When corvid-agent runs inside Docker, `localhost` resolves to the container — not the host where AlgoKit localnet is running. You need to tell the container how to reach the host's localnet services.

**Docker Desktop (macOS / Windows)** — `host.docker.internal` works automatically:

```bash
# In your .env or docker-compose override:
LOCALNET_ALGOD_URL=http://host.docker.internal:4001
LOCALNET_KMD_URL=http://host.docker.internal:4002
LOCALNET_INDEXER_URL=http://host.docker.internal:8980
```

**Linux Docker** — add the host gateway mapping (already included in `docker-compose.yml`):

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Then set the same `LOCALNET_*` env vars as above.

**Steps:**

1. Start AlgoKit localnet on the **host** machine:
   ```bash
   algokit localnet start
   ```
2. Set the `LOCALNET_*` env vars in your `.env` (or pass them via `docker-compose.yml`).
3. Start the container:
   ```bash
   cd deploy && docker compose up -d
   ```
4. The health check (`/api/health`) confirms connectivity.

> **Tip:** Running `./setup.sh` inside a container auto-detects the environment and sets the `LOCALNET_*` overrides for you. It also warns that AlgoKit localnet must run on the host (Docker-in-Docker is not supported by the setup script).

### Daemon (bare metal)

```bash
# Auto-detects macOS (launchd) or Linux (systemd)
./deploy/daemon.sh install
./deploy/daemon.sh status
./deploy/daemon.sh logs
```

### Reverse Proxy (production TLS)

For production, bind the server to localhost and terminate TLS at the proxy:

1. Set `BIND_HOST=127.0.0.1` in your `.env` or docker-compose override
2. Choose your proxy:

**Caddy** (auto-TLS via Let's Encrypt):
```bash
# Edit deploy/caddy/Caddyfile — replace "yourdomain.com" with your domain
sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

**nginx** (manual TLS via certbot):
```bash
# Edit deploy/nginx/corvid-agent.conf — replace "yourdomain.com"
sudo cp deploy/nginx/corvid-agent.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/corvid-agent.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

### Remote Access via Tailscale (recommended)

Tailscale is the simplest way to access your corvid-agent dashboard remotely without exposing it to the public internet. It provides network-layer authentication — only your enrolled devices can reach the server, and your existing `API_KEY` auth stays in place as a second layer.

**Setup (5 minutes):**

1. Install Tailscale on the server machine and on your client device(s):
   ```bash
   # Server (Linux)
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up

   # macOS
   brew install tailscale && sudo tailscale up
   ```

2. Set `BIND_HOST=0.0.0.0` in your `.env` so the server listens on all interfaces:
   ```bash
   BIND_HOST=0.0.0.0
   API_KEY=your-strong-api-key   # required when not on localhost
   ```

3. Find your Tailscale IP:
   ```bash
   tailscale ip -4   # e.g. 100.x.x.x
   ```

4. Access the dashboard from any enrolled device:
   ```
   http://100.x.x.x:3000
   ```

**Optional — HTTPS on the Tailscale interface:**

Caddy can terminate TLS for the Tailscale IP using a self-signed cert (no DNS required):

```bash
caddy reverse-proxy --from https://100.x.x.x:443 --to http://localhost:3000
```

Or add the Tailscale IP to your `Caddyfile` alongside your domain.

> **Security:** Tailscale handles device authentication. Even if `BIND_HOST=0.0.0.0`, non-Tailscale traffic from the LAN/internet cannot reach the Tailscale IP. The `API_KEY` provides a second layer. Do not set `BIND_HOST=0.0.0.0` without also setting `API_KEY`.

## Cloud Deployment

Three one-file configs in the repo root let you deploy to managed platforms:

| Platform | File | Notes |
|---|---|---|
| [Railway](https://railway.app) | `railway.toml` | Add a volume at `/app/data` for persistence |
| [Fly.io](https://fly.io) | `fly.toml` | Includes persistent volume at `/data`; run `fly volumes create corvid_data` first |
| [Render](https://render.com) | `render.yaml` | Includes a 5 GB disk mounted at `/data` |

### Railway

```bash
railway login
railway init          # link or create project
railway volume add    # mount at /app/data (5 GB+)
railway secrets set ANTHROPIC_API_KEY=sk-ant-... API_KEY=$(openssl rand -hex 32)
railway up
```

### Fly.io

```bash
fly auth login
fly apps create corvid-agent
fly volumes create corvid_data --size 5 --region iad
fly secrets set ANTHROPIC_API_KEY=sk-ant-... API_KEY=$(openssl rand -hex 32)
fly deploy
```

### Render

Connect your GitHub repo in the Render dashboard and select **New → Web Service → Deploy with render.yaml**.
Add `ANTHROPIC_API_KEY` and `API_KEY` as environment secrets in the Render UI.

> **Note on Algorand / AlgoChat**: Cloud deployments cannot run AlgoKit localnet (no Docker-in-Docker).
> Set `ALGORAND_NETWORK=testnet` or `mainnet` and provide an `ALGOCHAT_MNEMONIC` if you need on-chain
> agent features. For pure AI agent workflows without on-chain messaging, localnet can be omitted.

## Security Notes

- The systemd unit runs with `NoNewPrivileges`, `ProtectSystem=strict`, and `PrivateTmp`
- Secrets go in `/etc/corvid-agent/env` (mode 600, root-owned) on Linux
- Docker runs as non-root user `corvid` inside the container
- nginx config includes rate limiting (30 req/s, burst 50) with health check exemption
- Both proxy configs add `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers
