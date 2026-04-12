# Rust Plugin System Architecture for corvid-agent

**Version**: 1.0
**Status**: Design Proposal
**Author**: Team Alpha
**Date**: 2026-03-28
**Scope**: Comprehensive plugin system for corvid-agent using Rust + WASM sandbox

---

## Executive Summary

This document outlines a forward-looking plugin system for corvid-agent that:
- **Decouples extensions** from the core agent runtime
- **Supports external plugin repos** with automatic discovery, versioning, and dependency resolution
- **Enforces security** through WASM sandboxing and capability-based permissions
- **Optimizes build times** by compiling plugins independently
- **Demonstrates extensibility** with 3 production-ready showcase plugins

The system targets **high-trust ecosystem plugins** (vetted contributors) while maintaining **untrusted plugin isolation** via runtime sandboxing.

---

## 1. Plugin Trait System & Lifecycle

### 1.1 Core Plugin Trait

```rust
// corvid-plugin-api/src/lib.rs
pub trait Plugin: Send + Sync {
    /// Plugin metadata (name, version, semver range of supported API versions)
    fn metadata(&self) -> PluginMetadata;

    /// Initialize the plugin with runtime context
    /// Called once at startup; plugin can spawn tasks, register handlers, etc.
    async fn init(&mut self, ctx: &PluginContext) -> Result<()>;

    /// Execute a command (skill invocation)
    /// Returns JSON response for the agent to parse
    async fn execute(
        &self,
        command: &str,
        args: serde_json::Value,
        ctx: &ExecutionContext,
    ) -> Result<PluginResponse>;

    /// Health check: return Ok(()) if alive, Err if degraded/failed
    async fn health(&self) -> Result<()>;

    /// Graceful shutdown: cleanup resources, flush state
    async fn shutdown(&mut self) -> Result<()>;
}

pub struct PluginMetadata {
    pub name: String,           // "algochat-monitor"
    pub version: String,         // "1.2.3"
    pub api_version: String,     // "1.0" (semver range)
    pub author: String,          // "Tofu"
    pub description: String,
    pub commands: Vec<CommandDef>,  // ["monitor", "pause", "resume"]
    pub capabilities: Vec<String>,   // ["read:sessions", "write:logs"]
}

pub struct CommandDef {
    pub name: String,
    pub description: String,
    pub args_schema: serde_json::Value,  // JSON schema
}

pub struct PluginContext {
    pub agent_id: String,
    pub config: PluginConfig,
    pub db: Arc<Database>,         // Shared DB connection pool
    pub logger: Arc<dyn Logger>,
    pub env: HashMap<String, String>,
}

pub struct ExecutionContext {
    pub caller_agent: String,
    pub trace_id: String,
    pub capabilities: Vec<String>,  // What this caller can do
}

pub struct PluginResponse {
    pub status: ResponseStatus,    // Success, Error, Partial
    pub data: serde_json::Value,
    pub logs: Vec<LogEntry>,
}
```

### 1.2 Lifecycle Guarantees

```
┌─────────────────────────────────────────────────┐
│           Plugin Lifecycle                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  [Plugin Binary Loaded]                          │
│           ↓                                      │
│  metadata() → register name, version, commands  │
│           ↓                                      │
│  init(ctx) → one-time setup, spawn tasks       │
│           ↓                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Ready for Commands                      │   │
│  │  execute(cmd, args) ← called repeatedly│   │
│  │  health() ← polled every 30s            │   │
│  │                                         │   │
│  │ (can persist state via DB or files)   │   │
│  └─────────────────────────────────────────┘   │
│           ↓ (on shutdown or crash)              │
│  shutdown() → flush state, close connections   │
│           ↓                                      │
│  [Plugin Unloaded]                              │
│                                                  │
└─────────────────────────────────────────────────┘

Guarantees:
- init() completes before first execute()
- execute() is concurrent-safe (spawn tasks in init)
- health() can be called at any time
- shutdown() is called at least once on graceful stop
- On crash: runtime detects via health(), isolates plugin, logs error
```

### 1.3 State Management Pattern

Plugins store durable state via:
- **Database**: Shared SQLite tables (schema: `plugin_{name}_*`)
- **File storage**: `/var/lib/corvid-agent/plugins/{name}/` (permission-controlled)
- **In-memory**: Task state, caches (ephemeral, lost on restart)

