---
module: flock-directory-capability-router
version: 1
status: active
files:
  - server/flock-directory/capability-router.ts
depends_on:
  - server/flock-directory/service.ts
  - server/flock-directory/conflict-resolver.ts
  - server/lib/logger.ts
---

# Capability Router

## Purpose

Routes tasks to the best available agent in the flock based on capabilities, reputation, workload, and uptime. Bridges the Flock Directory (who can do what) with the work task system (what needs to be done). When a task arrives that could be delegated, the router selects the best candidate.

## Public API

### Exported Constants

| Constant | Description |
|----------|-------------|
| `CAPABILITIES` | Well-known capability identifiers used across the flock |

### Exported Types

| Type | Description |
|------|-------------|
| `Capability` | Union type of well-known capability identifiers |
| `RouteCandidate` | A candidate agent with score breakdown and active claim count |
| `RouteResult` | Full routing result: best candidate, all candidates, exclusions |

### Exported Classes

| Class | Description |
|-------|-------------|
| `CapabilityRouter` | Main routing service |

#### `CapabilityRouter`

| Method | Description |
|--------|-------------|
| `route(opts)` | Find the best agent for a task by action type or capabilities |
| `getRequiredCapabilities(actionType)` | Get capability requirements for an action type |
| `isRoutable(actionType)` | Check if an action type has a known capability mapping |
| `listCapabilities()` | List all known capabilities |

## Scoring Algorithm

Candidates are scored on a 0-100 scale:

| Component | Weight | Source |
|-----------|--------|--------|
| Reputation | 40% | FlockAgent.reputationScore |
| Workload | 30% | Inverse of active claim count (0 claims = full, 3+ = zero) |
| Uptime | 20% | FlockAgent.uptimePct |
| Recency | 10% | Hours since last heartbeat (within 1h = full, 24h+ = zero) |

Capability match is a prerequisite filter, not a scoring component.

## Action-to-Capability Mapping

| Action Type | Required Capabilities |
|-------------|----------------------|
| `code_review` | code_review |
| `codebase_review` | code_review, refactoring |
| `security_audit` | security_audit |
| `dependency_audit` | dependency_audit |
| `improvement_loop` | feature_work, refactoring |
| `work_task` | feature_work, bug_fix |
| `github_suggest` | feature_work |
| `documentation` | documentation |
| `testing` | testing |
| `triage` | triage |

## Invariants

1. Self agent is always excluded from routing candidates
2. All required capabilities must be present — partial matches are excluded
3. Routing is stateless — no results are cached or persisted
4. Score components always sum to 100 maximum
5. Agents with active claims on the target repo are excluded when repo is specified

## Behavioral Examples

```
Task: code_review on repo X
Flock: Alice (code_review, rep=90), Bob (feature_work, rep=75)
  → Alice selected (only one with code_review capability)

Task: testing
Flock: Bob (testing, rep=75, 0 claims), Charlie (testing, rep=60, 0 claims)
  → Bob selected (higher reputation score)

Task: testing
Flock: Bob (testing, rep=75, 3 claims), Charlie (testing, rep=60, 0 claims)
  → Charlie selected (Bob penalized for high workload)

Task: documentation
Flock: no agents with documentation capability
  → null result, all agents listed in exclusions
```

## Error Cases

| Scenario | Behavior |
|----------|----------|
| No agents match capabilities | Returns `bestCandidate: null` with exclusion reasons |
| Unknown action type | Returns empty required capabilities (all agents eligible) |
| Flock Directory empty | Returns `bestCandidate: null`, empty candidates |
| Conflict resolver unavailable | Workload scoring defaults to 0 active claims |

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `FlockDirectoryService` | Agent registry and capability lookup |
| `FlockConflictResolver` | Active claim count for workload scoring |
| `logger` | Structured logging |

## Change Log

| Version | Changes |
|---------|---------|
| 1 | Initial implementation: capability matching, weighted scoring, repo conflict filtering |
