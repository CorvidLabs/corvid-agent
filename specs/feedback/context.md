# Feedback (Outcome Tracker) — Context

## Why This Module Exists

Agents need to learn from their work outcomes. The outcome tracker monitors PR lifecycle events (opened, merged, closed) by polling GitHub, records state transitions, and produces weekly analyses. This data feeds the improvement loop, enabling data-driven decisions about which agents and approaches produce the best results.

## Architectural Role

Feedback is part of the **learning/improvement pipeline** — it collects outcome data that the improvement module uses for analysis and recommendations.

## Key Design Decisions

- **PR-centric metrics**: PRs are the primary unit of work output, so tracking their fate (merged vs. closed) is a strong signal of work quality.
- **Weekly cadence**: Analysis runs weekly rather than per-PR to capture patterns rather than reacting to individual outcomes.
- **GitHub polling**: Polls GitHub for PR status changes rather than relying on webhooks, making it resilient to missed webhook deliveries.

## Relationship to Other Modules

- **Improvement**: Consumes feedback data for daily reviews and improvement recommendations.
- **GitHub**: Polls GitHub for PR status.
- **Memory**: Stores analysis results as agent memories for long-term learning.
- **Work Tasks**: Correlates PR outcomes with the work tasks that produced them.
