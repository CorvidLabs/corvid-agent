# Improvement — Context

## Why This Module Exists

corvid-agent is designed to get better over time without manual tuning. The improvement module is the **self-improvement engine** — it collects health data, analyzes PR outcomes, and produces daily reviews with actionable recommendations. These recommendations feed back into agent behavior, creating a continuous improvement loop.

## Architectural Role

Improvement is a **periodic analysis service** — it runs daily, aggregates data from multiple sources, and produces structured insights that agents can act on.

## Key Design Decisions

- **Daily review cadence**: Runs once per day, analyzing the previous day's activity. This is frequent enough to catch issues quickly but not so frequent that it generates noise.
- **Multi-source analysis**: Combines health snapshots, PR outcomes, reputation scores, and memory data for a holistic view.
- **Agent-actionable output**: Recommendations are structured so agents (not just humans) can understand and act on them.
- **Work task integration**: Can automatically create work tasks for improvement recommendations.

## Relationship to Other Modules

- **Feedback**: Consumes PR outcome data.
- **Health**: Consumes health snapshots.
- **Reputation**: Consumes reputation scores.
- **Memory**: Stores and retrieves improvement history.
- **Work Tasks**: Can create work tasks for recommended improvements.
- **Process Manager**: Spawns agent sessions for analysis.
