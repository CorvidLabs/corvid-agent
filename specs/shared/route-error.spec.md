---
module: route-error
version: 1
status: active
files:
  - client/src/app/shared/components/route-error.component.ts
db_tables: []
depends_on: []
---

# RouteErrorComponent

## Purpose

Standalone Angular component that displays a styled error page when a lazy-loaded route fails to resolve (e.g. chunk load failure). Provides a retry button that re-navigates to the current URL and a "Go Home" link that navigates to `/chat`.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `RouteErrorComponent` | Standalone component displaying a route-load error with retry and go-home actions |

#### RouteErrorComponent Properties

| Property | Type | Description |
|----------|------|-------------|
| `asciiIcon` | `string` (readonly) | Multi-line ASCII art rendered in the error card |

#### RouteErrorComponent Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `retry` | `()` | `void` | Re-navigates to the current router URL via `router.navigateByUrl` |

### Component Metadata

| Key | Value |
|-----|-------|
| Selector | `app-route-error` |
| Change Detection | `OnPush` |
| Imports | `RouterLink` |

## Invariants

1. The retry button always navigates to the current `router.url`, never a hardcoded path
2. The "Go Home" link always points to `/chat`
3. The component uses `role="alert"` and `aria-live="assertive"` for accessibility
4. Animations are disabled when `prefers-reduced-motion: reduce` is active

## Behavioral Examples

### Scenario: User clicks Retry

- **Given** the route error page is displayed
- **When** the user clicks the "Retry" button
- **Then** `router.navigateByUrl(router.url)` is called to re-attempt the current route

### Scenario: User clicks Go Home

- **Given** the route error page is displayed
- **When** the user clicks the "Go Home" link
- **Then** the router navigates to `/chat`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Chunk load failure | Component is rendered as the route's error element |
| Retry also fails | The same error page is shown again |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@angular/router` | `Router`, `RouterLink` |

### Consumed By

| Module | What is used |
|--------|-------------|
| App routing config | Used as error element for lazy-loaded routes |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec |
