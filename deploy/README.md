# Deployment Configs

Optional configs for running CorvidAgent as a production service. For local development, just use `bun run dev`.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Docker build (Angular client + Bun server) |
| `docker-compose.yml` | Docker Compose orchestration with health checks |
| `daemon.sh` | Cross-platform daemon installer (auto-detects launchd/systemd) |
| `corvid-agent.service` | systemd unit file (Linux) with security hardening |
| `com.corvidlabs.corvid-agent.plist` | macOS launchd plist |
| `corvid-agent.newsyslog.conf` | macOS log rotation |
| `caddy/Caddyfile` | Caddy reverse proxy with auto-TLS |
| `nginx/corvid-agent.conf` | nginx reverse proxy with rate limiting |

## Quick Start

### Docker (simplest)

```bash
cp .env.example .env   # add your API keys
cd deploy
docker compose up -d
```

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

## Security Notes

- The systemd unit runs with `NoNewPrivileges`, `ProtectSystem=strict`, and `PrivateTmp`
- Secrets go in `/etc/corvid-agent/env` (mode 600, root-owned) on Linux
- Docker runs as non-root user `corvid` inside the container
- nginx config includes rate limiting (30 req/s, burst 50) with health check exemption
- Both proxy configs add `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers
