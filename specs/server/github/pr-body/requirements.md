---
spec: pr-body.spec.md
---

## User Stories

- As a work task system, I want a standardized PR body template so that all agent-created PRs have consistent formatting
- As a code reviewer, I want PRs to have Summary, Changes, and Test Plan sections so that I can quickly understand what changed and how to verify it

## Acceptance Criteria

- `formatPrBody` with a non-empty `summary` array produces a `## Summary` section with bulleted items
- `formatPrBody` with a non-empty `changes` array produces a `## Changes` section with bulleted items
- `formatPrBody` with a non-empty `testPlan` array produces a `## Test Plan` section with unchecked checkbox items (`- [ ]`)
- Empty or undefined optional sections are omitted entirely (no empty headings)
- Sections are separated by double newlines
- The function does not include an agent signature footer — callers append that separately

## Constraints

- Pure formatting utility — no side effects, no imports
- Summary is required; changes and testPlan are optional

## Out of Scope

- Agent signature footer formatting (handled by `formatAgentSignature` in tool-handlers)
- PR creation or GitHub API interaction
