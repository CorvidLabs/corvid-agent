---
module: sidebar-navigation
version: 3
status: active
files:
  - client/src/app/shared/components/sidebar.component.ts
  - client/src/app/app.routes.ts
  - client/src/app/features/chat-home/chat-home.component.ts
db_tables: []
depends_on: []
tracks: [1623, 1616, 1612, 1611]
---

# Sidebar Navigation

## Purpose

Provides the main navigation sidebar for the web client. The `SidebarComponent` renders navigation links to all top-level routes, supports responsive mobile overlay mode, and persists a collapsed/expanded state in localStorage. The `routes` array defines all lazy-loaded Angular routes for the application.

The default landing page is `/chat` — a simple, centered chat interface (`ChatHomeComponent`) with an agent picker and prompt input. All features are visible to all users; there is no audience segmentation.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `SidebarComponent` | Angular component rendering the main navigation sidebar with responsive collapse and mobile overlay |
| `ChatHomeComponent` | Chat-first landing page with centered prompt input, agent picker, and quick-start hints |

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
6. **All top-level routes have sidebar entries**: Every routable feature must have a link in the sidebar. Missing nav entries make features unreachable
7. **No audience gating**: All sidebar sections and links are visible to all users. There is no creator/developer/enterprise segmentation.
8. **Chat-first default**: The root path `/` redirects to `/chat`. The wildcard route also redirects to `/chat`. The sidebar lists Chat as the first link.
9. **Grouped navigation sections**: The sidebar has 6 top-level links (Chat, Dashboard, Sessions, Agents, Observe, Settings) plus a Config section. Sub-tab configurations define the tabs within each group:
   - **Agents** (sub-tabs): All Agents, Flock Directory, Projects, Models
   - **Sessions** (sub-tabs): Conversations, Work Tasks, Councils
   - **Observe** (sub-tabs): Comms (Feed/Network/Timeline views), Memory (Overview/Browse/3D), Analytics, Logs, Reputation
   - **Settings** (sub-tabs): General, Security, Access Control, Automation, Integrations
10. **Client rebuild required**: After any change to sidebar or route files, `bun run build:client` must be run. The server serves static files from `client/dist/` — a stale build will silently show the old sidebar
11. **Backwards-compatibility redirects**: Old paths (e.g., `/observe/live-feed`, `/observe/brain-viewer`, `/observe/memory-browser`, `/observe/agent-comms`) redirect to their new consolidated equivalents. No broken bookmarks.
12. **View mode persistence**: Within consolidated views (Comms, Memory), the selected view mode (e.g., Feed vs Network) is persisted in localStorage so users return to their preferred view

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
| 2026-02-20 | corvid-agent | Added invariants #6 and #7: all routes must have sidebar entries, grouped into sections |
| 2026-02-21 | corvid-agent | Added invariant #8 (client rebuild required); enumerated all 17 sidebar entries in invariant #7 to prevent regression |
| 2026-03-19 | corvid-agent | Chat-first redesign: removed audience segmentation, added ChatHomeComponent as default landing page, all sections visible to all users |
| 2026-03-27 | corvid-agent | Dashboard consolidation: merged Brain Viewer + Memory Browser → Memory; merged Live Feed + Agent Comms → Comms; Settings 14→5 tabs; removed standalone Personas/Skill Bundles; merged session launcher into /chat. Issues #1595–#1600 |
