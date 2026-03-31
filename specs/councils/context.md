# Councils — Context

## Why This Module Exists

Some decisions are too important for a single agent. Councils enable structured multi-agent deliberation — multiple agents discuss a topic, propose solutions, vote, and a synthesis is produced. This is the governance mechanism for the platform, used for architectural decisions, security reviews, and any task that benefits from diverse perspectives.

## Architectural Role

Councils are an **orchestration layer** — they coordinate multiple agent sessions through a defined lifecycle: responding → discussing → reviewing → synthesizing. Each stage has specific rules about who participates and how results are aggregated.

## Key Design Decisions

- **Stage-based lifecycle**: Councils progress through well-defined stages rather than free-form discussion. This prevents endless debate and ensures convergence.
- **Quorum requirements**: At least 2 agents required. This prevents rubber-stamp single-agent councils.
- **Opus for synthesis**: The synthesis stage uses the most capable model (Opus) to ensure the final output captures the nuance of the discussion.
- **45-minute safety timeout**: Prevents councils from running indefinitely if agents stall.

## Relationship to Other Modules

- **Process Manager**: Each participating agent runs as a managed process.
- **Providers**: Council stages use different models for different roles (Haiku for initial responses, Sonnet for discussion, Opus for synthesis).
- **AlgoChat**: Councils can be launched via `/council` slash command over AlgoChat.
- **Permissions**: Council decisions on governance topics (Layer 1 changes) require formal votes.
