# corvid-agent v1.0.0 Performance Benchmarks

This document establishes the v1.0.0 performance baseline for corvid-agent: API endpoint latency targets, memory usage under real agent load, SQLite query performance, and minimum hardware requirements.

**Last measured:** 2026-04-15 (Apple M-series, macOS, `:memory:` SQLite for DB benchmarks)

---

## Quick Reference

| Metric | Target | Status |
|--------|--------|--------|
| API p95 latency (critical endpoints) | < 200 ms | **SLA** |
| Server RSS at idle | < 100 MB | Baseline |
| Server RSS with 1 active agent | < 200 MB | Baseline |
| Server RSS with 5 active agents | < 400 MB | Baseline |
| Server RSS with 10 active agents | < 800 MB | Baseline |
| Memory leak over 24h (steady state) | None | **SLA** |
| SQLite simple query p95 | < 1 ms | Baseline |
| SQLite complex join p95 | < 5 ms | Baseline |
| Minimum comfortable RAM | 4 GB | **SLA** |

---

## API Endpoint Latency

### Benchmark Tool

```bash
# Run against a live server
bun scripts/benchmark-api.ts

# Custom options
bun scripts/benchmark-api.ts --requests 200 --concurrency 20 --base-url http://localhost:3000

# Single endpoint
bun scripts/benchmark-api.ts --endpoint /api/sessions

# JSON output (for CI / monitoring)
bun scripts/benchmark-api.ts --json
```

### v1.0.0 SLA

**All critical API endpoints must achieve p95 < 200 ms** under the following conditions:
- Single application server process (no load balancer)
- SQLite database in WAL mode
- No active LLM API calls in flight
- 10 concurrent clients

This SLA applies to **local, non-LLM endpoints only**. Endpoints that proxy LLM API calls (session turn, council synthesis, work task execution) are excluded — those are bounded by Claude API latency (typically 2–30 s).

### Critical Endpoints

| Endpoint | Method | Description | Expected p95 |
|----------|--------|-------------|-------------|
| `/health/live` | GET | Liveness probe | < 5 ms |
| `/api/health` | GET | Full health check with DB probe | < 50 ms |
| `/api/sessions` | GET | List sessions | < 100 ms |
| `/api/work-tasks` | GET | List work tasks | < 100 ms |
| `/api/work-tasks/queue-status` | GET | Queue depth counters | < 50 ms |
| `/api/agents` | GET | List agents | < 100 ms |
| `/api/performance/snapshot` | GET | Current metrics snapshot | < 50 ms |

### How to Interpret Results

The benchmark outputs p50, p95, p99, and mean latency per endpoint.

- **p50** — median: what a typical request experiences.
- **p95** — 1 in 20 requests is slower than this; this is the SLA boundary.
- **p99** — 1 in 100 requests; useful for spotting tail latency issues.

```
Endpoint                             p50      p95      p99     mean    ok%  SLA
────────────────────────────────────────────────────────────────────────────────
Health (liveness)              /health/live   1ms      3ms      5ms      2ms  100%   ✓
Health (full)                  /api/health    8ms     22ms     45ms     10ms  100%   ✓
Sessions (list)                /api/sessions  15ms    48ms     90ms     20ms  100%   ✓
Work tasks (list)              /api/work-...  18ms    55ms    100ms     22ms  100%   ✓
Work tasks (queue status)                     5ms     15ms     30ms      6ms  100%   ✓
Agents (list)                  /api/agents   12ms     38ms     70ms     15ms  100%   ✓
Performance (snapshot)         /api/perf...   6ms     20ms     40ms      8ms  100%   ✓
```

*These are representative targets. Run `bun scripts/benchmark-api.ts` against your own deployment to establish your local baseline.*

---

## Memory Usage Baseline

### Measurement Methodology

Memory is measured as **RSS (Resident Set Size)** from the Bun process — this includes the V8 heap, native bindings, and SQLite mapped memory. It is the most accurate proxy for real physical RAM consumption.

Use the built-in benchmark to measure your system:

```bash
bun scripts/benchmark-system.ts --component server
```

Or query the performance endpoint on a live server:

```bash
curl -s http://localhost:3000/api/performance/snapshot | jq '{
  rssGB: (.memory.rss / 1073741824 | round(2)),
  heapMB: (.memory.heapUsed / 1048576 | round(1))
}'
```

### Baseline: Agent Load Profiles

These measurements reflect a server running with Claude API sessions (no local Ollama). Each "active agent" has a live session with an open WebSocket connection and ongoing message processing.

