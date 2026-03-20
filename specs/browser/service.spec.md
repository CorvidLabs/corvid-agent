---
module: browser-service
version: 1
status: draft
files:
  - server/browser/service.ts
db_tables: []
depends_on: []
---

# Browser Service

## Purpose

Manages a persistent Playwright browser instance (system Chrome, headless) that agents can use for browser automation via the `corvid_browser` MCP tool. Lazily launched on first use, shared across all agent sessions.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `BrowserTab` | Interface: `{ id: number; url: string; title: string }` |

### Exported Classes

| Class | Description |
|-------|-------------|
| `BrowserService` | Manages Chrome browser lifecycle, tab management, navigation, reading, interaction, and screenshots |

#### BrowserService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `ensureBrowser` | — | `Promise<void>` | Launch browser if not already running; serializes concurrent launch attempts |
| `isRunning` | — | `boolean` | Getter: whether browser is connected |
| `tabsContext` | — | `Promise<BrowserTab[]>` | List all open tabs |
| `createTab` | `url?: string` | `Promise<BrowserTab>` | Create a new tab, optionally navigating to a URL |
| `closeTab` | `tabId: number` | `Promise<void>` | Close a tab by ID |
| `navigate` | `tabId: number, url: string` | `Promise<{ url: string; title: string }>` | Navigate an existing tab to a URL |
| `getPageText` | `tabId: number` | `Promise<string>` | Get the text content of a page |
| `readPage` | `tabId: number, opts?: { selector?; maxLength? }` | `Promise<string>` | Read simplified DOM tree |
| `find` | `tabId: number, query: string` | `Promise<string>` | Find elements by CSS selector or text search |
| `executeJs` | `tabId: number, code: string` | `Promise<string>` | Execute JavaScript in a tab |
| `screenshot` | `tabId: number, opts?: { fullPage? }` | `Promise<Buffer>` | Take a PNG screenshot |
| `click` | `tabId: number, target: { x, y } \| { selector }` | `Promise<void>` | Click at coordinates or on a selector |
| `type` | `tabId: number, text: string, selector?: string` | `Promise<void>` | Type text, optionally into a selector |
| `press` | `tabId: number, key: string` | `Promise<void>` | Press a key or key combination |
| `scroll` | `tabId: number, direction: 'up' \| 'down', amount?: number` | `Promise<void>` | Scroll the page |
| `formInput` | `tabId: number, selector: string, value: string` | `Promise<void>` | Fill a form field |
| `wait` | `tabId: number, opts: { ms?; selector? }` | `Promise<void>` | Wait for duration or selector appearance |
| `close` | — | `Promise<void>` | Shut down the browser and clean up all state |

## Invariants

1. **Max tabs**: `MAX_PAGES = 20`. `createTab` throws if limit is reached.
2. **Navigation timeout**: `NAV_TIMEOUT = 30,000ms` for all `goto` calls.
3. **Lazy launch**: Browser is only launched on first use via `ensureBrowser()`.
4. **Launch serialization**: Concurrent calls to `ensureBrowser` wait for the in-progress launch rather than launching a second browser.
5. **Tab auto-cleanup**: Pages register a `close` event handler that removes them from the internal map.

## Behavioral Examples

### Scenario: Lazy browser launch
- **Given** no browser is running
- **When** `createTab("https://example.com")` is called
- **Then** `ensureBrowser()` launches Chrome, creates a tab, navigates to the URL, and returns tab info

### Scenario: Max tabs exceeded
- **Given** 20 tabs are already open
- **When** `createTab()` is called
- **Then** throws "Maximum 20 tabs reached. Close some tabs first."

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Browser launch fails (no Chrome installed) | Throws error; `browser` and `context` remain null |
| Tab ID not found | Throws with available tab IDs listed |
| Max tabs exceeded | Throws descriptive error |
| Navigation timeout | Playwright timeout error propagates |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `playwright` | `chromium.launch`, `Browser`, `BrowserContext`, `Page` |
| `server/lib/logger.ts` | `createLogger` for structured logging |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/browser.ts` | `BrowserService` instance via `ctx.browserService` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-20 | corvid-agent | Initial spec |
