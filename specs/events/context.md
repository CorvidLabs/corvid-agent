# Event Broadcasting — Context

## Why This Module Exists

The web dashboard needs real-time updates — when a council progresses, a schedule fires, or a notification arrives, the UI should reflect it immediately without polling. The event broadcasting module wires backend service events to tenant-scoped WebSocket topics, providing a single integration point for real-time delivery.

## Architectural Role

Events is the **pub/sub glue** between backend services and the WebSocket layer. It was extracted from the main server index file as part of god-module decomposition to keep the codebase modular.

## Key Design Decisions

- **Tenant-scoped topics**: Events are broadcast to specific tenant topics, not globally. This is preparation for multi-tenant support.
- **Single integration point**: All event routing goes through this module rather than having services directly call WebSocket APIs. This makes it easy to audit and extend.
- **Extraction from god module**: This was carved out of `server/index.ts` specifically to reduce that file's complexity.

## Relationship to Other Modules

- **WebSocket**: Events are delivered to clients via the WS handler.
- **Tenant**: Uses tenant resolution to scope events.
- **Councils, Scheduler, Webhooks, Workflows, Notifications**: All emit events that this module routes.