```rust
pub struct AlgochatMonitor {
    // Ephemeral
    session_cache: Arc<Mutex<HashMap<String, SessionStats>>>,

    // Durable
    db: Arc<Database>,
}

impl Plugin for AlgochatMonitor {
    async fn init(&mut self, ctx: &PluginContext) -> Result<()> {
        // Create tables if needed
        ctx.db.execute("CREATE TABLE IF NOT EXISTS algochat_monitor_sessions (...)")?;

        // Load persistent state
        let sessions = ctx.db.query("SELECT * FROM algochat_monitor_sessions")?;
        for row in sessions {
            self.session_cache.lock().await.insert(row.id, row.stats);
        }

        // Spawn background task
        let db = self.db.clone();
        tokio::spawn(async move {
            loop {
                // Monitor algo balance, block times, etc.
                db.execute("UPDATE algochat_monitor_sessions SET ...")?;
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });

        Ok(())
    }
}
```

---

## 2. Crate Structure

### 2.1 Workspace Layout

```
corvid-agent/
├── Cargo.toml (workspace root)
├── crates/
│   ├── corvid-plugin-api/          ← Plugin trait + types
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs              ← Plugin trait, PluginMetadata, etc.
│   │       ├── error.rs
│   │       ├── serde.rs            ← Serialization helpers
│   │       └── macros.rs           ← Plugin derive macros
│   │
│   ├── corvid-plugin-runtime/      ← Core plugin loader
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs              ← PluginRuntime, discovery, lifecycle
│   │       ├── loader.rs           ← Load .so/.wasm binaries
│   │       ├── sandbox.rs          ← WASM/capability enforcement
│   │       └── registry.rs         ← In-memory plugin registry
│   │
│   └── corvid-server-with-plugins/ ← Modified server entry point
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs              ← Integration with existing server
│
├── plugins/
│   ├── algochat-monitor/           ← Native Rust plugin
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   └── lib.rs
│   │   └── PLUGIN.yaml
│   │
│   ├── token-price-feed/           ← WASM plugin
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   └── lib.rs
│   │   ├── PLUGIN.yaml
│   │   └── build.sh                ← WASM build script
│   │
│   └── custom-aggregator/          ← Hybrid plugin
│       ├── Cargo.toml
│       ├── src/
│       │   └── lib.rs
│       └── PLUGIN.yaml
│
└── specs/
    └── plugins.spec.md             ← Plugin system spec
```

### 2.2 Workspace Cargo.toml

```toml
[workspace]
members = [
    "crates/corvid-plugin-api",
    "crates/corvid-plugin-runtime",
    "crates/corvid-server-with-plugins",
    "plugins/algochat-monitor",
    "plugins/token-price-feed",
    "plugins/custom-aggregator",
]
resolver = "2"

[workspace.lints.rust]
unsafe_code = "forbid"  # Plugins must be safe-code

[workspace.lints.clippy]
all = "warn"
```

### 2.3 Core Crate Dependencies

**corvid-plugin-api** (minimal, published to crates.io):
```toml
[package]
name = "corvid-plugin-api"
version = "1.0.0"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
thiserror = "1.0"
```

**corvid-plugin-runtime** (internal, not published):
```toml
[package]
name = "corvid-plugin-runtime"
version = "0.1.0"

[dependencies]
corvid-plugin-api = { path = "../corvid-plugin-api" }
tokio = { version = "1.0", features = ["full"] }
wasmtime = "17.0"  # WASM sandbox
tracing = "0.1"
serde = { version = "1.0", features = ["derive"] }
dashmap = "5.5"
```

---

## 3. External Plugin Repository Model

### 3.1 Plugin Registry & Discovery

**Centralized Registry** (like crates.io for plugins):
```yaml
# plugins/registry.yaml (maintained in corvid-agent repo)
registry:
  version: "1"
  url: "https://github.com/CorvidLabs/corvid-plugin-registry"
  plugins:
    - name: "algochat-monitor"
      repo: "https://github.com/CorvidLabs/corvid-plugin-algochat-monitor"
      author: "Tofu"
      version: "1.2.3"
      api_version: "1.0"

    - name: "token-price-feed"
      repo: "https://github.com/kyn-labs/token-feed"
      author: "Kyn"
      version: "2.0.1"
      api_version: "1.0"
```

**Plugin Manifest** (in each plugin repo):
```yaml
# plugins/algochat-monitor/PLUGIN.yaml
name: "algochat-monitor"
version: "1.2.3"
api_version: "1.0"  # semver range: "1.0", ">=1.0,<2.0", etc.
author: "Tofu"
license: "MIT"
description: "Monitor Algorand session health, balances, block times"

capabilities:
  - read:sessions
  - read:algochat
  - write:metrics

dependencies:
  - name: "corvid-plugin-api"
    version: "~1.0"

build:
  type: "native"  # or "wasm"
  target: "x86_64-unknown-linux-gnu"

publish:
  registry: "crates.io"
  name: "corvid-plugin-algochat-monitor"
```

