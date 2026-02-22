---
module: marketplace-federation
version: 1
status: draft
files:
  - server/marketplace/federation.ts
db_tables:
  - federated_instances
  - marketplace_listings
depends_on:
  - specs/marketplace/service.spec.md
  - specs/db/schema.spec.md
---

# Marketplace Federation

## Purpose

Enables cross-instance marketplace discovery by syncing published listings from remote corvid-agent instances via HTTP. Manages registration, periodic sync, and lifecycle of federated instances. Federated listings are stored locally with a non-null `instance_url` to distinguish them from local listings.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `MarketplaceFederation` | Federation instance management and listing sync |

#### MarketplaceFederation Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `registerInstance` | `(url: string, name: string)` | `FederatedInstance` | Register (or update) a remote instance; validates URL |
| `removeInstance` | `(url: string)` | `boolean` | Remove instance and all its cached listings |
| `getInstance` | `(url: string)` | `FederatedInstance \| null` | Get a single instance record |
| `listInstances` | `()` | `FederatedInstance[]` | All instances ordered by name |
| `syncInstance` | `(url: string)` | `Promise<number>` | Fetch and cache listings from one instance; returns count synced |
| `syncAll` | `()` | `Promise<{ synced: number; failed: number }>` | Sync all registered instances |
| `getFederatedListings` | `(limit?: number)` | `FederatedListing[]` | Get cached federated listings (default limit 50) |
| `startPeriodicSync` | `(intervalMs?: number)` | `void` | Start interval-based sync (default 5 min) |
| `stopPeriodicSync` | `()` | `void` | Stop interval-based sync |

## Invariants

1. Federation URLs must use `http:` or `https:` protocol.
2. Private/loopback addresses are rejected (localhost, 127.0.0.1, ::1, 0.0.0.0, 10.x, 192.168.x, 172.16-31.x, 169.254.x, *.local) to prevent SSRF.
3. URLs are normalized by stripping trailing slashes before storage.
4. `syncInstance()` performs a full replace: deletes all existing listings for that `instance_url`, then inserts fresh ones.
5. Federated listing IDs are prefixed `fed-{url}-{originalId}` to avoid collision with local listings.
6. On sync failure, the instance status is set to `'unreachable'`; on success, `'active'`.
7. `removeInstance()` cascade-deletes all cached listings for that instance.
8. `getFederatedListings()` returns listings where `instance_url IS NOT NULL`, ordered by `avg_rating DESC, use_count DESC`.
9. Periodic sync defaults to 5-minute interval and is idempotent (calling `startPeriodicSync` twice does not create two timers).

## Behavioral Examples

### Scenario: Register and sync a remote instance

- **Given** remote instance at `https://other.example.com` has 3 published listings
- **When** `registerInstance('https://other.example.com/', 'Other')` then `syncInstance('https://other.example.com/')` is called
- **Then** instance is stored with normalized URL `https://other.example.com`, 3 listings are cached with `instance_url = 'https://other.example.com'`

### Scenario: Sync failure marks instance unreachable

- **Given** instance `https://down.example.com` is registered
- **When** `syncInstance('https://down.example.com')` fails (HTTP error or network error)
- **Then** instance status is updated to `'unreachable'`, returns 0

### Scenario: SSRF prevention

- **Given** a caller tries to register `http://192.168.1.1/api`
- **When** `registerInstance('http://192.168.1.1/api', 'Internal')` is called
- **Then** throws Error: "Federation URLs must not point to private or loopback addresses"

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Invalid URL format | Throws `Error('Invalid URL')` |
| Private/loopback address | Throws `Error('Federation URLs must not point to private or loopback addresses')` |
| Non-http(s) protocol | Throws `Error('Federation URLs must use http or https protocol')` |
| Remote instance unreachable | Sets status to `'unreachable'`, logs warning, returns 0 |
| Instance not found on remove | Returns false |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | Database queries |
| `server/lib/logger.ts` | `createLogger()` |
| Global `fetch` | HTTP requests to remote instances |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/marketplace.ts` | All federation methods |

## Database Tables

### federated_instances

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| url | TEXT | PRIMARY KEY | Normalized instance URL |
| name | TEXT | NOT NULL | Human-readable instance name |
| last_sync_at | TEXT | | ISO 8601 timestamp of last successful sync |
| listing_count | INTEGER | NOT NULL DEFAULT 0 | Number of listings from last sync |
| status | TEXT | NOT NULL DEFAULT 'active' | `'active'` or `'unreachable'` |

## Configuration

No environment variables. Sync interval is configured via `startPeriodicSync()` parameter (default 300000ms / 5 minutes).

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-21 | corvid-agent | Initial spec |
