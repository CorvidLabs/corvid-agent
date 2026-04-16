---
spec: service.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| (no dedicated unit test file) | — | BrowserService requires a real Chrome installation; tested via MCP tool integration tests |

Browser automation is inherently integration-heavy. Unit tests would require mocking the entire Playwright API surface. Coverage is provided by manual testing and E2E test suites that use the `corvid_browser` MCP tool.

## Manual Testing

- [ ] Invoke the `corvid_browser` MCP tool from an agent session with `action: "create_tab", url: "https://example.com"` and confirm a tab ID is returned
- [ ] Navigate the tab to a new URL and call `getPageText`; confirm the page content is returned
- [ ] Take a screenshot with `action: "screenshot"` and verify a PNG buffer is returned
- [ ] Open 20 tabs (MAX_PAGES) and attempt to create a 21st; confirm the error message includes "Maximum 20 tabs reached"
- [ ] Close a tab and verify it no longer appears in `tabsContext`
- [ ] Call `ensureBrowser` concurrently from two simultaneous tool invocations; verify only one Chrome process is launched (check process list)
- [ ] Invoke `close` on the BrowserService and verify all internal state is reset and `isRunning` returns `false`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `createTab()` when Chrome is not installed | Throws Playwright launch error; `browser` and `context` remain `null` |
| Tab ID referenced after tab was closed externally | Lookup in `pages` map fails; throws descriptive error with available IDs |
| `ensureBrowser` called concurrently before launch completes | Both callers await the same `launchPromise`; only one Chrome process starts |
| `navigate` to a URL that takes > 30 seconds | Playwright `NAV_TIMEOUT` fires; error propagates to caller |
| `executeJs` on a tab running in a sandboxed CSP page | Playwright error propagates; no crash |
| `close()` called when browser was never launched | No-op; no error |
| Tab page closed by navigation error (crashes) | `close` event handler removes it from `pages` map automatically |
