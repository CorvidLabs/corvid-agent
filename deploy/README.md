# Deployment Configs (Optional)

These are **optional** deployment configs for running CorvidAgent as a background service. Most users just run `bun server/index.ts` or `bun run dev` directly.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Docker container for isolated deployment |
| `docker-compose.yml` | Docker Compose orchestration |
| `corvid-agent.service` | systemd unit file (Linux) |
| `daemon.sh` | Generic daemon launcher script |
| `com.corvidlabs.corvid-agent.plist` | macOS launchd plist |
| `corvid-agent.newsyslog.conf` | macOS log rotation |

## When to use these

- Running CorvidAgent on a server that stays on 24/7
- Running as a background daemon on your dev machine
- Deploying in a Docker container for isolation

For local development, just use `bun run dev`.
