---
module: sidebar-navigation
version: 1
status: active
files:
  - client/src/app/shared/components/sidebar.component.ts
  - client/src/app/app.routes.ts
db_tables: []
depends_on: []
---

# Sidebar Navigation

## Purpose

Provides the main navigation sidebar for the web client. The `SidebarComponent` renders navigation links to all top-level routes, supports responsive mobile overlay mode, and persists a collapsed/expanded state in localStorage. The `routes` array defines all lazy-loaded Angular routes for the application.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `SidebarComponent` | Angular component rendering the main navigation sidebar with responsive collapse and mobile overlay |

### Exported Variables

| Variable | Type | Description |
|----------|------|-------------|
| `routes` | `Routes` | Angular route configuration array defining all application routes with lazy-loaded components |

## Invariants

1. **Sidebar closes on navigation**: Route changes (NavigationEnd events) automatically close the mobile sidebar overlay
2. **Collapsed state persistence**: The collapsed/expanded state is persisted in `localStorage` under key `sidebar_collapsed`
3. **Mobile overlay**: Below 768px viewport width, the sidebar renders as a slide-out overlay with backdrop, ignoring collapsed state
4. **Escape key closes sidebar**: Pressing Escape closes the sidebar overlay when open
5. **Route lazy loading**: All routes use `loadComponent` with dynamic imports for code splitting

## Behavioral Examples

### Scenario: Toggle sidebar collapse on desktop

- **Given** the sidebar is expanded on desktop
- **When** the collapse button is clicked
- **Then** the sidebar width shrinks to 48px, labels are replaced with abbreviations, and `localStorage` stores `sidebar_collapsed = 'true'`

### Scenario: Mobile sidebar open and navigate

- **Given** the sidebar is open on a mobile viewport
- **When** a navigation link is clicked
- **Then** the route changes and the sidebar closes automatically

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `localStorage` unavailable | Collapsed state defaults to `false` (expanded) |
| Route not matched | Angular default behavior (no component loaded) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@angular/core` | `Component`, `ChangeDetectionStrategy`, `model`, `signal`, `inject`, `viewChild` |
| `@angular/router` | `Router`, `RouterLink`, `RouterLinkActive`, `NavigationEnd`, `Routes` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `client/src/app/app.ts` | `SidebarComponent` used in the root App template |
| `client/src/app/app.config.ts` | `routes` imported for Angular router configuration |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