### 3.2 Installation & Version Management

```bash
# CLI commands
corvid-agent plugin list                    # List installed plugins
corvid-agent plugin install algochat-monitor@1.2.3
corvid-agent plugin update algochat-monitor
corvid-agent plugin remove algochat-monitor

# Config-driven install (plugins.yaml)
corvid-agent plugin sync                    # Install/remove per config
```

**plugins.yaml** (in corvid-agent config dir):
```yaml
plugins:
  algochat-monitor:
    version: "1.2.3"
    enabled: true

  token-price-feed:
    version: "2.0.1"
    enabled: true

  custom-aggregator:
    version: "1.0.0"
    enabled: false
    config:
      data_source: "algorand-mainnet"
      cache_ttl: 300

# Disable auto-updates
auto_update: false
```

### 3.3 Plugin Installation Flow

```
┌──────────────────────────────────────────┐
│  corvid-agent plugin install algochat-monitor@1.2.3
└──────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ 1. Fetch metadata from registry.yaml     │
│    → repo URL, manifest, checksums       │
└──────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ 2. Verify API version compatibility      │
│    plugin.api_version ∈ runtime.api_*    │
└──────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ 3. Clone repo or fetch prebuilt binary   │
│    if available in GitHub releases       │
└──────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ 4. Verify signature (RSA-2048)           │
│    of release binary                     │
└──────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ 5. Expand to:                            │
│    ~/.corvid/plugins/{name}/v{version}/  │
│    ├── plugin.so/.wasm                   │
│    ├── PLUGIN.yaml                       │
│    └── README.md                         │
└──────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────┐
│ 6. Update plugins.yaml, reload           │
│    plugins at next startup or via        │
│    runtime reload command                │
└──────────────────────────────────────────┘
```

---

## 4. Build System & Priorities

### 4.1 Build Priorities

**Priority 1: Minimize core rebuild**
- Core server doesn't rebuild when plugins change
- Only plugin-api and plugin-runtime in critical path
- Plugins built independently in parallel

**Priority 2: Fast incremental development**
```bash
# Develop plugin locally
cd plugins/algochat-monitor
cargo build       # ~3s (incremental)

# Test in isolation
cargo test

# Rebuild server only if plugin-api/runtime changed
# Otherwise: just reload plugin binary
```

**Priority 3: Pre-built binaries for CI/CD**
- Release workflow publishes `.so` to GitHub releases
- End users don't compile plugins (download binary)
- Only developers building plugins locally need Rust toolchain

### 4.2 Build Scripts

**plugins/algochat-monitor/Cargo.toml**:
```toml
[package]
name = "corvid-plugin-algochat-monitor"
version = "1.2.3"
crate-type = ["cdylib"]  # ← Builds as .so / .dylib

[dependencies]
corvid-plugin-api = { path = "../../crates/corvid-plugin-api" }
tokio = { version = "1.0", features = ["full"] }
serde_json = "1.0"
sqlx = { version = "0.7", features = ["sqlite"] }

[[bin]]
name = "algochat_monitor"
path = "src/lib.rs"
crate-type = ["cdylib"]
```

**WASM Plugin Build** (token-price-feed):
```bash
# build.sh
#!/bin/bash
set -e

# Install wasm32 target if not present
rustup target add wasm32-unknown-unknown

# Build as WASM
cargo build \
  --target wasm32-unknown-unknown \
  --release

# Optimize binary size
wasm-opt -O4 \
  target/wasm32-unknown-unknown/release/token_price_feed.wasm \
  -o target/wasm32-unknown-unknown/release/token_price_feed.opt.wasm

# Output
cp target/wasm32-unknown-unknown/release/token_price_feed.opt.wasm \
  ../plugin.wasm
```

### 4.3 Release Automation

**GitHub Actions Workflow** (.github/workflows/plugin-release.yml):
```yaml
name: Plugin Release

on:
  push:
    tags:
      - 'algochat-monitor-v*'
      - 'token-price-feed-v*'

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: macos-latest
            target: x86_64-apple-darwin

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Build plugin
        run: |
          cd plugins/$(echo ${{ github.ref }} | cut -d'-' -f1)
          cargo build --release

      - name: Create release artifact
        run: |
          plugin_name=$(echo ${{ github.ref }} | cut -d'-' -f1)
          version=$(echo ${{ github.ref }} | cut -d'-' -f2)
          mkdir -p release
          cp plugins/$plugin_name/target/release/*.so release/
          cp plugins/$plugin_name/PLUGIN.yaml release/

      - name: Generate signature
        run: |
          openssl dgst -sha256 -sign .github/plugin-sign.key \
            release/*.so > release/*.sig

      - name: Create release
        uses: softprops/action-gh-release@v1
        with:
          files: release/*
          body: |
            ## Changes
            See CHANGELOG.md for details.
```