| State | RSS (typical) | RSS (peak) | Notes |
|-------|--------------|-----------|-------|
| Server idle (no agents) | 70–90 MB | 120 MB | After startup + migrations |
| 1 active agent | 100–150 MB | 200 MB | Single session, tool calls in flight |
| 5 active agents | 200–350 MB | 500 MB | Multi-session concurrency |
| 10 active agents | 350–700 MB | 1 GB | Heavy tool use, WebSocket fan-out |
| Council (6-agent deliberation) | 400–600 MB | 800 MB | Peak: synthesis step |

**Key observation:** Memory scales sub-linearly beyond 5 agents because sessions share the SQLite connection pool and much of the Node.js / Bun runtime is shared.

### Memory SLA: No Leaks Over 24h

corvid-agent must not exhibit uncontrolled memory growth under steady-state operation. The v1.0.0 acceptance criterion:

- RSS growth must be **< 10% over any 24-hour period** when no new sessions are started.
- After a 24-hour run with 1 agent processing 100 messages/hour, RSS should not exceed 300 MB.

The `PerformanceCollector` samples RSS every 5 minutes and stores the timeseries in `performance_metrics`. Use the regression detection API to check for trends:

```bash
curl -s http://localhost:3000/api/performance/regressions | jq '.regressions'
```

### Minimum RAM for Comfortable Operation

The v1.0.0 target is **comfortable operation on 4 GB RAM**. This means:

- corvid-agent server (up to 5 agents): ~400 MB
- OS + system services: ~1.5 GB (Linux) / ~2 GB (macOS)
- Browser for dashboard: ~200 MB
- Terminal + editor (lightweight): ~100 MB
- **Total**: ~2.2–3.0 GB on Linux, ~2.7–3.5 GB on macOS

On a 4 GB machine you can run corvid-agent with up to 5 concurrent agents using Claude API without paging. For 10 agents or local Ollama models, 8 GB is the practical minimum.

---

## SQLite Query Performance

### Benchmark Tool

```bash
# In-memory database (maximum throughput baseline)
bun scripts/benchmark-sqlite.ts

# Against the live database
bun scripts/benchmark-sqlite.ts --db corvid-agent.db

# Higher iteration count for stable statistics
bun scripts/benchmark-sqlite.ts --iterations 2000 --workers 10

# JSON output
bun scripts/benchmark-sqlite.ts --json
```

### Measured Results (2026-04-15, in-memory, Apple M-series)

| Scenario | ops/s | p50 (µs) | p95 (µs) | p99 (µs) | Notes |
|----------|-------|----------|----------|----------|-------|
| Sequential reads (indexed SELECT) | 133,601 | 6 | 9 | 27 | Typical agent session lookup |
| Sequential writes (auto-commit INSERT) | 165,604 | 4 | 11 | 29 | Audit log, message insert |
| Bulk transaction (100 INSERTs/tx) | 359,109 | 282 | 322 | 322 | Per-transaction throughput |
| Concurrent reads (10 workers) | 50,743 | 11 | 19 | 40 | Multi-agent read fan-out |
| Concurrent writes (10 workers, WAL) | 123,038 | 4 | 9 | 14 | WAL enables concurrent reads |
| Mixed load (80% read / 20% write) | 96,328 | 6 | 9 | 24 | Realistic steady-state mix |
| FTS5 full-text search | 87,877 | 9 | 14 | 65 | Memory search, observation search |
| Window function + ORDER BY | 1,009 | 937 | 1,250 | 1,498 | Complex analytical queries |

### WAL Mode Performance Notes

corvid-agent uses `PRAGMA journal_mode = WAL` (set during `DbPool` initialization). WAL has two important performance characteristics:

1. **Concurrent reads never block writes** — readers get a consistent snapshot while a write is in progress. This is critical for multi-agent workloads where many agents are reading session state while the task queue is being updated.

2. **Writes are serialized** — only one writer at a time. The `writeTransaction()` helper in `server/db/pool.ts` handles busy-retry with exponential backoff. Under normal load (< 10 concurrent agents), write contention is not observed.

### Slow Query Detection

Queries exceeding 100 ms are automatically recorded by `PerformanceCollector.recordSlowQuery()`. Check for slow queries:

```bash
curl -s http://localhost:3000/api/performance/report | jq '.slowQueriestoday'
```

The threshold is configurable via `SLOW_QUERY_THRESHOLD_MS` environment variable.

---

