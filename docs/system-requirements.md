# System Requirements

This guide covers hardware requirements, platform-specific guidance, and troubleshooting for running corvid-agent in a development environment.

## Quick Reference

| Tier | RAM | What Works | What Doesn't |
|------|-----|------------|--------------|
| **Minimum** | 8 GB | CLI agent, Claude API, lightweight editor | Docker, Ollama, heavy IDEs |
| **Recommended** | 16 GB | Single agent + IDE, TestNet for chain features | Ollama, localnet + IDE together |
| **Comfortable** | 32 GB | Full stack — localnet + IDE + Docker + browser | Ollama 70B+ models |
| **Unlimited** | 64 GB+ | Everything including Ollama + multi-agent | Nothing — you're good |

## Component Memory Breakdown

These are measured RSS values from real-world testing. Your numbers will vary based on workload, OS, and configuration.

| Component | Idle | Active/Peak | Notes |
|-----------|------|-------------|-------|
| **corvid-agent server** | ~80 MB | ~200-400 MB | Peak during work task execution with tool calls |
| **AlgoKit localnet** | ~800 MB | ~1.2 GB | 4 containers: algod, indexer, conduit, KMD |
| **Docker Desktop (macOS)** | ~400 MB | ~600 MB | VM overhead; Linux native Docker is lighter |
| **Docker Desktop (Windows)** | ~1-2 GB | ~2-3 GB | WSL2 VM + Hyper-V overhead |
| **Ollama (idle)** | ~300 MB | — | Server process without loaded models |
| **Ollama (8B model)** | — | ~5-6 GB | e.g., llama3.1:8b, qwen2.5-coder:7b |
| **Ollama (70B model)** | — | ~40+ GB | Requires 64 GB+ RAM or GPU VRAM |
| **VS Code + extensions** | ~500 MB | ~2-4 GB | Depends heavily on extensions and workspace size |
| **Node.js (Angular build)** | — | ~500-800 MB | Only during `bun run build:client` |
| **Browser (dashboard)** | ~200 MB | ~500 MB | Per-tab; DevTools adds more |

### Typical Stacks

| Stack | Estimated RAM | Target Tier |
|-------|---------------|-------------|
| Server + Claude API + terminal editor | ~300 MB | 8 GB Minimum |
| Server + Claude API + VS Code | ~2-4 GB | 16 GB Recommended |
| Server + localnet + VS Code + browser | ~4-7 GB | 16-32 GB |
| Server + localnet + VS Code + Ollama 8B | ~10-13 GB | 32 GB Comfortable |
| Server + localnet + Ollama 70B + IDE + browser | ~45+ GB | 64 GB Unlimited |

## Software Prerequisites

| Requirement | Version | Required? |
|-------------|---------|-----------|
| **Bun** | 1.3.0+ | Yes |
| **Git** | Any recent | Yes |
| **Node.js** | 18+ | Only for building Angular client or running Playwright tests |
| **Docker** | Any recent | Only for AlgoKit localnet or Docker deployment |
| **Ollama** | Any recent | Only for local LLM inference |

## Platform-Specific Notes

### macOS

macOS uses unified memory (RAM shared between CPU and GPU), which is generally more efficient for development workloads:

- Docker runs in a lightweight LinuxKit VM (Apple Virtualization framework on Apple Silicon)
- Default Docker memory limit is usually sufficient; increase in Docker Desktop → Settings → Resources if needed
- Apple Silicon Macs are particularly efficient — the M-series chips handle concurrent workloads well
- Ollama can use Metal for GPU acceleration on Apple Silicon

### Linux

Linux is the most memory-efficient platform:

- Docker runs natively — no VM overhead
- Direct access to all system memory
- Best option for constrained environments (e.g., cloud VMs, Raspberry Pi with 8 GB)

### Windows (WSL2)

Windows with WSL2 is the most memory-constrained platform due to layered virtualization:

- **Windows idle**: 5-7 GB (OS + services + Defender)
- **WSL2 VM**: 1-2 GB overhead before your workload starts
- **Docker Desktop**: Uses WSL2 backend, adding another 1-2 GB
- **Total overhead before corvid-agent**: 8-11 GB

#### WSL2 Memory Configuration