---

## 5. Sandboxing & Security Model

### 5.1 Threat Model

**Trusted Plugins** (native .so):
- Vetted open-source projects
- Runtime isolation via process boundaries (future)
- Capability-based permissions
- Code review + signed releases

**Untrusted Plugins** (WASM):
- Third-party / experimental
- Sandboxed via Wasmtime
- Memory-safe execution
- Strictly limited capabilities

### 5.2 Capability-Based Security

Plugins declare required capabilities in PLUGIN.yaml:
```yaml
capabilities:
  - read:sessions          # Can query session table
  - read:algochat          # Can read AlgoChat messages
  - write:metrics          # Can write to plugin metrics table
  - network:http           # Can make outbound HTTP (WASM only, filtered)
  - spawn:task             # Can spawn background tasks
```

Runtime enforces capabilities:
```rust
pub enum PluginCapability {
    Read(ResourceType),      // read:sessions, read:algochat
    Write(ResourceType),     // write:metrics, write:logs
    Network(NetworkType),    // network:http, network:tcp
    Spawn(SpawnType),        // spawn:task, spawn:timer
}

pub struct ExecutionContext {
    capabilities: Vec<PluginCapability>,  // What THIS call can do

    // Per-capability quotas
    db_queries_per_sec: usize,
    http_requests_per_sec: usize,
    spawned_tasks_limit: usize,
}
```

### 5.3 WASM Sandbox Implementation

```rust
// corvid-plugin-runtime/src/sandbox.rs
use wasmtime::{Engine, Instance, Linker, Store};

pub struct WasmSandbox {
    engine: Engine,
    linker: Linker<PluginState>,
}

pub struct PluginState {
    pub capabilities: HashSet<PluginCapability>,
    pub db: Arc<Database>,
    pub resources: ResourceLimits,
}

impl WasmSandbox {
    pub fn new() -> Self {
        let mut config = wasmtime::Config::new();

        // Memory limits
        config.async_support(true);
        config.max_memory_pages(512);      // 32 MB limit

        // CPU/timeout
        config.epoch_interruption(true);   // Interrupt on epoch change

        let engine = Engine::new(&config)?;
        let mut linker = Linker::new(&engine);

        // Import WASM host functions
        Self::register_host_functions(&mut linker)?;

        Ok(Self { engine, linker })
    }

    fn register_host_functions(linker: &mut Linker<PluginState>) -> Result<()> {
        // Database: only allowed operations
        linker.func_wrap("db", "query", |mut caller: Caller<'_, _>, ptr: i32, len: i32| {
            let state = caller.data_mut();

            // Check: read:algochat capability
            if !state.capabilities.contains(&PluginCapability::Read(ResourceType::Algochat)) {
                return Err(anyhow::anyhow!("Permission denied: read:algochat"));
            }

            // Check: rate limit
            state.resources.db_queries.check_quota()?;

            // Execute whitelisted query
            let query = caller.read_memory(&Memory::new(&mut caller), ptr, len)?;
            let result = state.db.query_readonly(&query)?;

            Ok(())
        })?;

        // Network: only HTTP, rate-limited
        linker.func_wrap("net", "http_get", |mut caller: Caller<'_, _>, url_ptr: i32| {
            let state = caller.data_mut();

            // Check: network:http capability
            if !state.capabilities.contains(&PluginCapability::Network(NetworkType::Http)) {
                return Err(anyhow::anyhow!("Permission denied: network:http"));
            }

            // Check: rate limit (1 req/sec)
            state.resources.http_requests.check_quota()?;

            // Execute HTTP GET (no file:// or localhost)
            // ...

            Ok(())
        })?;

        Ok(())
    }

    pub async fn run_plugin(
        &self,
        binary: &[u8],
        cmd: &str,
        args: serde_json::Value,
        ctx: PluginState,
    ) -> Result<PluginResponse> {
        let mut store = Store::new(&self.engine, ctx);

        // Set timeout: 10s per command
        store.set_epoch_deadline(1);

        let instance = self.linker.instantiate(&mut store, &Module::new(&self.engine, binary)?)?;

        // Call plugin's execute function
        let execute_fn = instance.get_typed_func::<(i32, i32), i32>(&mut store, "execute")?;
        let result_ptr = execute_fn.call(&mut store, (args_ptr, args_len))?;

        Ok(())
    }
}
```

