# Reputation — Context

## Why This Module Exists

In a multi-agent system, you need to know which agents are reliable. The reputation system tracks agent performance through multiple signals — PR outcomes, response feedback (thumbs up/down), task completion rates — and produces composite scores that influence task routing and trust decisions.

## Architectural Role

Reputation is a **scoring service** — it aggregates signals from multiple sources into a single reputation score per agent. This score is consumed by the flock directory's capability router for task delegation.

## Key Design Decisions

- **Multi-signal scoring**: Combines peer feedback, PR outcomes, task completion, and other events. No single signal dominates.
- **Event-driven**: Reputation changes are driven by events (`feedback_received`, `pr_merged`, `task_completed`), not periodic recalculation.
- **User feedback integration**: Thumbs-up/thumbs-down on agent responses directly influences reputation, giving operators a simple way to shape agent behavior.

## Relationship to Other Modules

- **Flock Directory**: Reputation scores influence task routing decisions.
- **Feedback**: PR outcomes feed into reputation.
- **DB**: Reputation events stored in `reputation_events`, feedback in `response_feedback`.
- **Attestations**: Reputation can be published as on-chain attestations.