By default, WSL2 claims up to 50% of system RAM (or 8 GB, whichever is less). On a 16 GB machine, this can cause swapping. Create or edit `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=6GB
swap=2GB
processors=4
```

Then restart WSL: `wsl --shutdown` and reopen your terminal.

#### Docker Desktop Memory Limit

In Docker Desktop → Settings → Resources → WSL Integration, you can set a memory limit for Docker. On 16 GB machines, try limiting to 4 GB.

#### Recommended 16 GB Windows Setup

If you have 16 GB on Windows:

1. Skip Docker/localnet — use TestNet instead (`ALGORAND_NETWORK=testnet`)
2. Skip Ollama — use Claude API or Claude Code CLI
3. Use VS Code with minimal extensions
4. Close browsers when not testing the dashboard
5. Set WSL2 memory limit to 6 GB in `.wslconfig`

## Benchmark Script

Run the built-in benchmark to measure your system:

```bash
bun scripts/benchmark-system.ts
```

Options:
- `--json` — output as JSON (for automation)
- `--component <name>` — measure a single component (`server`, `localnet`, `ollama`, `deps`)

The script detects your system RAM, checks running components, and provides a tier recommendation.

## Disk Usage

| Item | Typical Size | Notes |
|------|-------------|-------|
| **Repository clone** | ~50 MB | Source code only |
| **node_modules** | ~200-400 MB | After `bun install` |
| **Client dist** | ~10-20 MB | After `bun run build:client` |
| **Database (fresh)** | < 1 MB | Empty SQLite database |
| **Database (active)** | 5-50 MB | Grows with sessions, memories, metrics |
| **Database (heavy use)** | 100-500 MB | Long-running instances with many agents |
| **Localnet data** | ~500 MB - 1 GB | Algorand ledger data (grows over time) |
| **Ollama models** | 4-40 GB per model | Stored in `~/.ollama/models` |

## Troubleshooting: "My System Feels Slow"

### Symptoms and Causes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Everything is slow | Swapping — RAM fully used | Close components, check tier table above |
| Server responses are slow | LLM API latency, not RAM | Normal — Claude API calls take 5-30s |
| Server uses lots of RAM | Many active sessions | Reduce concurrent sessions; restart server |
| Docker is slow | VM memory pressure | Increase Docker memory limit or switch to TestNet |
| High CPU at idle | Ollama model staying loaded | `ollama stop <model>` or set `OLLAMA_KEEP_ALIVE=5m` |
| Database operations lag | Large WAL file | Restart server (triggers WAL checkpoint) |

### Quick Diagnosis

```bash
# Check what's using RAM
bun scripts/benchmark-system.ts

# Check server memory specifically
curl -s http://localhost:3000/api/performance/current | jq '.memoryRSS, .memoryHeapUsed'

# Check Docker container memory
docker stats --no-stream

# Check Ollama loaded models
curl -s http://localhost:11434/api/ps | jq '.models[].name'
```

### Reducing Memory Usage

In order of impact:

1. **Stop Ollama** — saves 5-40 GB depending on model. Use Claude API instead.
2. **Stop localnet** — `algokit localnet stop` saves ~1 GB. Use TestNet instead.
3. **Close IDE extensions** — disable unused VS Code extensions in workspace settings.
4. **Close browser tabs** — each tab uses 100-500 MB. Keep only the dashboard tab open.
5. **Restart the server** — clears accumulated session state and triggers WAL checkpoint.
6. **Use a lighter editor** — vim/nano/Helix use < 50 MB vs. VS Code's 500 MB+.

### WSL2-Specific

If you're on Windows with WSL2 and experiencing issues:

1. Check actual WSL2 memory usage: `wsl -- free -h`
2. Check Windows memory: Task Manager → Performance → Memory
3. If WSL2 is using too much, add a `.wslconfig` limit (see above)
4. Consider running corvid-agent directly on Windows (Bun supports Windows) instead of WSL2
5. Docker Desktop's WSL2 integration can double memory usage — use the Docker engine inside WSL2 directly if possible

## Related

- [Quickstart](quickstart.md) — get started in 5 minutes
- [Self-Hosting Guide](self-hosting.md) — production deployment
- [Benchmark script source](../scripts/benchmark-system.ts) — measure your own system
