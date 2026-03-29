# Production Deployment

Deploy corvid-agent reliably for teams and automated workloads. Covers Docker Compose, systemd, environment hardening, and a go-live checklist.

---

## Option A: Docker Compose (recommended)

The simplest production setup. Runs the server, database, and optional reverse proxy in containers.

### 1. Clone and configure

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git /opt/corvid-agent
cd /opt/corvid-agent
cp .env.example .env
```

Edit `.env` for production:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
GH_TOKEN=ghp_...
API_KEY=your-long-random-api-key-here    # For remote access

# Server
NODE_ENV=production
BIND_ADDRESS=0.0.0.0
PORT=3000

# Database (persists in named volume)
DB_PATH=/data/corvid-agent.db

# Security
CORS_ORIGIN=https://your-domain.com     # Restrict CORS in production
SESSION_SECRET=another-random-secret

# Notifications
DISCORD_BOT_TOKEN=...                   # Optional
DISCORD_CHANNEL_IDS=...                 # Optional
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

Expected output:
```
[+] Running 3/3
 ✔ Network corvid-agent_default  Created
 ✔ Volume corvid-agent_data      Created
 ✔ Container corvid-agent        Started
```

### 3. Verify it's running

```bash
docker compose ps
```

```
NAME            IMAGE                   STATUS          PORTS
corvid-agent    corvid-agent:latest     Up 2 minutes    0.0.0.0:3000->3000/tcp
```

```bash
curl http://localhost:3000/api/health
```

Expected:
```json
{"status":"ok","version":"0.59.0","uptime":120,"agents":1}
```

### 4. Set up automatic restarts

Docker Compose already handles this via `restart: unless-stopped` in `docker-compose.yml`. To restart after system reboots, enable Docker's autostart:

```bash
sudo systemctl enable docker
```

### 5. Update procedure

```bash
cd /opt/corvid-agent
git pull
docker compose up -d --build
```

Zero-downtime is not guaranteed — plan for a ~10-second restart window.

---

## Option B: systemd (bare-metal / VPS)

For running directly on the host without Docker.

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install corvid-agent

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git /opt/corvid-agent
cd /opt/corvid-agent
bun install --production
bun run build
```

### 3. Create a systemd service

```bash
sudo nano /etc/systemd/system/corvid-agent.service
```

Paste:

```ini
[Unit]
Description=corvid-agent AI developer platform
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=corvid-agent
Group=corvid-agent
WorkingDirectory=/opt/corvid-agent
EnvironmentFile=/opt/corvid-agent/.env
ExecStart=/home/corvid-agent/.bun/bin/bun run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/opt/corvid-agent /var/lib/corvid-agent
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

### 4. Create a dedicated user

```bash
sudo useradd -r -s /sbin/nologin corvid-agent
sudo chown -R corvid-agent:corvid-agent /opt/corvid-agent
```

### 5. Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable corvid-agent
sudo systemctl start corvid-agent
sudo systemctl status corvid-agent
```

Expected output:
```
● corvid-agent.service - corvid-agent AI developer platform
     Loaded: loaded (/etc/systemd/system/corvid-agent.service; enabled)
     Active: active (running) since Mon 2026-03-29 10:00:00 UTC; 5s ago
   Main PID: 12345 (bun)
```

### 6. View logs

```bash
sudo journalctl -u corvid-agent -f
```

---

## Reverse proxy with nginx

Put nginx in front to handle TLS termination and domain routing.

```nginx
# /etc/nginx/sites-available/corvid-agent
server {
    listen 443 ssl http2;
    server_name agent.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/agent.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agent.your-domain.com/privkey.pem;

    # WebSocket support (needed for live session output)
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name agent.your-domain.com;
    return 301 https://$host$request_uri;
}
```

Get a free TLS certificate:
```bash
sudo certbot --nginx -d agent.your-domain.com
```

---

## Database backups

corvid-agent uses SQLite. Back it up regularly:

```bash
# One-time backup
corvid-agent db backup --dest /backups/corvid-agent-$(date +%Y%m%d).db

# Or use the API
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/admin/backup \
  --output /backups/corvid-agent-$(date +%Y%m%d).db
```

Automate with cron:
```cron
0 3 * * * /opt/corvid-agent/scripts/backup.sh >> /var/log/corvid-agent-backup.log 2>&1
```

---

## Go-live checklist

Run through this before opening your deployment to users.

### Security
- [ ] `API_KEY` is set to a long random string (not the example value)
- [ ] `SESSION_SECRET` is set and different from `API_KEY`
- [ ] `CORS_ORIGIN` is set to your specific domain (not `*`)
- [ ] TLS is configured (HTTPS only, no HTTP in production)
- [ ] GitHub token has minimum required scopes (`repo`, `read:org`)
- [ ] Discord bot permissions are scoped to specific channels
- [ ] `NODE_ENV=production` is set

### Reliability
- [ ] `restart: unless-stopped` (Docker) or `Restart=always` (systemd) is configured
- [ ] Docker autostart enabled: `sudo systemctl enable docker`
- [ ] Health check passing: `curl https://your-domain/api/health`
- [ ] Database backup job is configured and tested
- [ ] At least 2GB RAM available (4GB recommended for parallel agents)

### Monitoring
- [ ] Log aggregation set up (journald, CloudWatch, Datadog, etc.)
- [ ] Health endpoint is being monitored (e.g. UptimeRobot)
- [ ] Discord/Telegram alert channel configured for critical errors

### Capacity
- [ ] `MAX_CONCURRENT_TASKS` matches your server capacity (default: 3)
- [ ] `AGENT_DAILY_ALGO_CAP` is set to prevent runaway spending
- [ ] Credit limits configured for multi-user deployments

---

## Scaling

corvid-agent is designed for a single-server deployment with SQLite. If you need to scale beyond one server:

- Run multiple instances, each with a **separate** database (do not share SQLite across processes)
- Use a load balancer with **sticky sessions** (WebSocket sessions must stay on one instance)
- Consider upgrading to PostgreSQL support (community plugin — check the GitHub issues)

For most teams (up to ~50 users), a single well-resourced server is sufficient.

---

## What's next?

- [Hardening guide](../hardening-guide.md) — firewall rules, audit logging, secrets management
- [Enterprise deployment](../enterprise.md) — multi-tenant, RBAC, SSO
- [Self-hosting guide](../self-hosting.md) — detailed hosting provider walkthroughs
- [Monitoring & health trends](../how-it-works.md) — built-in observability
