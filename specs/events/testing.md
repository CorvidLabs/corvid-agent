---
spec: broadcasting.spec.md
---

## Automated Testing

No dedicated test file found for `events/broadcasting.ts`. Coverage is indirect through integration tests that verify WS message delivery:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/routes-councils.test.ts` | Integration | Council stage change events reach WS subscribers |
| `server/__tests__/scheduler-pipeline.test.ts` | Integration | Schedule events broadcast via event bus |
| _(missing)_ `server/__tests__/event-broadcasting.test.ts` | Unit | `publishToTenant` topic scoping, tenant resolution fallback, all service event wiring |

## Manual Testing

- [ ] Start a council: verify WS clients receive stage change events with correct topic
- [ ] Trigger a governance vote: verify `governance` WS topic receives vote events
- [ ] Run a scheduled task: verify WS `schedule` topic receives execution events
- [ ] Send a webhook: verify WS `webhook` topic receives delivery events
- [ ] Use multi-tenant mode: verify council events scoped to correct tenant topic
- [ ] Use single-tenant mode: verify events use flat topics (no tenant prefix)

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `wireEventBroadcasting` called twice | Second call registers duplicate listeners — must only be called once (caller's responsibility) |
| Service event callback throws | Error propagates to the calling service; no crash isolation in broadcasting layer |
| `resolveCouncilTenant` can't find launch in DB | Returns `undefined`; publishes to flat topic (no crash) |
| `resolveAgentTenant` can't find agent in DB | Returns `undefined`; publishes to flat topic (no crash) |
| Workflow event with no agentId | Published to flat `workflow` topic (current design limitation) |
| Notification event | Always published to flat `owner` topic regardless of tenant |
| WS server has no connected clients | `server.publish()` is a no-op; no error |
| `processManager.setBroadcast` not called before broadcast event | Broadcast call on undefined; should be wired before events can fire |
