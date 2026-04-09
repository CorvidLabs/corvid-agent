---
spec: arc69-memory.spec.md
---

## Product Requirements

- Agents can remember things across restarts and sessions — storing facts, preferences, and knowledge that persist indefinitely on the blockchain.
- Agents can recall past knowledge by searching for it, even if they don't remember the exact label it was stored under.
- Teams of agents share a common knowledge library so that useful guides, decisions, and reference material are available to every agent without duplication.
- Important knowledge that gets referenced often is automatically promoted to permanent storage, so nothing valuable is lost due to memory expiry.
- Long documents that exceed single-message size limits are automatically split into pages and reassembled seamlessly when recalled.

## User Stories

- As a team agent, I want to save encrypted memories on-chain using ARC-69 ASAs so that my knowledge persists across restarts and is tamper-evident
- As a team agent, I want to recall memories by key or semantic query so that I can retrieve previously stored knowledge without knowing the exact key
- As a team agent, I want to publish plaintext library entries (CRVLIB) that any other agent can read so that team knowledge is shared transparently
- As an agent operator, I want memory graduation to automatically promote frequently-accessed short-term memories to long-term storage so that important knowledge is preserved without manual curation
- As a team agent, I want to create multi-page "books" in the shared library for long-form content so that guides and runbooks exceeding the 1024-byte note limit can be stored
- As a platform administrator, I want a `LibrarySyncService` that periodically indexes all CRVLIB ASAs from localnet into SQLite so that agents have fast local access to shared library content

## Acceptance Criteria

- `corvid_save_memory` mints a CRVMEM ASA with content encrypted via AlgoChat PSK (self-to-self encryption) and stores the key-to-ASA mapping in `agent_memories`
- `corvid_recall_memory` supports three modes: recall by exact key, recall by semantic query (searching content), and list recent memories
- CRVMEM entries are readable only by the authoring agent; CRVLIB entries are plaintext and readable by any agent
- CRVLIB ASAs use unit name `CRVLIB` and asset name format `lib:{key}`; CRVMEM ASAs use `CRVMEM` and `mem:{key}`
- ARC-69 note payloads are limited to 1024 bytes; content exceeding approximately 700 bytes (after JSON overhead) is rejected with a message directing the user to book chaining
- `createLibraryEntry` mints a CRVLIB ASA with plaintext ARC-69 note and creates a corresponding `agent_library` row with the ASA ID
- `readBook` fetches all pages of a book by querying `book=bookKey, page=1` in the local DB and following the `next` ASA ID chain
- `appendPage` mints a new page ASA, updates page 1's `total` count, and wires `prev`/`next` pointers between pages
- Only the ASA manager (author agent's wallet) can update or delete library entries
- `loadSharedLibrary` reads all non-archived entries from `agent_library` at boot and returns a formatted context string grouped by category (standards, references, guides, decisions, runbooks)
- `LibrarySyncService` queries the Algorand indexer for all assets with unit name `CRVLIB` and upserts entries into the `agent_library` table
- The `agent_library` table enforces UNIQUE constraints on both `key` and `asa_id` columns
- Memory graduation promotes memories that exceed an access frequency threshold from short-term to long-term storage

## Constraints

- CRVLIB is gated on `network === 'localnet'`; it requires a fast, free chain for practical use
- The `agent_library` SQLite table is a local cache; the on-chain ASA is authoritative
- Book key convention requires all pages use `{bookKey}/page-{n}` suffix format
- `deleteLibraryEntry` supports both soft delete (empty note, `archived=1`) and hard delete (ASA destroy + row removal)
- Indexer fallback: when the Algorand indexer is unavailable, library reads fall back to SQLite cached content

## Out of Scope

- Encryption key management and AlgoChat PSK rotation
- Algorand mainnet or testnet deployment (localnet only)
- Full-text semantic search indexing (memory recall uses simple substring matching)
- Cross-agent memory sharing for CRVMEM (private memories are author-only by design)
- MCP tool handler implementation for `corvid_library_*` tools (classified as Layer 1 governance, requires council vote)
