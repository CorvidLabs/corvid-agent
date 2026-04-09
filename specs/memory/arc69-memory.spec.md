---
module: arc69-memory
version: 1
status: active
files:
  - server/memory/arc69-store.ts
  - server/db/migrations/094_arc69_memory_asa.ts
db_tables:
  - agent_memories
depends_on: []
tracks: [1458, 1511]
---

# ARC-69 Long-Term Memory

## Purpose

Replace immutable plain-transaction memory storage on **localnet** with mutable ARC-69 ASAs, giving agents true CRUD over their on-chain memories. Each memory becomes an Algorand Standard Asset whose ARC-69 metadata (stored in the most recent `acfg` transaction note) holds the encrypted memory content. Memories can be created, read, updated, and deleted on-chain — eliminating the current problem of immortal correction chains.

This module coexists with the existing plain-transaction ("permanent") memory path. The two tiers are:

| Tier | Storage | Mutability | Use Case |
|------|---------|-----------|----------|
| **Permanent** | Plain self-to-self transaction (current) | Immutable | Messages to self, audit trail, things that should never change |
| **Long-term** | ARC-69 ASA (this spec) | Mutable (update/delete) | Agent memories — team info, preferences, learned context, anything that may need correction |

**Localnet only.** Testnet/mainnet memory continues using the existing plain-transaction path.

## Background: ARC-69 Standard

