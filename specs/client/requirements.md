---
spec: sidebar-navigation.spec.md
---

## User Stories

- As an agent operator, I want a sidebar with links to all platform features so that I can navigate between Chat, Dashboard, Sessions, Agents, Observe, and Settings without losing context
- As an agent operator, I want the sidebar to collapse on desktop so that I have more screen space for content while still having quick access to navigation
- As an agent operator, I want the sidebar to work as a mobile overlay on small screens so that I can navigate on phones and tablets
- As an agent operator, I want the default landing page to be the Chat interface so that I can immediately start interacting with agents
- As an agent operator, I want old bookmark URLs to redirect to their new consolidated equivalents so that my saved links continue to work after UI reorganization
- As an agent developer, I want all routes to be lazy-loaded so that the initial page load is fast even as the application grows

## Acceptance Criteria

- `SidebarComponent` renders navigation links for all 6 top-level groups: Chat, Dashboard, Sessions, Agents, Observe, Settings
- Agents section contains sub-tabs: All Agents, Flock Directory, Projects, Models
- Sessions section contains sub-tabs: Conversations, Work Tasks, Councils
- Observe section contains sub-tabs: Comms (Feed/Network/Timeline), Memory (Overview/Browse/3D), Analytics, Logs, Reputation
- Settings section contains sub-tabs: General, Security, Access Control, Automation, Integrations
- Clicking the collapse button shrinks the sidebar to 48px width and persists the state in `localStorage` under key `sidebar_collapsed`
- On viewports below 768px, the sidebar renders as a slide-out overlay with backdrop, ignoring the collapsed state
- Route changes (NavigationEnd events) automatically close the mobile sidebar overlay
- Pressing Escape closes the sidebar overlay when open
- The root path `/` redirects to `/chat`; the wildcard route also redirects to `/chat`
- All routes use `loadComponent` with dynamic imports for code splitting
- `ChatHomeComponent` renders a centered prompt input with an agent picker and quick-start hints
- Old paths (`/observe/live-feed`, `/observe/brain-viewer`, `/observe/memory-browser`, `/observe/agent-comms`) redirect to their new consolidated equivalents
- Within consolidated views (Comms, Memory), the selected view mode is persisted in localStorage
- All sidebar sections and links are visible to all users with no audience gating

## Constraints

- After any change to sidebar or route files, `bun run build:client` must be run; the server serves static files from `client/dist/`
- Angular 19+ with standalone components and signals-based reactivity
- All navigation links and routes must be kept in sync; a missing sidebar entry makes a feature unreachable
- localStorage unavailability causes collapsed state to default to expanded (no error thrown)

## Out of Scope

- Role-based or permission-based sidebar visibility (all sections visible to all users)
- Server-side rendering (SSR) of the Angular client
- Real-time notification badges on sidebar links
- Custom sidebar themes or user-configurable navigation ordering
- Drag-and-drop sidebar reordering
