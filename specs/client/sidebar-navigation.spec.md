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

Defines the sidebar navigation links that provide access to all top-level pages in the dashboard. The sidebar is the sole navigation mechanism — if a route exists in `app.routes.ts` but has no sidebar link, users cannot reach it through the UI.

## Invariants

1. **Every top-level route MUST have a sidebar link** unless it is explicitly listed in the "Routes WITHOUT Sidebar Links" section below. When a new route is added to `app.routes.ts`, a corresponding `<li>` entry MUST be added to the sidebar template, or it must be added to the exclusion list with justification.
2. **Link order is fixed.** Links are grouped into logical sections separated by dividers. The order below must be maintained.
3. **Each link needs both label and abbreviation.** Every sidebar link has a `sidebar__label` (full text) and `sidebar__abbr` (1-2 char abbreviation shown when collapsed).
4. **routerLinkActive must be set.** Every link uses `routerLinkActive="sidebar__link--active"` for visual highlighting.
5. **Never remove a sidebar link without reading this spec first.** If you are editing the sidebar, check this table and ensure every listed link remains present.

## Sidebar Links (Authoritative List)

The sidebar MUST contain exactly these links in this order:

| # | Label | Route | Abbreviation | Section |
|---|-------|-------|-------------|---------|
| 1 | Dashboard | `/dashboard` | D | Core |
| 2 | Agents | `/agents` | A | Core |
| 3 | Models | `/models` | M | Core |
| 4 | Conversations | `/sessions` | Ch | Core |
| 5 | Councils | `/councils` | Co | Core |
| 6 | Projects | `/projects` | P | Core |
| | --- divider --- | | | |
| 7 | Schedules | `/schedules` | Sc | Automation |
| 8 | Workflows | `/workflows` | Wf | Automation |
| 9 | Work Tasks | `/work-tasks` | Wt | Automation |
| | --- divider --- | | | |
| 10 | Webhooks | `/webhooks` | Wh | Integrations |
| 11 | Polling | `/mention-polling` | Mp | Integrations |
| | --- divider --- | | | |
| 12 | Feed | `/feed` | F | Monitoring |
| 13 | Wallets | `/wallets` | W | Monitoring |
| 14 | Analytics | `/analytics` | An | Monitoring |
| 15 | Logs | `/logs` | L | Monitoring |
| 16 | Settings | `/settings` | S | System |

## Routes WITHOUT Sidebar Links

These routes are accessed via in-page navigation and do NOT need sidebar entries:

**Sub-routes (detail/edit/create pages):**
- `projects/new`, `projects/:id`, `projects/:id/edit`
- `agents/new`, `agents/:id`, `agents/:id/edit`
- `councils/new`, `councils/:id`, `councils/:id/edit`
- `council-launches/:id`
- `sessions/new`, `sessions/:id`

**Merged pages (functionality lives inside another page):**
- `allowlist` — allowlist management is built into the Wallets page (`/wallets`). The standalone `/allowlist` route still exists for direct URL access but does not need a sidebar link.

## Behavioral Examples

### Scenario: New top-level route added

- **Given** a developer adds `{ path: 'notifications', loadComponent: ... }` to `app.routes.ts`
- **When** they check this spec
- **Then** they MUST also add a sidebar link for `/notifications` with label, abbreviation, and correct position — OR add it to the exclusion list with justification

### Scenario: Sidebar link removed by mistake

- **Given** the sidebar is missing a link for an existing route (e.g. `/models`)
- **When** `spec:check` or manual review catches it
- **Then** the link must be restored — removing sidebar links without removing the corresponding route is a spec violation

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Route exists without sidebar link (and not excluded) | Spec violation — user cannot navigate to the page |
| Sidebar link exists without route | Angular shows blank page — link must be removed or route added |
| Duplicate abbreviation | Collapsed sidebar becomes ambiguous — abbreviations must be unique |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec — 16 sidebar links, allowlist excluded (merged into Wallets) |