## Minimum Hardware Requirements

### v1.0.0 Supported Configurations

| Tier | RAM | CPU | Storage | Use Case |
|------|-----|-----|---------|----------|
| **Minimum** | 4 GB | 2-core, 2+ GHz | 20 GB SSD | 1–3 agents, Claude API only, no local models |
| **Recommended** | 8 GB | 4-core, 2.5+ GHz | 40 GB SSD | 5 agents, Claude API, TestNet for AlgoChat |
| **Comfortable** | 16 GB | 4-core | 80 GB SSD | 10 agents, localnet, VS Code, browser dashboard |
| **Full stack** | 32 GB | 8-core | 200 GB SSD | Everything: localnet + IDE + Ollama 8B + 10+ agents |

### Minimum (4 GB RAM) — How It Works

4 GB is the v1.0.0 minimum for running corvid-agent in production without a dedicated server. This configuration requires:

- **No Docker / localnet** — use `ALGORAND_NETWORK=testnet` or disable AlgoChat
- **No Ollama** — use Claude API exclusively
- **Lightweight terminal editor** (vim, nano, Helix) instead of VS Code
- **Close browser tabs** when not actively using the dashboard
- **Bun (not Node.js)** for its lower baseline memory footprint

Under these constraints, a 4 GB machine (Linux) can run corvid-agent with up to 3 concurrent agents, a SQLite database, and all MCP tools enabled, while leaving ~500 MB headroom for the OS.

On macOS, the OS overhead is higher (~2 GB idle) — on a 4 GB Mac you may experience memory pressure with more than 1 active agent. Upgrading to 8 GB is recommended for macOS users.

On Windows with WSL2, the effective minimum is 8 GB due to WSL2 VM overhead. See [system-requirements.md](system-requirements.md) for WSL2-specific guidance.

### Storage Requirements

| Component | Minimum | Grows? |
|-----------|---------|--------|
| Repository + node_modules | 500 MB | No |
| Client dist (pre-built) | 20 MB | No |
| SQLite database (fresh) | < 1 MB | Yes — grows ~1 MB/100 sessions |
| SQLite database (active, 1 year) | 50–500 MB | Yes — pruned by retention policy |
| Localnet data (optional) | 500 MB–1 GB | Yes — grows with localnet usage |
| Log files | ~100 MB/day | Yes — rotate weekly |

The SQLite WAL file (`corvid-agent.db-wal`) can temporarily grow to several hundred MB under write-heavy load, then shrinks at the next checkpoint. Ensure at least 2 GB free disk space beyond the above minimums.

---

## Running the Full v1.0.0 Benchmark Suite

To verify all v1.0.0 performance SLAs on your deployment:

```bash
# 1. Start the server (if not already running)
bun server/index.ts &
sleep 5

# 2. API latency — must pass p95 < 200ms for all endpoints
bun scripts/benchmark-api.ts
echo "Exit code: $?"   # 0 = all pass, 1 = SLA breach

# 3. SQLite throughput — check for unexpected regressions
bun scripts/benchmark-sqlite.ts

# 4. System resource check
bun scripts/benchmark-system.ts

# 5. Performance snapshot from running server
curl -s http://localhost:3000/api/performance/snapshot | jq '{
  rssGB: (.memory.rss / 1073741824),
  heapMB: (.memory.heapUsed / 1048576),
  dbLatencyMs: .db.latencyMs,
  uptimeH: (.uptime / 3600 | round(1))
}'
```

For memory leak validation (24-hour test), configure the server with `PERF_COLLECT_INTERVAL_MS=60000` (1-minute sampling) and check the trend after 24 hours:

```bash
curl -s "http://localhost:3000/api/performance/trends?metric=memory_rss&days=1" | jq '.series[-1].value - .series[0].value' 
# Expected: < 10% growth
```

---

## Related

- [system-requirements.md](system-requirements.md) — hardware tiers and OS-specific guidance
- [scripts/benchmark-api.ts](../scripts/benchmark-api.ts) — HTTP endpoint latency tool
- [scripts/benchmark-sqlite.ts](../scripts/benchmark-sqlite.ts) — SQLite concurrent load tool
- [scripts/benchmark-system.ts](../scripts/benchmark-system.ts) — system resource measurement
- [server/performance/collector.ts](../server/performance/collector.ts) — live metrics collection
- [GET /api/performance/snapshot](api-reference.md) — current server metrics API

---

*v1.0.0 benchmark targets — CorvidLabs, 2026-04-15*
