# Buddy Service — Context

## Why This Module Exists

Not every collaboration needs a full council. The buddy system provides lightweight paired review — one agent writes, another reviews, and they iterate. It's the middle ground between solo work and council deliberation, designed for tasks that benefit from a second opinion without the overhead of multi-agent voting and synthesis.

## Architectural Role

Buddy mode is an **orchestration pattern** that sits above the process manager. It creates two agent sessions (lead + buddy) and manages the back-and-forth review loop.

## Key Design Decisions

- **LGTM short-circuit**: The buddy can approve early by responding with LGTM, avoiding unnecessary review rounds.
- **Max rounds cap**: Prevents infinite review loops. After maxRounds, the lead's output stands.
- **Lighter than councils**: No voting, no synthesis phase, no quorum — just request-response. This keeps latency low and cost down.

## Relationship to Other Modules

- **Councils**: Buddy mode is the simpler alternative. Councils handle multi-agent deliberation with voting; buddy mode handles simple review.
- **Process Manager**: Both lead and buddy sessions are managed by the process manager.
- **Work Tasks**: Buddy mode can be triggered as part of a work task pipeline.
