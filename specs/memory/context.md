# Memory — Context

## Why This Module Exists

Agents need persistent knowledge that survives across sessions and restarts. The memory module provides a two-tier system: short-term memories in SQLite (fast, mutable) and long-term memories as ARC-69 ASAs on the Algorand localnet (tamper-evident, verifiable). It also provides the shared library (CRVLIB) for team-wide knowledge sharing.

## Architectural Role

Memory is a **core data service** — it's how agents remember things. It sits alongside the database module as one of the two primary persistence mechanisms (DB for operational state, memory for agent knowledge).

## Key Design Decisions

- **Two-tier architecture**: SQLite for speed and mutability, blockchain for permanence and verifiability. Memories graduate from short-term to long-term based on access frequency.
- **ARC-69 format**: Uses Algorand's ARC-69 standard for metadata, making memories queryable by blockchain indexers.
- **Encryption for private memories (CRVMEM)**: Private memories are encrypted with the agent's AlgoChat PSK, readable only by the authoring agent.
- **Plaintext shared library (CRVLIB)**: Team knowledge is stored unencrypted so any agent can read it. Organized by category (standards, references, guides, decisions, runbooks).
- **Book chaining**: Content exceeding the 1024-byte note limit is split into linked pages, forming a "book" that can be read sequentially.
- **Memory decay**: Memories that aren't accessed decay over time, automatically cleaning up stale knowledge.

## Relationship to Other Modules

- **DB**: The `agent_memories` and `agent_library` tables are the SQLite tier.
- **AlgoChat**: Uses the same Algorand localnet for on-chain storage.
- **Dashboard**: The memory brain viewer reads from both tiers.
- **Improvement**: Stores and retrieves improvement history as memories.
- **MCP**: Memory tools are exposed as MCP tools for agent use.
