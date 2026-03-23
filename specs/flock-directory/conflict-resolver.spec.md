---
module: flock-directory-conflict-resolver
version: 1
status: active
files:
  - server/flock-directory/conflict-resolver.ts
db_tables:
  - work_claims
depends_on:
  - server/flock-directory/service.ts
  - server/lib/logger.ts
---

# Flock Conflict Resolver

## Purpose

Cross-machine conflict detection and resolution for multi-agent deployments. When multiple agent instances run on different machines, this service manages "work claims" — ephemeral records that track which agent is actively working on which repo/issue. Prevents duplicate work by checking for conflicting claims before starting tasks.

## Public API

### Exported Functions

_No standalone exported functions. All functionality is exposed via the exported class._

### Exported Types

| Type | Description |
|------|-------------|
| `WorkClaim` | A work claim record with agent, repo, issue, branch, and expiry info |
| `ClaimConflict` | Describes a conflict with an existing claim: reason and overridability |
| `CheckClaimResult` | Result of a check-and-claim operation: allowed, conflicts, claim |
| `ConflictResolverConfig` | Configuration: TTL, self agent ID/name, override and blocking options |

### Exported Classes

| Class | Description |
|-------|-------------|
| `FlockConflictResolver` | Main service for managing work claims and detecting conflicts |

#### `FlockConflictResolver`

| Method | Description |
|--------|-------------|
| `ensureSchema()` | Creates the work_claims table if it doesn't exist (idempotent) |
| `checkAndClaim(opts)` | Check for conflicts and create a claim if no blocking conflicts exist |
| `releaseClaim(claimId, reason?)` | Release a claim when work is done |
| `releaseAllClaims(reason?)` | Release all claims held by this agent instance (shutdown) |
| `findConflicts(repo, issueNumber, branch)` | Find conflicts for a proposed claim |
| `listActiveClaims(repo?)` | List all active claims, optionally filtered by repo |
| `getClaim(claimId)` | Get a claim by ID |
| `getAgentClaims(agentId)` | Get claims held by a specific agent |
| `getStats()` | Get conflict resolution statistics |

## Conflict Resolution Strategy

1. **Same issue** — Strongest conflict. Blocked unless the existing claim is expired.
2. **Same branch** — Strong conflict. Blocked unless the existing claim is expired.
3. **Same repo, different issue** — Weak conflict. Only blocked if `blockOnSameRepo` is enabled.
4. **Expired claims** — Auto-overridden when `autoOverrideExpired` is true (default).

## Database Schema

```sql
CREATE TABLE work_claims (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL DEFAULT '',
    repo TEXT NOT NULL,
    issue_number INTEGER,
    branch TEXT,
    description TEXT NOT NULL DEFAULT '',
    claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    resolved_reason TEXT
);
```

## Invariants

1. At most one active claim per agent per repo+issue combination
2. Self-claims are never treated as conflicts
3. Expired claims are cleaned before every check
4. Released/expired/superseded claims are pruned after 7 days
5. `checkAndClaim` is atomic within a single instance (SQLite-backed)

## Behavioral Examples

```
Agent A claims repo X, issue #42
  → claim created, status=active, expires in 2h

Agent B tries to claim repo X, issue #42
  → blocked: same_issue conflict with Agent A's claim

Agent A's claim expires (>2h)
Agent B tries to claim repo X, issue #42
  → allowed: expired claim auto-overridden, Agent A's claim marked superseded

Agent A claims repo X, issue #42
Agent B claims repo X, issue #99
  → allowed: different issue, blockOnSameRepo=false (default)
```

## Error Cases

| Scenario | Behavior |
|----------|----------|
| Same issue claimed by another agent | `checkAndClaim` returns `allowed: false` with conflict details |
| Same branch claimed by another agent | `checkAndClaim` returns `allowed: false` with conflict details |
| Release non-existent claim | `releaseClaim` returns `false` |
| Schema already exists | `ensureSchema` is idempotent (no error) |

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `FlockDirectoryService` | Agent registry for cross-referencing claim holders |
| `bun:sqlite` | Persistent claim storage |
| `logger` | Structured logging |

## Change Log

| Version | Changes |
|---------|---------|
| 1 | Initial implementation: work claims, conflict detection, auto-expiry |
