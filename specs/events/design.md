---
spec: broadcasting.spec.md
sources:
  - server/events/broadcasting.ts
---

## Layout

Single-file backend module. Extracted from `server/index.ts` (god-module decomposition, #442). Serves as the single integration point between backend service events and real-time WebSocket delivery to clients.

```
server/events/
  broadcasting.ts   — wireEventBroadcasting, publishToTenant
```

## Components

### `wireEventBroadcasting` — Event → WS Wiring

Registers callbacks on all service event buses. Called exactly once after all services are initialized (invariant 2). Wires:

| Service Event | Topic |
|--------------|-------|
| Council stage change | `council` (tenant-scoped) |
| Council log | `council` (tenant-scoped) |
| Council discussion message | `council` (tenant-scoped) |
| Governance vote cast | `governance` (tenant-scoped via agent) |
| Governance vote resolved | `governance` (tenant-scoped via agent) |
| Governance quorum reached | `governance` (tenant-scoped via agent) |
| Schedule events | `schedule` (tenant-scoped via agentId if present) |
| Webhook events | `webhook` (tenant-scoped via agentId if present) |
| Mention polling events | `mention` (flat topic) |
| Workflow events | `workflow` (flat topic — no agentId in workflow events yet) |
| Notification events | `owner` (flat topic) |
| Process manager broadcast | Direct WS publish (via `processManager.setBroadcast`) |

### `publishToTenant` — Tenant-Scoped Publisher

`publishToTenant(server, baseTopic, data, tid?)` — wraps `tenantTopic(baseTopic, tid)` to produce the correctly-scoped topic string before publishing. When `tid` is `undefined` (single-tenant mode), produces a flat topic.

### Tenant Resolution

- `resolveCouncilTenant(db, launchId, multiTenant)` — looks up tenant from council launch
- `resolveAgentTenant(db, agentId, multiTenant)` — looks up tenant from agent record

If entity not found, both return `undefined` and publishing falls back to flat topic (no crash).

### `BroadcastDeps` Bag

Dependency injection container passed to `wireEventBroadcasting`:

```typescript
type BroadcastDeps = {
  server: Server;
  db: Database;
  processManager: ProcessManager;
  schedulerService: SchedulerService;
  webhookService: WebhookService;
  mentionPollingService: MentionPollingService;
  workflowService: WorkflowService;
  notificationService: NotificationService;
  multiTenant: boolean;
}
```

## Tokens

| Constant | Description |
|----------|-------------|
| `'owner'` topic | Fixed topic for notification service events |
| `'workflow'` topic | Flat topic for workflow events (no tenant yet) |
| `'mention'` topic | Flat topic for mention polling events |

## Assets

| Resource | Description |
|----------|-------------|
| `server/ws/handler.ts` | `tenantTopic()` helper for topic scoping |
| `server/tenant/resolve.ts` | `resolveAgentTenant`, `resolveCouncilTenant` |
| Service event buses | Callback arrays in councils, schedules, webhooks, workflows, notifications |