[ARC-69](https://arc.algorand.foundation/ARCs/arc-0069) defines a community standard for Algorand NFT metadata:

- Metadata is stored in the **note field** of the most recent **asset configuration transaction** (`acfg`)
- To read metadata: find the latest `acfg` txn for the ASA and parse the note
- To update metadata: send a new `acfg` txn with the updated note (requires the **manager address** to be set)
- To delete: either clear the note (soft delete) or destroy the ASA entirely (hard delete)
- The note is a JSON object, but we extend it to store encrypted memory content

## Privacy Model

On localnet, **any agent can read any transaction**. Without encryption, an agent could index the entire chain and read every other agent's memories — defeating the purpose of distributed, private agents.

Memory content is encrypted using **AlgoChat's self-to-self channel** (PSK encryption). This means:

- **Visible to everyone**: ASA exists, unit name `CRVMEM`, ARC-69 structure, memory key name
- **Encrypted (agent-only)**: actual memory content, protected by that agent's PSK

This uses the same AlgoChat envelope format as all other on-chain communication, keeping one encryption path instead of introducing a parallel crypto system. Each agent's self-to-self PSK is unique to that agent, so only the owning agent can decrypt its own memories.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Memory Save Request                   │
│              (via MCP tool or MemoryManager)             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Is localnet?  │
              └───┬────────┬───┘
                  │yes     │no
                  ▼        ▼
         ┌──────────┐  ┌──────────────────┐
         │ ARC-69   │  │ Plain txn        │
         │ ASA path │  │ (existing path)  │
         └────┬─────┘  └──────────────────┘
              │
              ▼
     ┌─────────────────┐
     │ Has existing     │
     │ ASA for key?     │
     └──┬───────────┬───┘
        │yes        │no
        ▼           ▼
   ┌──────────┐ ┌──────────────┐
   │ acfg txn │ │ Mint new ASA │
   │ (update) │ │ (create)     │
   └──────────┘ └──────────────┘
```

## Public API

### Exported Functions — `server/memory/arc69-store.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createMemoryAsa` | `(ctx: Arc69Context, key: string, content: string)` | `Promise<{ asaId: number; txid: string }>` | Mint a new ASA representing a memory. Sets agent wallet as manager. Stores encrypted content in ARC-69 note |
| `updateMemoryAsa` | `(ctx: Arc69Context, asaId: number, content: string)` | `Promise<{ txid: string }>` | Send `acfg` txn with updated ARC-69 note. ASA ID unchanged |
| `deleteMemoryAsa` | `(ctx: Arc69Context, asaId: number, mode: 'soft' \| 'hard')` | `Promise<{ txid: string }>` | Soft: `acfg` with empty note. Hard: destroy ASA entirely |
| `readMemoryAsa` | `(ctx: Arc69Context, asaId: number)` | `Promise<Arc69Memory \| null>` | Fetch latest `acfg` txn for ASA, decrypt note, return content |
| `listMemoryAsas` | `(ctx: Arc69Context)` | `Promise<Arc69Memory[]>` | List all memory ASAs created by this agent (query by creator address) |
| `resolveAsaForKey` | `(db: Database, agentId: string, key: string)` | `number \| null` | Look up the ASA ID for a given memory key from the local DB mapping |

### Exported Types

| Type | Description |
|------|-------------|
| `Arc69Context` | Context object containing db, agentId, algodClient, indexerClient, chatAccount, serverMnemonic, network |
| `Arc69Memory` | `{ asaId: number; key: string; content: string; txid: string; round: number; timestamp: string }` |
| `Arc69NotePayload` | `{ standard: 'arc69'; description: string; mime_type: 'application/octet-stream'; properties: { key: string; agent_id: string; envelope: string; v: number } }` |

### Exported Functions — `server/db/migrations/094_arc69_memory_asa.ts`

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `up` | `(db: Database)` | `void` | Add `asa_id` column to `agent_memories` and create partial index on `(agent_id, asa_id)` |
| `down` | `(db: Database)` | `void` | Drop the ASA index and remove the `asa_id` column |

### ARC-69 Note Schema

```json
{
  "standard": "arc69",
  "description": "corvid-agent memory",
  "mime_type": "application/octet-stream",
  "properties": {
    "key": "team-leif",
    "agent_id": "357251b1-...",
    "envelope": "<AlgoChat self-to-self encrypted envelope>",
    "v": 1
  }
}
```

The `envelope` field contains the memory content encrypted via AlgoChat's self-to-self channel (PSK-encrypted). This is the same envelope format used for all AlgoChat messages — no separate encryption path. Only the agent that created the memory can decrypt the envelope with its own PSK.

## Database Changes

### agent_memories — new column

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| asa_id | INTEGER | DEFAULT NULL | ARC-69 ASA ID for long-term memories (localnet only). NULL for permanent (plain txn) memories |

### New index

| Index | Columns | Type | Description |
|-------|---------|------|-------------|
| idx_agent_memories_asa | (agent_id, asa_id) | INDEX | Fast lookup of memory by ASA ID |

Migration adds the column and index. Existing memories with `txid` but no `asa_id` are plain-transaction (permanent) memories and remain unchanged.

## Invariants

1. **One ASA per memory key per agent.** The `(agent_id, key)` unique constraint still holds. Each key maps to at most one ASA ID.
2. **Manager address = agent wallet.** The ASA's manager address must always be the agent's own wallet, ensuring only the agent can update or destroy its memories.
3. **Reserve/freeze/clawback cleared.** Memory ASAs set `reserve`, `freeze`, and `clawback` to empty (zero address) at creation. Only `manager` is set.
4. **ARC-69 note is always valid JSON.** The note field of every `acfg` txn must be parseable as JSON conforming to `Arc69NotePayload`.
5. **Encryption via AlgoChat is mandatory.** Memory content is always encrypted using AlgoChat's self-to-self channel (PSK encryption) before being stored in the ARC-69 note. No separate crypto path — uses the same AlgoChat envelope as all other on-chain messages. This ensures only the owning agent can decrypt its memories, even though any agent can read localnet transactions.
6. **Localnet only.** ARC-69 memory operations are gated on `network === 'localnet'`. Other networks continue using plain transactions.
7. **Backward compatible.** Existing memories without `asa_id` continue to work. The recall/search path checks `asa_id` first (if present), then falls back to plain txn lookup.
8. **ASA total = 1, decimals = 0.** Each memory ASA is a unique non-fungible token (1 total supply, 0 decimals).
9. **Soft delete preserves ASA.** Soft-deleted memories retain the ASA (for potential future recovery) but have an empty/zeroed note. Hard delete destroys the ASA.
10. **SQLite is the index, chain is the source of truth.** The `asa_id` column in SQLite is a cache/index. The on-chain ASA metadata is authoritative. Sync restores from chain to SQLite.

## Behavioral Examples

### Scenario: Create a new long-term memory (localnet)

- **Given** agent is on localnet, no memory exists for key "team-leif"
- **When** `save_memory(key: "team-leif", content: "Leif — creator & lead architect")` is called
- **Then** a new ASA is minted with ARC-69 note containing encrypted content
- **And** `agent_memories` row is created with `asa_id` set to the new ASA ID
- **And** `txid` is set to the creation transaction ID
- **And** status is `confirmed`

### Scenario: Update an existing long-term memory

- **Given** agent has memory "team-leif" with `asa_id = 42`
- **When** `save_memory(key: "team-leif", content: "Leif — creator, lead architect, built core systems")` is called
- **Then** an `acfg` transaction is sent for ASA 42 with updated ARC-69 note
- **And** SQLite content and txid are updated
- **And** the old content is gone — only the latest `acfg` note matters

### Scenario: Delete (forget) a memory

- **Given** agent has memory "old-preference" with `asa_id = 99`
- **When** `delete_memory(key: "old-preference", mode: "soft")` is called
- **Then** an `acfg` transaction is sent for ASA 99 with an empty note
- **And** SQLite row is marked `archived = 1`
- **And** ASA still exists but has no readable content

### Scenario: Hard delete a memory

- **Given** agent has memory "sensitive-info" with `asa_id = 77`
- **When** `delete_memory(key: "sensitive-info", mode: "hard")` is called
- **Then** an asset destroy transaction is sent for ASA 77
- **And** SQLite row is deleted
- **And** ASA no longer exists on-chain

### Scenario: Save permanent memory (plain transaction)

- **Given** agent is on localnet
- **When** `send_message_to_self(content: "Council decision: Claude-first model strategy")` is called
- **Then** a plain self-to-self transaction is sent (current behavior, unchanged)
- **And** no ASA is created
- **And** transaction is immutable — this is permanent memory

### Scenario: Recall memory prefers ARC-69 when available

- **Given** agent has memory "team-kyn" with `asa_id = 50` and also an older plain txn
- **When** `recall_memory(key: "team-kyn")` is called
- **Then** the ARC-69 ASA metadata is read (latest `acfg` note for ASA 50)
- **And** the plain txn is ignored (ARC-69 is authoritative for this key)

### Scenario: Sync restores ARC-69 memories from chain

- **Given** SQLite was wiped but agent has 5 memory ASAs on localnet
- **When** `sync_on_chain_memories()` is called
- **Then** all 5 ASAs are discovered by querying created assets for agent's address
- **And** latest `acfg` note is read and decrypted for each
- **And** SQLite rows are created with correct `asa_id`, `key`, `content`, and `txid`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| ASA creation fails (insufficient funds) | Falls back to plain txn path. Memory saved to SQLite as `pending` |
| `acfg` update fails | SQLite content is updated, status set to `failed`, retry on next sync tick |
| ASA destroy fails | Log warning, SQLite row retained with `archived = 1` |
| Indexer unavailable during read | Fall back to SQLite cached content |
| ARC-69 note is not valid JSON | Log warning, skip memory during sync/list. Do not crash |
| AlgoChat envelope decryption fails | Log warning, skip memory. May indicate PSK rotation — user should re-save |
| ASA manager address mismatch | Refuse to update. Log error. This indicates a misconfiguration |
| Network is not localnet | Silently use existing plain-transaction path. No ARC-69 operations |

## MCP Tool Changes

### `save_memory` — updated behavior

On localnet:
1. Save to SQLite (existing)
2. Check if `asa_id` exists for this key
   - **Yes**: send `acfg` update txn → update `txid` in SQLite
   - **No**: mint new ASA → store `asa_id` and `txid` in SQLite

On other networks: unchanged (plain txn path).

### `recall_memory` — updated behavior

On localnet with `asa_id` present:
1. Try reading latest `acfg` note from indexer (fresh from chain)
2. Fall back to SQLite cached content if indexer is unavailable

Display includes `(ASA: {asaId})` tag instead of raw txid for long-term memories.

### `delete_memory` — new tool

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | yes | Memory key to delete |
| mode | string | no | `"soft"` (default) or `"hard"`. Soft clears metadata; hard destroys ASA |

Only works for memories with `asa_id` (long-term). Permanent (plain txn) memories cannot be deleted — return an error explaining this.

### `sync_on_chain_memories` — updated behavior

In addition to scanning self-to-self transactions (permanent memories), also:
1. Query indexer for ASAs created by agent's wallet
2. For each ASA, read latest `acfg` note
3. Parse ARC-69 payload, decrypt content
4. Upsert into SQLite with `asa_id`

## ASA Configuration Details

### Creation parameters

```typescript
{
  sender: agentWalletAddress,
  total: 1,                          // NFT — unique
  decimals: 0,                       // Non-divisible
  defaultFrozen: false,
  manager: agentWalletAddress,       // Required for acfg updates
  reserve: undefined,                // Cleared
  freeze: undefined,                 // Cleared
  clawback: undefined,               // Cleared
  unitName: 'CRVMEM',               // "Corvid Memory"
  assetName: `mem:${key}`,          // Human-readable (max 32 chars)
  assetURL: '',                      // No external URL needed
  note: arc69JsonNote,               // ARC-69 JSON with encrypted content
  suggestedParams: await algod.getTransactionParams().do(),
}
```

### Update (acfg) parameters

```typescript
{
  sender: agentWalletAddress,
  assetIndex: asaId,
  manager: agentWalletAddress,       // Must re-specify to retain manager role
  reserve: undefined,
  freeze: undefined,
  clawback: undefined,
  note: updatedArc69JsonNote,
  suggestedParams: await algod.getTransactionParams().do(),
}
```

### Soft delete (acfg with empty note)

```typescript
{
  sender: agentWalletAddress,
  assetIndex: asaId,
  manager: agentWalletAddress,
  note: new Uint8Array(0),           // Empty note = "forgotten"
  suggestedParams: await algod.getTransactionParams().do(),
}
```

### Hard delete (asset destroy)

```typescript
{
  sender: agentWalletAddress,        // Must be creator
  assetIndex: asaId,
  suggestedParams: await algod.getTransactionParams().do(),
}
```

## MemorySyncService Changes

The existing `MemorySyncService` gains awareness of ARC-69:

1. **Pending memories with no `asa_id`**: Attempt ASA creation (mint) instead of plain txn send
2. **Failed memories with `asa_id`**: Attempt `acfg` update retry
3. **Sync tick stats**: Track `asaCreated`, `asaUpdated` alongside existing `synced`/`failed`/`skipped`

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `algosdk` | `makeAssetCreateTxnWithSuggestedParamsFromObject`, `makeAssetConfigTxnWithSuggestedParamsFromObject`, `makeAssetDestroyTxnWithSuggestedParamsFromObject` |
| `server/algochat/agent-wallet.ts` | `getAgentChatAccount()` for wallet access |
| `server/algochat/service.ts` | `algorandService` for algod/indexer clients |
| `server/algochat/envelope.ts` | AlgoChat envelope encryption/decryption (PSK self-to-self channel) |
| `server/db/agent-memories.ts` | `saveMemory()`, `recallMemory()`, `updateMemoryTxid()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/memory.ts` | `createMemoryAsa`, `updateMemoryAsa`, `deleteMemoryAsa`, `readMemoryAsa`, `resolveAsaForKey` |
| `server/db/memory-sync.ts` | `createMemoryAsa`, `updateMemoryAsa` (for pending memory retry) |
| `server/memory/index.ts` | `readMemoryAsa`, `listMemoryAsas` (for MemoryManager integration) |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| (none new) | — | ARC-69 memory is auto-enabled on localnet. No new configuration required |

## Migration

### SQL migration (new file in `server/db/migrations/`)

```sql
-- Add asa_id column for ARC-69 long-term memories
ALTER TABLE agent_memories ADD COLUMN asa_id INTEGER DEFAULT NULL;

-- Index for ASA lookups
CREATE INDEX IF NOT EXISTS idx_agent_memories_asa
  ON agent_memories(agent_id, asa_id)
  WHERE asa_id IS NOT NULL;
```

## Implementation Order

1. **Database migration** — add `asa_id` column and index
2. **`arc69-store.ts`** — core CRUD functions (create, read, update, delete, list, resolve)
3. **Update `memory.ts` tool handler** — route localnet saves through ARC-69 path
4. **Add `delete_memory` MCP tool** — new tool for forgetting memories
5. **Update `MemorySyncService`** — ARC-69-aware pending memory processing
6. **Update `on-chain-transactor.ts`** — add `listMemoryAsas` query method using indexer
7. **Update `sync_on_chain_memories`** — scan ASAs in addition to plain txns
8. **Tests** — unit tests for arc69-store, integration tests for full save/recall/update/delete cycle

## Future Considerations

- **Mainnet opt-in**: If localnet proves stable, could extend to testnet/mainnet (ASA creation costs 0.1 ALGO + MBR)
- **Memory categories as ASA groups**: Could use unit name prefixes (`CRVMEM:team`, `CRVMEM:pref`) for categorization
- **Cross-agent memory sharing**: ASAs can be transferred between agents (opt-in + transfer), enabling shared memories
- **Memory expiry via ASA freeze**: Could freeze memories after N days to signal staleness without deleting

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-19 | corvid-agent | Initial spec — Kyn's idea, Leif's architecture direction |
| 2026-03-19 | corvid-agent | Updated: use AlgoChat PSK encryption (not raw AES) for privacy — agents can't read each other's memories on shared localnet |
