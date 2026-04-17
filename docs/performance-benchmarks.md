# Performance Benchmarks — v1.0.0

Measured baselines, SLA targets, and minimum hardware requirements for corvid-agent v1.0.0.

## SLA Targets

| Metric | SLA Target | Notes |
|--------|-----------|-------|
| API p95 latency | ≤ 200 ms | Health, sessions, work-tasks, agents, performance endpoints |
| API p99 latency | ≤ 500 ms | All read endpoints under normal concurrency |
| SQLite sequential reads | ≥ 10,000 ops/s | Single-connection, WAL mode |
| SQLite sequential writes | ≥ 500 ops/s | Per-transaction commits in WAL mode |
| SQLite bulk insert (1,000 rows) | ≤ 50 ms | Single BEGIN/COMMIT transaction |
| FTS5 search query | ≤ 5 ms p95 | Porter stemmer, 2-term queries |
| Window function query | ≤ 10 ms p95 | ROW_NUMBER + RANK + running SUM, 100-row result |
| Server startup time | ≤ 5 s | Cold start, empty database |
| Memory at idle | ≤ 150 MB RSS | Server process, no active sessions |
| Memory under load | ≤ 500 MB RSS | During work-task execution with tool calls |

## Measured Baselines (Reference Hardware)

All measurements taken on reference hardware (see below) with:
- SQLite WAL mode, `synchronous = NORMAL`, 8 MB page cache
- No active agent sessions (idle server)
- Single-process server (not distributed)
- macOS 14 (Sonoma), Apple M2 Pro, 16 GB unified memory

### API Endpoint Latency

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) |
|----------|----------|----------|----------|
| `GET /health/live` | < 1 | < 2 | < 5 |
| `GET /health/ready` | < 1 | < 2 | < 5 |
| `GET /api/health` | < 2 | < 5 | < 10 |
| `GET /api/sessions` | < 5 | < 15 | < 30 |
| `GET /api/work-tasks` | < 5 | < 15 | < 30 |
| `GET /api/work-tasks/queue-status` | < 3 | < 10 | < 20 |
| `GET /api/agents` | < 5 | < 15 | < 30 |
| `GET /api/performance/snapshot` | < 5 | < 20 | < 40 |

Measured at concurrency=10, 100 requests per endpoint.

### SQLite Throughput

| Suite | Ops/s | p50 (ms) | p95 (ms) | p99 (ms) |
|-------|-------|----------|----------|----------|
| Sequential reads (PK lookup) | ~50,000 | 0.01 | 0.05 | 0.10 |
| Sequential writes (per-txn) | ~2,000 | 0.30 | 0.80 | 1.50 |
| Bulk insert (1,000 rows/txn) | ~500,000 row/s | — | — | — (single txn) |
| Concurrent reads (4 readers) | ~40,000 | 0.02 | 0.08 | 0.15 |
| Concurrent writes (4-row batch) | ~5,000 | 0.60 | 1.20 | 2.00 |
| Mixed load (2:1 read/write) | ~15,000 | 0.05 | 0.50 | 1.00 |
| FTS5 search (2-term, porter) | ~8,000 | 0.10 | 0.30 | 0.60 |
| Window functions (100-row result) | ~3,000 | 0.25 | 0.70 | 1.20 |

Numbers are approximate; actual values depend on database size and system load.

## Running the Benchmarks

### API Benchmark

Requires a running corvid-agent server (`bun server/index.ts`).

```bash
# Full benchmark against local server
bun scripts/benchmark-api.ts

# CI mode: exits non-zero if any p95 > 200ms, outputs JSON
bun scripts/benchmark-api.ts --json

# Tune concurrency and iterations
bun scripts/benchmark-api.ts --concurrency 20 --iterations 200

# Custom p95 threshold (100ms)
bun scripts/benchmark-api.ts --p95-threshold 100

# Benchmark only health endpoints
bun scripts/benchmark-api.ts --endpoint health

# Against a remote server
bun scripts/benchmark-api.ts --url https://your-server.example.com
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--url` | `http://localhost:3000` | Base URL of the corvid-agent server |
| `--concurrency` | `10` | Concurrent requests per endpoint |
| `--iterations` | `100` | Total requests per endpoint |
| `--p95-threshold` | `200` | Fail (exit 1) if any p95 exceeds this value (ms) |
| `--json` | off | Emit JSON report to stdout |
| `--endpoint` | all | Run only the named endpoint group |

