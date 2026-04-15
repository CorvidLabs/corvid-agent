---
spec: sidebar-navigation.spec.md
sources:
  - client/src/app/shared/components/sidebar.component.ts
  - client/src/app/app.routes.ts
  - client/src/app/features/chat-home/chat-home.component.ts
---

## Layout

The sidebar is a fixed-position left panel with two display modes:
- **Desktop expanded**: 220px wide, full labels visible
- **Desktop collapsed**: 48px wide, icon-only with abbreviated labels
- **Mobile**: Hidden by default; slides in as an overlay (100% screen width overlay with backdrop) on toggle; ignores collapsed state

Breakpoint: `768px` — below this, mobile overlay mode activates.

The collapsed state is stored in `localStorage` under key `sidebar_collapsed`.

### Navigation Structure
```
Sidebar (top-to-bottom)
  Chat (→ /chat)              — default landing page
  Dashboard (→ /dashboard)
  Sessions (→ /sessions)      — sub-tabs: Conversations, Work Tasks, Councils
  Agents (→ /agents)          — sub-tabs: All Agents, Flock Directory, Projects, Models
  Observe (→ /observe)        — sub-tabs: Comms (Feed/Network/Timeline), Memory (Overview/Browse/3D), Analytics, Logs, Reputation
  Settings (→ /settings)      — sub-tabs: General, Security, Access Control, Automation, Integrations
  Config (→ /config)
```

Root `/` redirects to `/chat`. Wildcard `**` redirects to `/chat`.

## Components

### SidebarComponent
Angular standalone component with `ChangeDetectionStrategy.OnPush`.

Key signals/state:
- `collapsed` — `model<boolean>()` signal, synced to `localStorage`
- `mobileOpen` — `signal<boolean>()` for overlay state
- `router` — injected for `NavigationEnd` event subscription (auto-close mobile on route change)

Key behaviors:
- `toggleCollapse()` — flip `collapsed` signal and persist to localStorage
- `toggleMobile()` — flip `mobileOpen` signal
- Escape key listener — closes mobile sidebar when open
- `NavigationEnd` subscription — closes mobile sidebar on route change

### ChatHomeComponent
Default landing page at `/chat`. Centered layout with:
- Agent picker dropdown
- Prompt input textarea
- Quick-start hint chips
- Session launch button

No agent is pre-selected — the agent picker defaults to "Select an agent".

### Routes Array (app.routes.ts)
All routes use `loadComponent` with dynamic imports (code splitting). Backwards-compatibility redirects are defined for old paths:
- `/observe/live-feed` → `/observe/comms`
- `/observe/brain-viewer` → `/observe/memory`
- `/observe/memory-browser` → `/observe/memory`
- `/observe/agent-comms` → `/observe/comms`

## Tokens

| Token | Value | Description |
|-------|-------|-------------|
| `localStorage` key | `sidebar_collapsed` | Collapsed state persistence |
| `localStorage` key | `comms_view_mode` | Preferred view within Comms section |
| `localStorage` key | `memory_view_mode` | Preferred view within Memory section |
| Collapsed width | `48px` | Sidebar width in collapsed desktop mode |
| Expanded width | `220px` | Sidebar width in expanded desktop mode |
| Mobile breakpoint | `768px` | Below this, overlay mode activates |

## Assets

### Required After Changes
After any modification to sidebar or route files, `bun run build:client` must be run. The server serves static Angular files from `client/dist/` — stale builds will silently show old navigation.

### Related Files
- `client/src/app/app.ts` — root App template where `SidebarComponent` is used
- `client/src/app/app.config.ts` — imports `routes` for Angular router configuration
