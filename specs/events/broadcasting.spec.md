---
module: event-broadcasting
version: 1
status: active
files:
  - server/events/broadcasting.ts
depends_on:
  - specs/ws/handler.spec.md
  - specs/tenant/tenant.spec.md
---

# Event Broadcasting

## Purpose

Wires service-level events (councils, schedules, webhooks, workflows, mentions, notifications) to tenant-scoped WebSocket topics. Extracted from `server/index.ts` as part of god-module decomposition (#442). This is the single integration point between backend services and real-time client delivery.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `BroadcastDeps` | Dependency bag: server, db, processManager, schedulerService, webhookService, mentionPollingService, workflowService, notificationService, multiTenant flag |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `publishToTenant` | `(server, baseTopic, data, tid?)` | `void` | Publish a message to a tenant-scoped WS topic; omit `tid` for flat topic |
| `wireEventBroadcasting` | `(deps: BroadcastDeps)` | `void` | Register all service event callbacks to broadcast via WebSocket |

## Invariants

1. `publishToTenant` delegates to `tenantTopic(baseTopic, tid)` for topic scoping — single-tenant mode uses flat topics (tid is undefined).
2. `wireEventBroadcasting` must be called exactly once after all services are initialized.
3. Council events (stage change, log, discussion message, governance vote cast/resolved/quorum reached) resolve tenant via `resolveCouncilTenant` or `resolveAgentTenant` before publishing.
4. Schedule, webhook, and mention events resolve tenant from the event's `agentId` field when present; publish to flat topic otherwise.
5. Workflow events currently publish to flat topic (no agentId in workflow events yet).
6. `processManager.setBroadcast` is wired so MCP tools can publish to WS clients.
7. `notificationService.setBroadcast` publishes to the `'owner'` topic.

## Behavioral Examples

### Tenant-scoped council broadcast
```
Given: multi-tenant mode is enabled
When: a council stage change fires for launch "L1" belonging to tenant "T1"
Then: resolveCouncilTenant(db, "L1", true) returns "T1"
And: message is published to tenantTopic("council", "T1")
```

### Single-tenant flat broadcast
```
Given: multi-tenant mode is disabled
When: a schedule event fires with agentId "A1"
Then: resolveAgentTenant(db, "A1", false) returns undefined
And: message is published to flat topic "council" (no tenant prefix)
```

## Error Cases

| Scenario | Behavior |
|----------|----------|
| Entity not found in DB | `resolveAgentTenant` / `resolveCouncilTenant` return `undefined`; message publishes to flat topic |
| Service event callback throws | Error propagates to the service; no crash isolation in broadcasting layer |

## Dependencies

| Dependency | Usage |
|------------|-------|
| `server/ws/handler.ts` | `tenantTopic()` for scoping topics |
| `server/tenant/resolve.ts` | `resolveAgentTenant`, `resolveCouncilTenant` for tenant lookup |
| `server/routes/councils.ts` | `onCouncilStageChange`, `onCouncilLog`, `onCouncilDiscussionMessage` callbacks |
| `server/councils/discussion.ts` | `onGovernanceVoteCast`, `onGovernanceVoteResolved`, `onGovernanceQuorumReached` callbacks |

## Change Log

- v1 (2026-03-06): Initial spec created during documentation audit.
