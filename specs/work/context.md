# Work Tasks — Context

## Why This Module Exists

Work tasks are the unit of agent work output — each task represents a discrete code change, research task, or operational action. The work task system manages the full lifecycle: creation, assignment, execution in isolated git worktrees, PR creation, and completion tracking. The chain continuation sub-module specifically handles model tier escalation when a lower-tier model stalls.

## Architectural Role

Work is the **task execution engine** — it orchestrates how agents do concrete work. Git worktree isolation ensures each task gets a clean working directory, preventing cross-task contamination.

## Key Design Decisions

- **Worktree isolation**: Each work task runs in its own git worktree with a dedicated branch. This prevents tasks from interfering with each other and makes cleanup easy.
- **Auto-PR**: Completed work tasks automatically create pull requests for review.
- **Chain continuation**: When a lower-tier model (e.g., Haiku) stalls mid-task (no tool calls in consecutive turns), the system detects this and signals for escalation to a higher-tier model. This optimizes cost while ensuring task completion.
- **Stall detection**: A configurable threshold of consecutive stalled steps (turns with no tool use) triggers escalation.

## Relationship to Other Modules

- **Process Manager**: Work tasks create agent sessions.
- **Flock Directory**: The capability router assigns tasks to agents.
- **GitHub**: Completed tasks create PRs.
- **Providers**: Chain continuation involves switching between model tiers.
- **Lib**: Uses project directory resolution for worktree management.
