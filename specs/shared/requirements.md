---
spec: cron-editor.spec.md
---

## User Stories

- As an agent operator, I want to convert cron expressions to human-readable strings so that schedule configurations are understandable at a glance in the dashboard
- As an agent operator, I want inline cron validation with descriptive error messages so that I know exactly which field is wrong before saving a schedule
- As an agent operator, I want preset cron chips (e.g., "Weekdays at 9 AM", "Every 15 minutes") so that common schedules can be created with a single click
- As an agent operator, I want a styled error page when a lazy-loaded route fails so that I can retry or navigate home instead of seeing a blank screen
- As an agent developer, I want shared TypeScript types for agents, sessions, projects, councils, work tasks, schedules, webhooks, workflows, and marketplace entities so that server and client stay type-aligned
- As an agent developer, I want a typed WebSocket protocol with discriminated unions so that client and server message handling is exhaustively checked at compile time

## Acceptance Criteria

- `cronToHuman()` returns an empty string for null/undefined input and the raw expression unchanged for non-5-field inputs
- `cronToHuman("0 9 * * 1-5")` returns `"9:00 AM, Mon-Fri"` using 12-hour AM/PM notation
- `cronToHuman("* * * * *")` returns `"Every minute"`
- `validateCron()` returns null for valid 5-field cron expressions and a human-readable error string for invalid input (e.g., `"Hour: 25 out of range 0-23"`)
- `validateCron("")` returns `"Cron expression is required"`
- `CronEditorComponent` emits `valueChange` when a preset chip is clicked, populating the input with a valid expression
- `CronEditorComponent.emitSave()` is a no-op when `isValid()` is false
- The cron editor input border turns red only when a validation error is present; the human preview shows in cyan only when valid
- `RouteErrorComponent` retry button calls `router.navigateByUrl(router.url)` to re-attempt the current route
- `RouteErrorComponent` "Go Home" link navigates to `/chat`
- `RouteErrorComponent` uses `role="alert"` and `aria-live="assertive"` for screen reader accessibility
- `shared/ws-protocol.ts` exports `ClientMessage`, `ServerMessage`, `isClientMessage` type guard, and `ServerMessageHandlerMap` for typed handler dispatch
- `shared/types/index.ts` re-exports all entity types consumed by both server routes and Angular client services

## Constraints

- Shared types must not import from `server/` or `client/` directories; they are the dependency boundary between the two
- Angular components in `shared/` must be standalone with `OnPush` change detection
- `CronHumanPipe` is a pure Angular pipe with no side effects
- The `ws-protocol.ts` message types use discriminated unions on the `type` field for exhaustive pattern matching
- Animations in `RouteErrorComponent` respect `prefers-reduced-motion: reduce` media query
- On mobile (< 600px), `CronEditorComponent` preset labels are hidden, showing only compact icon text

## Out of Scope

- Server-side cron scheduling logic (handled by `server/scheduler/`)
- 6-field or 7-field cron expressions (seconds, years)
- Timezone-aware cron display
- WebSocket connection management or reconnection logic
- Client-side state management or HTTP service layer
