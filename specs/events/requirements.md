---
spec: broadcasting.spec.md
---

## User Stories

- As an agent operator, I want council stage changes, logs, and discussion messages broadcast to the dashboard in real time so that I can follow deliberations as they happen
- As a platform administrator, I want service events (schedules, webhooks, workflows, mentions) automatically wired to WebSocket topics so that adding a new event source does not require changes in multiple files
- As an agent operator, I want events scoped to the correct tenant in multi-tenant mode so that one tenant's dashboard does not see another tenant's events
- As an agent developer, I want a single integration point between backend services and real-time delivery so that event broadcasting is consistent and centralized

## Acceptance Criteria

- `wireEventBroadcasting()` registers all service event callbacks to broadcast via WebSocket and must be called exactly once after all services are initialized
- `publishToTenant()` delegates to `tenantTopic(baseTopic, tid)` for topic scoping; omitting `tid` publishes to the flat (single-tenant) topic
- Council events (stage change, log, discussion message, governance vote cast/resolved/quorum reached) resolve tenant via `resolveCouncilTenant()` or `resolveAgentTenant()` before publishing
- Schedule, webhook, and mention events resolve tenant from the event's `agentId` field when present; publish to flat topic otherwise
- Workflow events publish to flat topic (no agentId available in workflow events)
- `processManager.setBroadcast` is wired so that MCP tools can publish messages to WebSocket clients
- `notificationService.setBroadcast` publishes to the `'owner'` topic for real-time owner notifications
- When an entity is not found in the database during tenant resolution, `resolveAgentTenant()` / `resolveCouncilTenant()` return undefined and the message publishes to the flat topic as a fallback
- In single-tenant mode, all events publish to flat topics (tenantId is always undefined)

## Constraints

- `wireEventBroadcasting()` must be called exactly once; calling it multiple times would register duplicate callbacks
- No crash isolation in the broadcasting layer: if a service event callback throws, the error propagates to the service
- Tenant resolution requires database lookups (`resolveAgentTenant`, `resolveCouncilTenant`) which add latency to event publishing
- The `BroadcastDeps` interface bundles all required dependencies: server, db, processManager, schedulerService, webhookService, mentionPollingService, workflowService, notificationService, and multiTenant flag

## Out of Scope

- Persistent event storage or replay for missed events
- Event filtering or subscription management (handled by WebSocket handler)
- Cross-server event distribution (single-instance only)
- Event batching or debouncing
- Dead letter queues for failed broadcasts
