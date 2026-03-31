# Client — Context

## Why This Module Exists

The web dashboard is the primary GUI for corvid-agent. It provides a mobile-first Angular application where operators can chat with agents, monitor system health, manage schedules, review work tasks, and observe agent memory. The sidebar navigation module specifically handles routing between all these features.

## Architectural Role

The client is the **presentation layer** — a standalone Angular 21 SPA that communicates with the server via REST APIs and WebSocket. It's built with standalone components and lazy-loaded routes for performance.

## Key Design Decisions

- **Mobile-first**: Designed for phone-sized screens first, with responsive expansion for desktop. This reflects the primary use case of operators managing agents on the go.
- **Chat as home page**: The default landing is `/chat`, emphasizing that agent conversation is the primary interaction model.
- **No audience segmentation**: All features are visible to all users. Access control is handled server-side.
- **Responsive sidebar**: Collapses to an overlay on mobile, persists collapsed/expanded state in localStorage.

## Relationship to Other Modules

- **WebSocket**: Real-time updates (session events, council progress, notifications) flow through the WS handler.
- **Routes**: The client consumes all REST API endpoints defined in the routes module.
- **Dashboard**: The dashboard routes serve memory brain viewer and other observability data to the client.
