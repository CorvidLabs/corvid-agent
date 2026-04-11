---
module: block-explorer-routes
version: 1
status: draft
files:
  - server/routes/block-explorer.ts
depends_on:
  - specs/algochat/bridge.spec.md
---

# Block Explorer Routes

## Purpose

Read-only API endpoints exposing on-chain Algorand data (transactions, ASAs, wallets) for a block explorer UI. All endpoints live under `/api/explorer/` and require an active AlgoChat bridge with an indexer client. Decodes ARC-69 metadata and AlgoChat encrypted envelopes, classifies transactions by type (message, memory, library), and enriches wallet data with on-chain balances.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `Arc69Note` | ARC-69 standard note with `standard`, `description`, `mime_type`, `properties` fields |
| `ExplorerTxType` | `'message' \| 'memory' \| 'library' \| 'unknown'` |
| `ExplorerNoteType` | `'algochat' \| 'arc69' \| 'none' \| 'other'` |
| `ExplorerTransaction` | Transaction with decoded note, type classification, and optional ASA info |
| `ExplorerAsset` | ASA with type classification (`CRVMEM`, `CRVLIB`, `other`) and optional metadata |
| `ExplorerAssetDetail` | Extends `ExplorerAsset` with `history` array of configuration transactions |
| `ExplorerWallet` | Wallet address with balance, min balance, asset count, and message count |
| `ExplorerWalletDetail` | Extends `ExplorerWallet` with recent transactions and owned assets |
| `ExplorerStats` | Aggregate stats: transaction count, CRVMEM/CRVLIB counts, wallet count, latest round |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleBlockExplorerRoutes` | `(req: Request, url: URL, db: Database, algochatBridge: AlgoChatBridge \| null)` | `Response \| Promise<Response> \| null` | Route handler for `/api/explorer/*`. Returns `null` for non-matching paths or non-GET methods. |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/explorer/stats` | Overview stats: CRVMEM/CRVLIB counts, wallet count, latest round |
| GET | `/api/explorer/transactions` | Paginated transaction list with type/sender/receiver/round filters |
| GET | `/api/explorer/transactions/:txid` | Single transaction detail |
| GET | `/api/explorer/assets` | Paginated CRVMEM/CRVLIB ASA list with type/creator/search filters |
| GET | `/api/explorer/assets/:id` | Single ASA detail with configuration history |
| GET | `/api/explorer/wallets` | Agent wallets with balances and message counts |
| GET | `/api/explorer/wallets/:address` | Wallet detail with balance, recent transactions, owned assets |

## Key Behaviors

### Note Decoding
- Base64 note field is decoded to bytes.
- If bytes parse as JSON with `standard: 'arc69'`, classified as `arc69`.
- If bytes are >= 64 bytes and not JSON, classified as `algochat` (encrypted envelope).
- Empty or missing notes are `none`; other binary payloads are `other`.

### Transaction Classification
- `pay` transactions with `algochat` notes are classified as `message`.
- `acfg` transactions with `CRVMEM` unit name are `memory`.
- `acfg` transactions with `CRVLIB` unit name are `library`.
- `acfg` transactions with ARC-69 note containing `key` and `agent_id` properties are `memory`.
- All other transactions are `unknown`.

### Transaction List Filtering
- `type` — `message`, `memory`, or `library` (post-filtered after indexer query)
- `sender` / `receiver` — address filter via indexer
- `from_round` / `to_round` — round range filter
- `next` — pagination token from previous response
- `limit` — capped at 200, defaults to 50

### Asset List Filtering
- `type` — `CRVMEM` or `CRVLIB`; if omitted, queries both
- `creator` — filter by creator address
- `search` — case-insensitive substring match on name, unit name, or creator
- `limit` — capped at 200, defaults to 50

### Wallet Enrichment
- Wallet list pulls summaries from SQLite (`getWalletSummaries`), then enriches each with on-chain balance, min balance, and asset count from algod.
- Wallet detail additionally fetches created CRVMEM/CRVLIB assets and recent transactions from indexer.

## Invariants

1. Only GET requests to paths starting with `/api/explorer` are handled; all others return `null`.
2. If `algochatBridge` is null, returns 503 with descriptive error.
3. If indexer client is not configured, returns 503.
4. Limit is capped at 200 regardless of query parameter value.
5. All responses are JSON.
6. Individual sub-queries within endpoints use best-effort error handling — partial data is returned rather than failing entirely.
7. Transaction and asset not-found errors return 404.

## Behavioral Examples

- `GET /api/explorer/transactions?type=memory&limit=10` — queries indexer for `acfg` transactions, maps and post-filters to those with `CRVMEM` unit name, returns up to 10.
- `GET /api/explorer/transactions/TXID123` — looks up single transaction by ID, decodes note, returns classified transaction or 404.
- `GET /api/explorer/assets?type=CRVLIB&search=config` — queries CRVLIB ASAs, filters by case-insensitive substring match on name/unit/creator.
- `GET /api/explorer/assets/12345` — returns ASA detail with ARC-69 metadata and full acfg transaction history.
- `GET /api/explorer/wallets` — returns wallet list from DB summaries enriched with on-chain balances from algod.
- `GET /api/explorer/wallets/ABC123` — returns wallet detail with balance, recent transactions, and owned CRVMEM/CRVLIB assets.
- `GET /api/explorer/stats` — returns aggregate counts and latest round.
- `GET /api/explorer/transactions` with no AlgoChat bridge — returns 503 `"AlgoChat not configured"`.
- `POST /api/explorer/transactions` — returns `null` (non-GET, pass-through).

## Error Cases

| Condition | Behavior |
|-----------|----------|
| AlgoChat bridge null | Returns 503 |
| Indexer not configured | Returns 503 |
| Transaction not found | Returns 404 |
| Asset not found | Returns 404 |
| Indexer query failure | Returns 500 with error detail |
| Non-GET request | Returns `null` (pass-through) |
| Path outside `/api/explorer` | Returns `null` (pass-through) |
| Algod account lookup fails | Gracefully returns 0 balance (best-effort) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `algochat/bridge` | `AlgoChatBridge` for algod/indexer client access |
| `db/algochat-messages` | `getWalletSummaries` for wallet labels and message counts |
| `lib/response` | `json`, `safeNumParam` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `routes/index` | `handleBlockExplorerRoutes` registered as a top-level route handler |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-04-10 | Initial spec — 7 read-only endpoints for on-chain block explorer. |
