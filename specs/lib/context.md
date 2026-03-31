# Lib (Agent Utils) — Context

## Why This Module Exists

Several infrastructure concerns don't belong to any specific feature module but are needed across the system: model tier definitions, message delivery tracking, GitHub token validation, and project directory resolution. The lib module provides these shared utilities.

## Architectural Role

Lib is **shared infrastructure** — low-level utilities that other modules depend on. It has no business logic, just plumbing.

## Key Design Decisions

- **Agent tiers**: Maps models to capability levels (iteration limits, rate caps, council participation eligibility). This is how the system knows what a Haiku agent can vs. can't do compared to an Opus agent.
- **Delivery tracker**: Tracks outbound message delivery across bridges with retry logic and per-platform metrics. This ensures messages aren't silently lost.
- **Project directory strategies**: Supports persistent, clone-on-demand, ephemeral, and worktree strategies for agent working directories. Worktree mode is used for isolated work tasks.
- **GitHub token validation**: Checks OAuth scopes at startup to catch misconfigured tokens early.

## Relationship to Other Modules

- **Every bridge module**: Uses the delivery tracker.
- **Process Manager**: Uses agent tier definitions for session limits.
- **Work Tasks**: Uses project directory resolution for worktree-based isolation.
- **Config**: Consumes configuration values.