Endpoint groups: `health`, `sessions`, `work-tasks`, `agents`, `performance`.

### SQLite Benchmark

Runs in a temporary database — does not touch `corvid-agent.db`.

```bash
# Full benchmark
bun scripts/benchmark-sqlite.ts

# CI / JSON output
bun scripts/benchmark-sqlite.ts --json

# Scale up row counts
bun scripts/benchmark-sqlite.ts --rows 5000 --iterations 1000

# Run only FTS5 suite
bun scripts/benchmark-sqlite.ts --suite fts5
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--rows` | `1000` | Rows per bulk insert / FTS5 seed |
| `--iterations` | `500` | Iterations for per-operation suites |
| `--json` | off | Emit JSON report to stdout |
| `--suite` | all | Run only the named suite |

Suites: `reads`, `writes`, `bulk`, `concurrent-reads`, `concurrent-writes`, `mixed`, `fts5`, `window`.

## Interpreting Results

### API Benchmark

- **p95 > 200 ms on health endpoints** — server is overloaded, swapping, or a network hop is involved. Check memory and CPU.
- **p95 > 200 ms on data endpoints (sessions, agents)** — database may be under pressure. Run the SQLite benchmark independently.
- **High error count** — authentication middleware may be returning 401/403; these count as successes in the benchmark. 5xx errors count as failures.

### SQLite Benchmark

- **Sequential writes < 500 ops/s** — likely storage bottleneck (network-attached storage, slow SSD, or I/O scheduler). On macOS, ensure you're not running on a HDD.
- **FTS5 p95 > 5 ms** — the FTS5 index may be fragmented. Run `INSERT INTO bench_fts(bench_fts) VALUES('optimize')` to rebuild.
- **Window functions p95 > 10 ms** — query is scanning a large table without filtering first. Ensure queries include a `WHERE` clause before the window.

### WAL Mode Behavior

corvid-agent uses `journal_mode = WAL` with `synchronous = NORMAL`. This means:

- Readers never block writers and writers never block readers.
- `fsync` on commit is skipped in favor of a periodic checkpoint — this gives high write throughput at the cost of losing the last few transactions on a kernel crash (acceptable for agent session data).
- The WAL file grows until a checkpoint is triggered (automatically at ~1,000 pages or on connection close). A large WAL file can slow reads — the server performs a checkpoint on graceful shutdown.

## Minimum Hardware Requirements

| Use Case | RAM | CPU | Storage | Notes |
|----------|-----|-----|---------|-------|
| CLI agent (Claude API only) | 4 GB | 2 cores | 10 GB SSD | No Docker, no Ollama |
| Single agent + dashboard | 8 GB | 2 cores | 20 GB SSD | No AlgoKit localnet |
| Full stack (agent + localnet + IDE) | 16 GB | 4 cores | 40 GB SSD | Recommended for development |
| Multi-agent + Ollama 8B | 32 GB | 8 cores | 100 GB SSD | Comfortable headroom |
| Multi-agent + Ollama 70B | 64 GB | 16 cores | 200 GB SSD | GPU optional but recommended |

### Storage I/O Requirements

SQLite performance is highly sensitive to storage speed:

| Tier | Write IOPS | Sequential Write | Target Use |
|------|-----------|-----------------|------------|
| Minimum | 1,000 IOPS | 50 MB/s | CLI agent, development |
| Recommended | 10,000 IOPS | 500 MB/s | Full dev stack |
| Production | 50,000+ IOPS | 1 GB/s | High-concurrency agent workloads |

Network-attached storage (NAS, NFS, cloud-attached volumes) is **not recommended** for the SQLite database. Use a locally-attached NVMe SSD for best performance.

### Operating System

| Platform | Notes |
|----------|-------|
| macOS (Apple Silicon) | Best developer experience. Metal GPU acceleration for Ollama. |
| Linux (x86-64 / ARM64) | Best performance-per-dollar for server deployments. |
| Windows (WSL2) | Supported but adds 2–4 GB overhead from WSL2 VM. |

## Related

- [System Requirements](system-requirements.md) — RAM and hardware tiers explained
- [API Benchmark script](../scripts/benchmark-api.ts) — source
- [SQLite Benchmark script](../scripts/benchmark-sqlite.ts) — source
- [Performance Collector](../server/performance/collector.ts) — runtime metrics
- [Issue #1989](https://github.com/CorvidLabs/corvid-agent/issues/1989) — original tracking issue
