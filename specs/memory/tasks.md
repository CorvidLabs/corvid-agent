---
spec: arc69-memory.spec.md
---

## Active Tasks

- [ ] Shared agent library (CRVLIB): implement cross-instance library sync for teams spanning multiple machines (#1511)
- [ ] On-chain transparency: surface memory ASA count, library entry index, and graduation events in the dashboard (#1458)
- [ ] Upgrade memory recall from substring matching to lightweight semantic/embedding-based search
- [ ] Add `corvid_library_*` MCP tool handlers — currently classified as Layer 1 governance, requires council vote to unlock

## Completed Tasks

- [x] CRVMEM ASA minting with PSK encryption (self-to-self via AlgoChat)
- [x] CRVLIB plaintext ASA entries with `agent_library` SQLite cache
- [x] `LibrarySyncService` periodic indexer sync of all CRVLIB assets
- [x] Book/page chaining for content exceeding 1024-byte note limit
- [x] Memory graduation from short-term observations to long-term ARC-69 storage
- [x] `loadSharedLibrary` grouped by category (standards, references, guides, decisions, runbooks)
