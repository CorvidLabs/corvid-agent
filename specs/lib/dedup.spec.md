---
module: dedup-service
version: 1
status: active
files:
  - server/lib/dedup.ts
db_tables: []
depends_on: []
---

# DedupService

## Purpose

Centralized deduplication service that replaces per-module Map/Set dedup patterns with a single bounded LRU cache. Prevents unbounded memory growth from long-running processes and survives server restarts via optional SQLite persistence. Each dedup domain (polling, messaging, bridges) registers a namespace with independent TTL and capacity settings.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `DedupNamespaceConfig` | Per-namespace configuration: `maxSize`, `ttlMs`, `persist` |
| `DedupMetrics` | Namespace stats: `size`, `hits`, `misses`, `evictions` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `DedupService` | Singleton service managing namespaced LRU caches with TTL and optional SQLite persistence |

#### DedupService Static Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `init` | `(db?: Database)` | `DedupService` | Initialize the global singleton with optional DB. Call once at startup |
| `global` | `()` | `DedupService` | Get the global singleton. Creates a no-persistence instance if `init()` was not called |
| `resetGlobal` | `()` | `void` | Stop and destroy the global singleton (testing only) |

#### DedupService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `start` | `()` | `void` | Start background prune (60s) and persist (30s) timers |
| `stop` | `()` | `void` | Stop timers and flush dirty state to DB |
| `register` | `(namespace: string, config?: DedupNamespaceConfig)` | `void` | Register a namespace. Restores from SQLite if `persist` is true |
| `has` | `(namespace: string, key: string)` | `boolean` | Check if a key exists and is not expired |
| `isDuplicate` | `(namespace: string, key: string)` | `boolean` | Check-and-set: returns true if key was already present |
| `markSeen` | `(namespace: string, key: string)` | `void` | Mark a key as seen without returning duplicate status |
| `delete` | `(namespace: string, key: string)` | `boolean` | Remove a specific key |
| `clear` | `(namespace: string)` | `void` | Clear all entries in a namespace |
| `metrics` | `(namespace: string)` | `DedupMetrics \| null` | Get hit/miss/eviction stats for a namespace |
| `allMetrics` | `()` | `Record<string, DedupMetrics>` | Get metrics for all namespaces |

## Invariants

1. **Bounded memory**: Each namespace enforces a `maxSize` (default 1000). When capacity is reached, the least-recently-used entry is evicted before inserting a new one
2. **TTL expiry**: Entries expire after `ttlMs` (default 5 minutes). Expired entries are treated as absent on `has()` checks and pruned by the background timer
3. **LRU promotion**: Accessing an entry via `has()` promotes it to most-recently-used, extending its survival against eviction
4. **Namespace isolation**: Each namespace has independent capacity, TTL, and metrics. Operations on one namespace never affect another
5. **Singleton pattern**: `DedupService.global()` always returns the same instance. `init()` is idempotent — subsequent calls return the existing instance
6. **Auto-registration**: `has()`, `isDuplicate()`, and `markSeen()` auto-register unknown namespaces with default config
7. **Persistence is opt-in**: Only namespaces with `persist: true` write to SQLite. Non-persistent namespaces are memory-only
8. **Graceful shutdown**: `stop()` flushes all dirty persistent namespaces before clearing timers

## Behavioral Examples

### Scenario: Basic deduplication

- **Given** an empty DedupService
- **When** `isDuplicate("polling", "issue-123")` is called
- **Then** returns `false` (first time seen)
- **When** `isDuplicate("polling", "issue-123")` is called again
- **Then** returns `true` (duplicate)

### Scenario: TTL expiry

- **Given** a namespace with `ttlMs: 1000` (1 second)
- **When** `markSeen("ns", "key1")` is called
- **And** 1.5 seconds elapse
- **Then** `has("ns", "key1")` returns `false` (expired)

### Scenario: LRU eviction at capacity

- **Given** a namespace with `maxSize: 2`
- **When** keys "a", "b", "c" are added in order
- **Then** key "a" is evicted (oldest)
- **And** `has("ns", "a")` returns `false`
- **And** `has("ns", "b")` returns `true`

### Scenario: SQLite persistence across restarts

- **Given** a namespace registered with `persist: true` and a Database handle
- **When** `markSeen("ns", "key1")` is called and `stop()` flushes to DB
- **And** a new DedupService is created with the same DB
- **And** the namespace is registered again with `persist: true`
- **Then** `has("ns", "key1")` returns `true` (restored from DB)

### Scenario: Cross-namespace isolation

- **Given** two namespaces "polling" and "messaging"
- **When** `markSeen("polling", "id-1")` is called
- **Then** `has("messaging", "id-1")` returns `false`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `metrics()` on unregistered namespace | Returns `null` |
| `delete()` on unregistered namespace | Returns `false` |
| `clear()` on unregistered namespace | No-op |
| SQLite restore failure | Logs error, continues with empty cache |
| SQLite persist failure | Logs error, retries on next persist interval |
| `register()` called twice for same namespace | Second call is a no-op |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` for optional persistence |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `DedupService.init(db)` at startup |
| `server/polling/service.ts` | `DedupService.global()` for mention dedup |
| `server/slack/bridge.ts` | `DedupService.global()` for message dedup |
| `server/mcp/tool-handlers/messaging.ts` | `DedupService.global()` for send_message dedup |
| `server/algochat/bridge.ts` | `DedupService.global()` for on-chain message dedup |
| `server/algochat/psk.ts` | `DedupService.global()` for PSK message dedup |

## Database Tables

### dedup_state (self-managed, created via `CREATE TABLE IF NOT EXISTS` at init)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| namespace | TEXT | NOT NULL, PK | Dedup namespace identifier |
| key | TEXT | NOT NULL, PK | The deduplicated key |
| expires_at | INTEGER | NOT NULL | Unix timestamp (ms) when this entry expires |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| *(none)* | — | Configuration is per-namespace via `DedupNamespaceConfig` at registration time |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-24 | corvid-agent | Initial spec |
