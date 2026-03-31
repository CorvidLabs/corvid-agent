# Dashboard — Context

## Why This Module Exists

Operators need visibility into what agents know and remember. The dashboard's unified memory view combines the former Brain Viewer and Memory Browser into a single interface that shows all agent memories across both storage tiers (on-chain and SQLite), their sync status, and relationships.

## Architectural Role

The dashboard is a **read-only observability layer** — it queries the memory system and presents it visually. It doesn't modify memories; it just makes them inspectable.

## Key Design Decisions

- **Unified view**: Merged two separate views (Brain Viewer + Memory Browser) into one. Operators shouldn't have to switch between views to understand an agent's memory state.
- **Three view modes**: Overview (stats), Browse (searchable list), and 3D (spatial graph). Different modes serve different needs — quick health check vs. deep exploration.
- **Sync health indicators**: Shows whether on-chain and SQLite memories are in sync, which is critical for debugging memory issues.

## Relationship to Other Modules

- **Memory**: Reads from both the ARC-69 on-chain memory and the SQLite agent_memories table.
- **Routes**: Dashboard endpoints live under `/api/dashboard/` with dashboard auth guard.
- **Client**: The Angular frontend renders the memory views using data from these API endpoints.
