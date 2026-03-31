# Webhooks — Context

## Why This Module Exists

External services need to trigger agent actions — GitHub push events, CI completion, monitoring alerts, custom integrations. The webhooks module receives HTTP webhook deliveries, validates their authenticity, and routes them to appropriate handlers (agent sessions, work tasks, or schedules).

## Architectural Role

Webhooks is an **inbound integration layer** — it sits at the HTTP boundary, receiving events from external services and translating them into internal actions.

## Key Design Decisions

- **Registration-based**: Webhooks are explicitly registered with expected source, secret, and event types. Unregistered webhooks are rejected.
- **Delivery tracking**: Every webhook delivery is recorded in `webhook_deliveries` with status and response, enabling debugging and replay.
- **Security validation**: Each delivery is verified against the registered secret (HMAC signature or equivalent).
- **Multi-handler routing**: A single webhook can trigger multiple actions — creating a work task, resuming a schedule, or starting a new agent session.

## Relationship to Other Modules

- **Work Tasks**: Webhooks can create or update work tasks.
- **Scheduler**: Webhook deliveries can trigger scheduled actions.
- **Process Manager**: Can spawn agent sessions in response to webhooks.
- **GitHub**: GitHub webhooks (push, PR, issue events) are a primary webhook source.
- **DB**: Registrations in `webhook_registrations`, deliveries in `webhook_deliveries`.
