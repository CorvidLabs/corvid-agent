---
spec: sidebar-navigation.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `e2e/` (Playwright E2E) | E2E | Navigation to all top-level routes, sidebar collapse/expand, mobile overlay behavior |

The sidebar and routing are Angular UI components; unit testing is minimal (no dedicated `.spec.ts` test files in the client for sidebar). Primary coverage is through E2E tests and manual verification.

## Manual Testing

- [ ] Open the app at `/` and confirm redirect to `/chat` with the ChatHomeComponent centered layout
- [ ] Click each sidebar link (Chat, Dashboard, Sessions, Agents, Observe, Settings, Config) and verify the correct route loads
- [ ] Click the collapse button on desktop; verify sidebar shrinks to 48px with icon-only labels; reload page and verify collapsed state persists (via localStorage)
- [ ] Click the expand button; verify sidebar returns to 220px with full labels; reload and confirm expanded state persists
- [ ] Resize browser to < 768px; verify sidebar disappears; tap the hamburger/toggle; verify it slides in as overlay; tap a link; verify sidebar closes and route changes
- [ ] Press Escape when mobile sidebar is open; verify it closes
- [ ] Navigate directly to `/observe/live-feed`; verify redirect to `/observe/comms`
- [ ] Navigate directly to `/observe/brain-viewer`; verify redirect to `/observe/memory`
- [ ] Navigate directly to `/observe/memory-browser`; verify redirect to `/observe/memory`
- [ ] Verify all 6 top-level sidebar links are visible to all users (no gating, no role checks)
- [ ] Run `bun run build:client` after any sidebar change; verify the built output in `client/dist/` reflects the changes

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `localStorage` unavailable (private mode, storage full) | Collapsed state defaults to `false` (expanded); no crash |
| `localStorage` has stale `sidebar_collapsed = 'invalid'` | Defaults to `false` (falsy string check) |
| Route not matched by any route definition | Angular redirects to `/chat` via wildcard redirect |
| NavigationEnd fires before sidebar component initializes | No error; mobile overlay state correctly initialized to false |
| Comms view mode in localStorage set to `'network'` | Comms section opens in Network view on next visit |
| Memory view mode in localStorage set to `'3d'` | Memory section opens in 3D view on next visit |
| Two concurrent route navigations (rapid clicking) | Angular router handles naturally; final navigation wins |
