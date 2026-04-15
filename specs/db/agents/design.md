---
spec: observations.spec.md
sources:
  - server/db/agents.ts
  - server/db/observations.ts
  - server/db/agent-memories.ts
  - server/db/personas.ts
  - server/db/contacts.ts
  - server/db/plugins.ts
  - server/db/skill-bundles.ts
  - server/db/mcp-servers.ts
  - server/db/agent-blocklist.ts
  - server/db/variants.ts
  - server/db/agent-library.ts
  - server/db/memory-sync.ts
---

## Layout

Data-access layer for all agent-related entities. Multiple focused files, each owning one DB table or closely related table group. No cross-file imports within this layer — each file is independently imported by service/route layers.

```
server/db/
  agents.ts          — Agent CRUD, wallet management, funding
  observations.ts    — Short-term memory observations (expiry, access tracking)
  agent-memories.ts  — Long-term ARC-69 memories (list, search, recall, FTS5)
  personas.ts        — Composable persona definitions and assignments
  contacts.ts        — Cross-platform contact directory
  plugins.ts         — Agent plugin configurations
  skill-bundles.ts   — Reusable skill bundle definitions
  mcp-servers.ts     — Custom MCP server configurations per agent
  agent-blocklist.ts — Per-agent conversation blocklists
  variants.ts        — Agent model variants and assignments
  agent-library.ts   — CRVLIB shared knowledge library
  memory-sync.ts     — MemorySyncService (SQLite ↔ on-chain sync service)
```

## Components

### `agents.ts` — Core Agent CRUD

Foundational agent data access. All higher-level services import from here.

Key behaviors:
- UUID generation via `crypto.randomUUID()`
- Tenant isolation via `withTenantFilter` / `validateTenantOwnership`
- Transactional deletion with cascade + manual cleanup for non-cascade tables
- JSON serialization for `customFlags` and `mcpToolPermissions` columns
- Boolean mapping for SQLite integers (`algochatEnabled`, `voiceEnabled`, etc.)
- AlgoChat defaults: new agents have `algochatEnabled: true`, `algochatAuto: true`

### `observations.ts` — Short-Term Memory

Short-lived observations with automatic expiry tracking and access-count promotion. Observations can graduate to long-term memories when frequently accessed.

### `agent-memories.ts` — Long-Term Memory

ARC-69 on-chain memory records stored in SQLite as a sync cache. Provides FTS5 full-text search (`agent_memories_fts` virtual table) with LIKE fallback. Supports pagination, tier filtering, and decay score computation hooks.

### `memory-sync.ts` — Sync Service

`MemorySyncService` runs as a background service, polling for pending memories and syncing them to Algorand (localnet ARC-69 ASAs). Provides `getStats()` used by the dashboard sync-status endpoint.

### `personas.ts` — Composable Personas

Persona definitions (name, system prompt, tone) and agent assignment records. Personas are injected at session start by `server/process/manager.ts`.

### `contacts.ts` — Contact Directory

Cross-platform contact records with platform link associations (Discord, Telegram, AlgoChat).

## Tokens

| Constant | Description |
|----------|-------------|
| `algochatEnabled` default | `true` — all new agents are AlgoChat-enabled |
| `algochatAuto` default | `true` — all new agents auto-respond on AlgoChat |
| FTS5 fallback | LIKE search used when FTS5 fails |
| Observation expiry | Stored as ISO timestamp in `expires_at` column |

## Assets

| Resource | Description |
|----------|-------------|
| `agents` table | Primary agent records |
| `agent_memories` table | Long-term memory sync cache |
| `agent_memories_fts` | FTS5 virtual table with INSERT/DELETE/UPDATE sync triggers |
| `memory_observations` table | Short-term observation records |
| `personas` + `agent_persona_assignments` | Persona definition and assignment tables |
| `contacts` + `contact_platform_links` | Contact directory tables |
| `plugins` + `plugin_capabilities` | Plugin configuration tables |
| `skill_bundles` | Reusable skill bundle definitions |
| `mcp_server_configs` | Per-agent MCP server configurations |
| `agent_blocklist` | Per-agent conversation blocklists |
| `agent_variants` + `agent_variant_assignments` | Model variant tables |
| `agent_library` | CRVLIB shared knowledge entries |