### 5.4 Database Isolation

Each plugin gets isolated tables:
```sql
-- Plugin namespace isolation
CREATE TABLE plugin_algochat_monitor_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  ...
);

CREATE TABLE plugin_token_feed_prices (
  symbol TEXT PRIMARY KEY,
  price REAL,
  timestamp INTEGER,
  ...
);

-- Runtime enforces: plugin can only access plugin_{name}_* tables
```

### 5.5 Timeout & Resource Limits

```rust
pub struct ResourceLimits {
    pub memory: MemoryLimit,
    pub cpu_time: Duration,  // 10 seconds per command
    pub db_queries: RateLimit,  // 100 queries/sec
    pub http_requests: RateLimit,  // 5 requests/sec
    pub spawned_tasks: usize,  // max 10 concurrent tasks per plugin
}

// Enforcement
if plugin.health().is_err() {
    // Isolate plugin: no new commands, only shutdown
    plugin.shutdown().await;
    event!("plugin:crash", name: plugin.name(), reason: "health check failed");
}
```

---

## 6. Showcase Plugins

### 6.1 Plugin 1: AlgoChat Monitor

**Purpose**: Real-time monitoring of Algorand session health and metrics.

**Use Case**:
- Track balance of agent wallets across the network
- Monitor block time deviations
- Alert on network congestion
- Persist metrics to Prometheus

```rust
// plugins/algochat-monitor/src/lib.rs
use corvid_plugin_api::*;

pub struct AlgochatMonitor {
    db: Arc<Database>,
    metrics: Arc<Mutex<MetricsCollector>>,
}

#[async_trait]
impl Plugin for AlgochatMonitor {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            name: "algochat-monitor".to_string(),
            version: "1.2.3".to_string(),
            api_version: "1.0".to_string(),
            author: "Tofu".to_string(),
            description: "Monitor Algorand session health".to_string(),
            commands: vec![
                CommandDef {
                    name: "status".to_string(),
                    description: "Get current network status".to_string(),
                    args_schema: json!({ "type": "object" }),
                },
                CommandDef {
                    name: "balance".to_string(),
                    description: "Check wallet balance".to_string(),
                    args_schema: json!({
                        "type": "object",
                        "properties": {
                            "address": { "type": "string" }
                        },
                        "required": ["address"]
                    }),
                },
            ],
            capabilities: vec![
                "read:algochat".to_string(),
                "write:metrics".to_string(),
                "spawn:task".to_string(),
            ],
        }
    }

    async fn init(&mut self, ctx: &PluginContext) -> Result<()> {
        // Create metrics table
        ctx.db.execute(
            "CREATE TABLE IF NOT EXISTS algochat_monitor_metrics (
              timestamp INTEGER PRIMARY KEY,
              agent_id TEXT,
              balance_algo REAL,
              block_height INTEGER,
              network_congestion REAL
            )"
        )?;

        // Spawn background monitor task
        let db = self.db.clone();
        let metrics = self.metrics.clone();

        tokio::spawn(async move {
            loop {
                // Poll Algorand network every 10 seconds
                let status = algod_client.status().await?;

                // Record metrics
                let mut m = metrics.lock().await;
                m.record_block_time(status.last_round_time);
                m.record_network_health(status);

                // Persist to DB
                db.execute(
                    "INSERT INTO algochat_monitor_metrics (...) VALUES (...)"
                )?;

                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        });

        Ok(())
    }

    async fn execute(
        &self,
        command: &str,
        args: Value,
        ctx: &ExecutionContext,
    ) -> Result<PluginResponse> {
        match command {
            "status" => {
                let metrics = self.metrics.lock().await;
                Ok(PluginResponse {
                    status: ResponseStatus::Success,
                    data: json!({
                        "block_height": metrics.latest_block(),
                        "block_time_ms": metrics.avg_block_time(),
                        "network_health": metrics.health_score(),
                    }),
                    logs: vec![],
                })
            }
            "balance" => {
                let address = args.get("address")
                    .ok_or_else(|| anyhow::anyhow!("address required"))?
                    .as_str()?;

                let balance = algod_client.account_info(address).await?;

                Ok(PluginResponse {
                    status: ResponseStatus::Success,
                    data: json!({ "amount_algo": balance.amount / 1_000_000 }),
                    logs: vec![],
                })
            }
            _ => Err(anyhow::anyhow!("Unknown command: {}", command)),
        }
    }

    async fn health(&self) -> Result<()> {
        // Check that background task is still running
        let metrics = self.metrics.lock().await;
        if metrics.last_update() < Instant::now() - Duration::from_secs(30) {
            return Err(anyhow::anyhow!("Stale metrics"));
        }
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        // Flush final metrics
        let metrics = self.metrics.lock().await;
        metrics.flush_to_db(&self.db).await?;
        Ok(())
    }
}

// Plugin entry point (macro-generated)
corvid_plugin_export!(AlgochatMonitor);
```

