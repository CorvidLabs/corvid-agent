# Incident Response Runbook

This document describes how to detect, respond to, and recover from corvid-agent server incidents.

## Detection

Incidents are detected through three mechanisms:

1. **GitHub Actions heartbeat** — pings `/api/health` every 5 minutes; creates a `P0` issue on failure
2. **Internal HealthMonitorService** — runs every 5 minutes; sends notifications (AlgoChat, GitHub, etc.) on status transitions
3. **Manual** — operator notices service degradation or unresponsiveness

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P0 | Server down, health endpoint unreachable | Immediate |
| P1 | Health endpoint returns `unhealthy` (e.g., DB failure) | Within 30 min |
| P2 | Health endpoint returns `degraded` (e.g., GitHub API down) | Within 4 hours |
| P3 | Individual schedule failures or non-critical service degradation | Next business day |

## Step 1: Assess the Situation

```bash
# Check if the server process is running
pgrep -f "bun.*server" || echo "Server process NOT running"

# Check health endpoint directly
curl -s http://localhost:3000/api/health | jq .

# Check server logs (last 100 lines)
tail -100 /var/log/corvid-agent/server.log

# Check disk space
df -h .

# Check memory usage
free -h  # Linux
vm_stat  # macOS
```

## Step 2: Restart the Server

If the server process is not running or is unresponsive:

```bash
# Stop any zombie processes
pkill -f "bun.*server" 2>/dev/null

# Start the server
cd /path/to/corvid-agent
bun run start

# Verify it's running
sleep 5
curl -s http://localhost:3000/api/health | jq .status
# Expected: "healthy"
```

## Step 3: Database Recovery

If the database is corrupted or inaccessible:

```bash
# Check database file integrity
sqlite3 corvid-agent.db "PRAGMA integrity_check;"

# If integrity check fails, restore from backup
cp corvid-agent.db corvid-agent.db.broken
cp backups/corvid-agent.db.latest corvid-agent.db

# Run pending migrations after restore
bun run migrate:up

# Verify database health
curl -s http://localhost:3000/api/health | jq .dependencies.database
```

### Creating Backups

Backups should be taken regularly. The backup endpoint:

```bash
# Trigger a backup via API
curl -X POST http://localhost:3000/api/backup \
  -H "X-API-Key: $API_KEY"
```

## Step 4: Verify All Services

After restart, confirm all services are operational:

```bash
# Full health check
curl -s http://localhost:3000/api/health | jq .

# Check scheduler is running
curl -s http://localhost:3000/api/scheduler/health | jq .

# Check health history for recent outage window
curl -s "http://localhost:3000/api/health/history?hours=4" | jq .uptime

# Check for any failed schedule executions during the outage
curl -s http://localhost:3000/api/schedules | jq '.[] | select(.status == "paused")'
```

## Step 5: Replay Missed Schedules

If schedules were missed during downtime:

```bash
# List schedules that may have been missed (paused due to failures)
curl -s http://localhost:3000/api/schedules | jq '.[] | select(.status == "paused") | {id, name, lastRunAt}'

# Re-activate a paused schedule
curl -X PATCH "http://localhost:3000/api/schedules/$SCHEDULE_ID" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"status": "active"}'

# Manually trigger a schedule to run now
curl -X POST "http://localhost:3000/api/schedules/$SCHEDULE_ID/trigger" \
  -H "X-API-Key: $API_KEY"
```

## Step 6: Close the Incident

1. Verify the P0 incident issue on GitHub and close it with a resolution comment
2. Check health history to confirm sustained recovery: `GET /api/health/history?hours=1`
3. Document root cause and any follow-up actions needed

## External Service Outages

When external services (Anthropic, GitHub) are down, the server should remain `degraded` rather than `unhealthy`. The scheduler has graceful degradation for external dependencies:

- **Anthropic API down**: Agent sessions requiring LLM will fail gracefully; schedules skip with `dependency_unavailable` status
- **GitHub API down**: GitHub operations (star, fork, PR review) will fail; schedules skip with `dependency_unavailable` status
- **Algorand/AlgoChat down**: On-chain notifications will fail silently; core functionality continues

## Health History & Uptime

Check uptime statistics:

```bash
# Last 24 hours
curl -s "http://localhost:3000/api/health/history?hours=24" | jq .uptime

# Last 7 days
curl -s "http://localhost:3000/api/health/history?hours=168" | jq .uptime

# Last 30 days
curl -s "http://localhost:3000/api/health/history?hours=720" | jq .uptime
```

The `uptimePercent` field shows the percentage of health checks that returned `healthy` or `degraded` (both count as "up"). Only `unhealthy` checks count against uptime.

## Environment Variables

Key configuration for health monitoring:

| Variable | Description | Default |
|----------|-------------|---------|
| `HEALTH_URL` | (GH Actions secret) Full URL to the health endpoint | — |
| `LOG_LEVEL` | Server log verbosity | `info` |
| `SHUTDOWN_GRACE_MS` | Graceful shutdown timeout | `30000` |
