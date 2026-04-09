---
spec: sidebar-navigation.spec.md
---

## Active Tasks

- [ ] Dual-mode views for Comms and Memory sections: toggle between feed/list and network/3D graph modes (#1623)
- [ ] Apply design token system across all sidebar and navigation components (#1611)
- [ ] Typography pass: enforce font scale, weight, and line-height tokens across navigation and dashboard panels (#1616)
- [ ] Add entrance and route-transition animations to sidebar and main content area (#1612)

## Completed Tasks

- [x] Sidebar with 6 top-level groups: Chat, Dashboard, Sessions, Agents, Observe, Settings
- [x] Collapsible sidebar with `localStorage` persistence under `sidebar_collapsed`
- [x] Mobile overlay mode for viewports below 768px with Escape-to-close
- [x] Root `/` redirect to `/chat`; legacy path redirects for `/observe/*` routes
- [x] All routes lazy-loaded via `loadComponent` for code splitting
- [x] `ChatHomeComponent` with agent picker and quick-start hints