**Commands**:
```bash
agent.execute_plugin("algochat-monitor", "status", {})
  → { "block_height": 45829372, "block_time_ms": 3850, "network_health": 0.98 }

agent.execute_plugin("algochat-monitor", "balance", { "address": "..." })
  → { "amount_algo": 15.234 }
```

---

### 6.2 Plugin 2: Token Price Feed (WASM)

**Purpose**: Fetch real-time token prices from decentralized sources, cache locally.

**Use Case**:
- Query ALGO/USD, ALGO/EUR prices
- Integration with agents making economic decisions
- HTTP requests (WASM-safe, rate-limited)
- Redis-backed cache (plugin's write namespace)

```rust
// plugins/token-price-feed/src/lib.rs
use corvid_plugin_api::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct TokenPriceFeed {
    cache: HashMap<String, (f64, u64)>,  // symbol → (price, timestamp)
}

#[wasm_bindgen]
impl TokenPriceFeed {
    pub fn metadata() -> String {
        serde_json::to_string(&PluginMetadata {
            name: "token-price-feed".to_string(),
            version: "2.0.1".to_string(),
            commands: vec![
                CommandDef {
                    name: "price".to_string(),
                    description: "Get token price".to_string(),
                    ..Default::default()
                },
            ],
            capabilities: vec![
                "network:http".to_string(),
                "write:plugin-cache".to_string(),
            ],
            ..Default::default()
        }).unwrap()
    }

    pub async fn init(&mut self) {
        // Load cache from persistent storage (via host function)
        let cache_data = host::get_cache("token-prices").await.unwrap_or_default();
        self.cache = serde_json::from_str(&cache_data).unwrap_or_default();
    }

    pub async fn execute(&self, command: &str, args: &str) -> String {
        match command {
            "price" => {
                let args: PriceRequest = serde_json::from_str(args).unwrap();

                // Check cache (5 min TTL)
                if let Some((price, ts)) = self.cache.get(&args.symbol) {
                    if Instant::now() - Duration::from_secs(*ts) < Duration::from_secs(300) {
                        return serde_json::to_string(&PriceResponse {
                            symbol: args.symbol.clone(),
                            price: *price,
                            source: "cache".to_string(),
                        }).unwrap();
                    }
                }

                // Fetch from Tinyman API
                let url = format!("https://api.tinyman.org/v1/price/{}", args.symbol);
                let response = host::http_get(&url).await.unwrap();
                let price: f64 = response.price;

                // Update cache
                self.cache.insert(args.symbol.clone(), (price, Instant::now().as_secs()));
                host::set_cache("token-prices", &serde_json::to_string(&self.cache).unwrap()).await.ok();

                serde_json::to_string(&PriceResponse {
                    symbol: args.symbol,
                    price,
                    source: "live".to_string(),
                }).unwrap()
            }
            _ => "unknown command".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct PriceRequest {
    symbol: String,
}

#[derive(Serialize, Deserialize)]
struct PriceResponse {
    symbol: String,
    price: f64,
    source: String,  // "live" or "cache"
}
```

**Commands**:
```bash
agent.execute_plugin("token-price-feed", "price", { "symbol": "ALGO" })
  → { "symbol": "ALGO", "price": 0.87, "source": "live" }

agent.execute_plugin("token-price-feed", "price", { "symbol": "ALGO" })  # Within 5 min
  → { "symbol": "ALGO", "price": 0.87, "source": "cache" }
```

---

### 6.3 Plugin 3: Custom Aggregator

**Purpose**: Combine data from multiple plugins + external sources for decision-making.

**Use Case**:
- Agents need to decide whether to submit a transaction
- Aggregator combines: network health, gas prices, balance, market conditions
- Outputs a recommendation: "ready", "wait", "error"
- Persists historical decisions for analysis

```rust
// plugins/custom-aggregator/src/lib.rs
use corvid_plugin_api::*;

pub struct CustomAggregator {
    db: Arc<Database>,
    state: Arc<Mutex<AggregatorState>>,
}

pub struct AggregatorState {
    last_recommendation: Option<Recommendation>,
    recommendation_history: Vec<HistoricalRec>,
}

pub struct Recommendation {
    pub status: String,  // "ready", "wait", "error"
    pub reasons: Vec<String>,
    pub score: f64,  // 0.0 to 1.0
}

#[async_trait]
impl Plugin for CustomAggregator {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            name: "custom-aggregator".to_string(),
            version: "1.0.0".to_string(),
            api_version: "1.0".to_string(),
            author: "Gaspar".to_string(),
            description: "Aggregate data from multiple plugins for decision-making".to_string(),
            commands: vec![
                CommandDef {
                    name: "evaluate".to_string(),
                    description: "Evaluate if agent should proceed with transaction".to_string(),
                    args_schema: json!({
                        "type": "object",
                        "properties": {
                            "tx_type": { "type": "string" },
                            "amount": { "type": "number" }
                        }
                    }),
                },
            ],
            capabilities: vec![
                "read:sessions".to_string(),
                "write:metrics".to_string(),
            ],
        }
    }

    async fn init(&mut self, ctx: &PluginContext) -> Result<()> {
        // Create recommendation history table
        ctx.db.execute(
            "CREATE TABLE IF NOT EXISTS aggregator_decisions (
              id TEXT PRIMARY KEY,
              tx_type TEXT,
              timestamp INTEGER,
              recommendation TEXT,
              score REAL,
              network_health REAL,
              balance_algo REAL,
              price_usd REAL
            )"
        )?;

        // Load recent history
        let history = ctx.db.query(
            "SELECT * FROM aggregator_decisions ORDER BY timestamp DESC LIMIT 1000"
        )?;

        let mut state = self.state.lock().await;
        for row in history {
            state.recommendation_history.push(HistoricalRec {
                tx_type: row.get("tx_type"),
                recommendation: row.get("recommendation"),
                score: row.get("score"),
            });
        }

        Ok(())
    }

    async fn execute(
        &self,
        command: &str,
        args: Value,
        ctx: &ExecutionContext,
    ) -> Result<PluginResponse> {
        match command {
            "evaluate" => {
                // Call other plugins to gather data
                let network = call_plugin("algochat-monitor", "status", json!({})).await?;
                let price = call_plugin("token-price-feed", "price", json!({ "symbol": "ALGO" })).await?;

                // Scoring algorithm
                let score = self.compute_score(
                    network.get("network_health").unwrap().as_f64().unwrap(),
                    price.get("price").unwrap().as_f64().unwrap(),
                    args.get("amount").unwrap().as_f64().unwrap(),
                )?;

                // Determine recommendation
                let recommendation = match score {
                    s if s > 0.8 => Recommendation {
                        status: "ready".to_string(),
                        reasons: vec!["Network healthy".into(), "Price stable".into()],
                        score: s,
                    },
                    s if s > 0.5 => Recommendation {
                        status: "wait".to_string(),
                        reasons: vec!["Network degraded, retry in 30s".into()],
                        score: s,
                    },
                    _ => Recommendation {
                        status: "error".to_string(),
                        reasons: vec!["Network congestion".into(), "Price volatile".into()],
                        score,
                    },
                };

                // Persist decision
                self.db.execute(
                    "INSERT INTO aggregator_decisions (...) VALUES (...)",
                )?;

                Ok(PluginResponse {
                    status: ResponseStatus::Success,
                    data: json!(recommendation),
                    logs: vec![],
                })
            }
            _ => Err(anyhow::anyhow!("Unknown command")),
        }
    }

    async fn health(&self) -> Result<()> {
        // Still able to reach other plugins
        call_plugin("algochat-monitor", "status", json!({})).await?;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }
}

impl CustomAggregator {
    fn compute_score(&self, network_health: f64, price: f64, amount: f64) -> Result<f64> {
        // Weighted scoring
        let network_weight = 0.4;
        let price_weight = 0.3;
        let amount_weight = 0.3;

        let price_change = (price - self.get_historical_price()).abs() / self.get_historical_price();
        let volatility_score = if price_change < 0.05 { 1.0 } else { 0.5 };

        let amount_reasonable = if amount < 100.0 { 1.0 } else { 0.7 };

        Ok((network_health * network_weight)
            + (volatility_score * price_weight)
            + (amount_reasonable * amount_weight))
    }

    fn get_historical_price(&self) -> f64 {
        // Average of last 10 price observations
        0.87
    }
}

corvid_plugin_export!(CustomAggregator);
```

**Commands**:
```bash
agent.execute_plugin("custom-aggregator", "evaluate",
  { "tx_type": "asset_swap", "amount": 50.0 })

→ {
    "status": "ready",
    "reasons": ["Network healthy", "Price stable"],
    "score": 0.92
  }
```

---

## 7. Integration with Existing Server

### 7.1 Server Startup

```rust
// server/src/lib.rs
use corvid_plugin_runtime::*;

pub struct Server {
    plugin_runtime: PluginRuntime,
    http: HttpServer,
    db: Arc<Database>,
}

impl Server {
    pub async fn new(config: ServerConfig) -> Result<Self> {
        // Initialize plugin runtime
        let mut plugin_runtime = PluginRuntime::new(&config.plugin_dir)?;

        // Discover and load plugins from plugins.yaml
        plugin_runtime.load_from_config(&config.plugins)?;

        // Initialize each plugin
        plugin_runtime.init_all(db.clone()).await?;

        // Register plugin commands as skills
        plugin_runtime.register_skills(&mut skill_registry);

        // Spawn health check task
        tokio::spawn(plugin_runtime.clone().health_check_loop());

        Ok(Self {
            plugin_runtime,
            http: HttpServer::new(config.port),
            db,
        })
    }
}
```

### 7.2 Skill Registration

```rust
// Plugins become skills that agents can invoke
skill_registry.register("algochat-monitor:status", |args| {
    plugin_runtime.execute("algochat-monitor", "status", args)
});

skill_registry.register("algochat-monitor:balance", |args| {
    plugin_runtime.execute("algochat-monitor", "balance", args)
});

// Agent can now use them naturally
agent.skill("algochat-monitor:balance", { address: "..." })
```

### 7.3 API Endpoint

```rust
// GET /api/plugins
async fn list_plugins() -> JsonResponse<Vec<PluginInfo>> {
    let plugins = plugin_runtime.list_plugins();
    JsonResponse(plugins)
}

// POST /api/plugins/{name}/execute
async fn execute_plugin(
    name: String,
    command: String,
    args: Value,
) -> JsonResponse<PluginResponse> {
    let response = plugin_runtime.execute(&name, &command, args).await?;
    JsonResponse(response)
}

// POST /api/plugins/reload
async fn reload_plugins() -> JsonResponse<()> {
    plugin_runtime.reload_all().await?;
    JsonResponse(())
}
```

---

## 8. Development Workflow

### 8.1 Creating a New Plugin

```bash
# 1. Clone template
cargo generate --git https://github.com/CorvidLabs/corvid-plugin-template

# 2. Implement Plugin trait
#    → src/lib.rs

# 3. Test locally
cd plugins/my-plugin
cargo build
cargo test

# 4. Test with server
PLUGINS_DIR=./plugins bun server/index.ts

# 5. Try it
corvid-agent plugin execute my-plugin some-command '{"key": "value"}'

# 6. Publish
git tag my-plugin-v1.0.0
git push --tags
# GitHub Actions builds and publishes .so to releases
```

### 8.2 Testing Plugins

```bash
# Unit tests in plugin crate
cargo test

# Integration tests with runtime
#   tests/integration_test.rs
cargo test --test integration_test

# Load testing
cargo build --release
time corvid-agent plugin stress-test algochat-monitor 1000
```

---

## 9. Future Enhancements

1. **Process-Level Isolation**: Native plugins run in separate processes with IPC (not WASM)
2. **Plugin Composition**: Enable plugins to call other plugins directly
3. **Auto-Scaling**: Spawn multiple plugin instances for high-traffic commands
4. **Dependency Injection**: Plugins declare resource needs, runtime allocates automatically
5. **Hot Reloading**: Update plugin binaries without server restart
6. **Plugin Marketplace**: Web UI to discover, install, rate plugins

---

## 10. Specification Document

See `specs/plugins.spec.md` for formal specification of:
- PluginRuntime public API
- PluginRegistry database schema
- Plugin lifecycle invariants
- Error handling requirements
- Performance SLAs

---

## Summary

This plugin system delivers:

| Aspect | Solution |
|--------|----------|
| **Extensibility** | Trait-based plugin interface, external repos, registry |
| **Performance** | Independent builds, pre-compiled binaries, fast reload |
| **Security** | WASM sandboxing, capability model, DB isolation |
| **Maintainability** | Spec-driven, workspace organization, CI/CD automation |
| **Developer Experience** | Cargo template, local testing, one-command install |

The three showcase plugins (**AlgoChat Monitor**, **Token Price Feed**, **Custom Aggregator**) demonstrate real-world use cases and the flexibility of the system.

