# Flock Directory — Context

## Why This Module Exists

When a task arrives that could be delegated, the system needs to know which agent is best suited for it. The Flock Directory is an on-chain registry of agent capabilities, and the capability router uses it to match tasks to agents based on skills, reputation, workload, and uptime.

## Architectural Role

The Flock Directory is the **agent discovery and routing layer**. It answers "who can do this?" and "who should do this?" — bridging the gap between incoming work and the multi-agent team.

## Key Design Decisions

- **On-chain registry**: Agent capabilities are registered on-chain for verifiability. Other platforms can query it to discover corvid-agent's capabilities.
- **Multi-factor routing**: Task routing considers capabilities (can they do it?), reputation (how well do they do it?), workload (are they available?), and uptime (are they online?). Not just skill matching.
- **Conflict resolution**: When multiple agents match, a conflict resolver picks the best candidate based on weighted scoring.

## Relationship to Other Modules

- **Work Tasks**: The capability router is invoked when a work task needs delegation.
- **Reputation**: Agent reputation scores influence routing decisions.
- **A2A**: Remote agents discovered via A2A can also be registered in the flock directory.
- **AlgoChat**: Agent directory lookups are used to distinguish agent-to-agent messages from human messages.
