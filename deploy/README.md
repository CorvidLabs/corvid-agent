# Deployment Configs

Production and local-service deployment configs. For local development use `bun run dev` instead.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build (Angular client + Bun server) |
| `docker-compose.yml` | corvid-agent service (connects to Algorand localnet on the host) |
| `.env.example` | Environment variable template — copy to `.env` before running |
| `daemon.sh` | Cross-platform daemon installer (auto-detects launchd/systemd) |
| `corvid-agent.service` | systemd unit (Linux) with security hardening |
| `com.corvidlabs.corvid-agent.plist` | macOS launchd plist |
| `caddy/Caddyfile` | Caddy reverse proxy (auto-TLS) |
| `nginx/corvid-agent.conf` | nginx reverse proxy with rate limiting |

## Docker Quick Start

### Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine + Compose v2 (Linux)
- An Anthropic API key from https://console.anthropic.com/settings/keys
- Ollama installed on the host if using local models: https://ollama.com
- Algorand localnet running separately (e.g. AlgoKit sandbox or another Docker container)

### 1. Configure environment

```bash
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`. Required fields:
- `API_KEY` — any strong random string (`openssl rand -base64 32`)

For Claude models, choose one:
- **Option A — Anthropic API key**: set `ANTHROPIC_API_KEY` (from console.anthropic.com)
- **Option B — Claude Code login**: leave `ANTHROPIC_API_KEY` blank; after starting the container run `docker exec -it corvid-agent claude login` (see below)
- **Option C — Ollama only**: set `ENABLED_PROVIDERS=ollama`, no API key needed

Optional but recommended before first run:
- `ALGOCHAT_MNEMONIC` — 25-word Algorand mnemonic (see "Algorand wallet" below)

### 2. Start corvid-agent

```bash
cd deploy
docker compose up -d
```

First run builds the app image — allow ~1 minute.

### 3. Open the dashboard

```bash
docker compose ps          # Should show "healthy"
docker compose logs -f corvid-agent
```

Open the dashboard and authenticate (choose one):

**Option A — URL parameter (bookmark-friendly):**
```
http://localhost:3000/?apiKey=YOUR_API_KEY
```
The key is read on load, stripped from the URL, and held in memory for the session.
Closing the tab or refreshing without the `?apiKey=` parameter requires re-authenticating.

**Option B — in-app form:**
Open `http://localhost:3000` — a login overlay appears. Enter the key and click **Authenticate**.
This navigates to the URL form above automatically.

> The dashboard shows a full-screen overlay and disables the sidebar/navbar until authenticated.
> No API calls are made before you log in, so there are no error notifications.

## Algorand Localnet

Algorand localnet runs in its own Docker container (or via AlgoKit) on the host machine.
corvid-agent reaches it via `host.docker.internal` which resolves to the host on both
macOS Docker Desktop and Linux (the `extra_hosts` mapping in `docker-compose.yml` handles Linux).

Default ports (override via `.env` if your localnet uses different ports):

| Service | Default URL | Override env var |
|---------|-------------|-----------------|
| algod | `http://host.docker.internal:4001` | `LOCALNET_ALGOD_URL` |
| KMD | `http://host.docker.internal:4002` | `LOCALNET_KMD_URL` |
| indexer | `http://host.docker.internal:8980` | `LOCALNET_INDEXER_URL` |

## Claude Code Login (no API key)

The Docker image includes the `claude` CLI. If you have a Claude Pro/Max subscription and don't want to manage a separate API key:

```bash
docker compose up -d
docker exec -it corvid-agent claude login
```

Follow the prompts — it will print a URL to open in your host browser. After you authorise in the browser, paste the code back into the terminal. Credentials are stored in `/home/corvid/.claude/` inside the container and survive `docker compose restart` but are lost on `docker compose down`. Just run `claude login` again after a fresh start.

> **Note**: `ANTHROPIC_API_KEY` takes precedence if set. Leave it blank (or remove it) in `.env` to use CLI auth.

> **Limitation**: A small number of server-side features (council synthesis, work-task internal completions) call the Anthropic SDK directly and still need `ANTHROPIC_API_KEY`. Core agent chat and all MCP tools work without it.

## Algorand Wallet Setup

On localnet with no `ALGOCHAT_MNEMONIC` set, a new wallet is generated each restart and auto-funded (100 ALGO) from the KMD dispenser. The wallet is not persisted between container replacements (only restarts).

**Recommended**: generate a mnemonic before first run and set it in `.env`:

```bash
# Using algokit (install from https://github.com/algorandfoundation/algokit-cli):
algokit generate mnemonic

# Then in deploy/.env:
ALGOCHAT_MNEMONIC=word1 word2 ... word25
```

The wallet address and 100 ALGO funding happen automatically on localnet. For mainnet, fund the address manually.

## Using Ollama Models

1. Install Ollama: https://ollama.com and start it on your host machine
2. Pull a model: `ollama pull qwen3:8b`
3. In `deploy/.env`:
   ```
   ENABLED_PROVIDERS=anthropic,ollama
   ```
   `OLLAMA_HOST` defaults to `http://host.docker.internal:11434` which works on macOS Docker Desktop.
   On Linux, `host.docker.internal` is mapped via `extra_hosts` in the compose file.
4. When creating agents in the UI, set the model to e.g. `qwen3:8b`, `llama3.1:8b`, etc.

For fully local operation (no Anthropic key):
```
ENABLED_PROVIDERS=ollama
```

## Data Volumes

All persistent data is in a named Docker volume:

| Volume | Contents |
|--------|----------|
| `corvid-data` → `/app/data` | SQLite DB (`corvid-agent.db`) + wallet keystore |

Inspect:
```bash
docker run --rm -v deploy_corvid-data:/data alpine ls -la /data
```

## Stopping / Cleanup

```bash
docker compose down              # Stop, keep volume
docker compose down -v           # Stop + delete all data (DESTRUCTIVE)
docker compose restart corvid-agent
```

## Daemon (Bare Metal)

```bash
./deploy/daemon.sh install   # macOS → launchd, Linux → systemd
./deploy/daemon.sh status
./deploy/daemon.sh logs
./deploy/daemon.sh uninstall
```

## Production TLS

Set `BIND_HOST=127.0.0.1` and front with a reverse proxy:

**Caddy** (auto-TLS):
```bash
# Edit deploy/caddy/Caddyfile — replace "yourdomain.com"
sudo cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

**nginx** (manual TLS):
```bash
sudo cp deploy/nginx/corvid-agent.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/corvid-agent.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -t && sudo systemctl reload nginx
```

## Notes

- **Volume rename**: `db-data` → `corvid-data`. Existing `db-data` volume data won't transfer automatically.
- The systemd unit runs with `NoNewPrivileges`, `ProtectSystem=strict`, and `PrivateTmp`
- Docker runs as non-root user `corvid` inside the container
- nginx config includes rate limiting (30 req/s, burst 50) with health check exemption
