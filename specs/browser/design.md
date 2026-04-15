---
spec: service.spec.md
sources:
  - server/browser/service.ts
---

## Layout

The browser module is a single file: `server/browser/service.ts`. It exports `BrowserService` and the `BrowserTab` interface.

```
server/browser/
  service.ts   — BrowserService class managing Chrome lifecycle, tab map, and all browser operations
```

The service is instantiated once in `server/index.ts` and injected into the MCP tool context (`ctx.browserService`).

## Components

### BrowserService (service.ts)
Manages a singleton Playwright Chromium browser instance. Key internal state:
- `browser: Browser | null` — Playwright browser instance (null until first use)
- `context: BrowserContext | null` — Playwright browser context
- `pages: Map<number, Page>` — active tabs keyed by numeric ID
- `nextTabId: number` — auto-incrementing tab counter
- `launchPromise: Promise<void> | null` — serializes concurrent launch attempts

**Lazy initialization pattern:**
`ensureBrowser()` is called before any tab operation. If `launchPromise` is already set, concurrent callers await the same promise rather than launching a second browser instance.

**Tab auto-cleanup:**
Each `Page` registers a `close` event listener that removes it from the `pages` map, keeping the map accurate even when pages are closed externally (e.g., by navigation errors).

### Tab Operations
All tab operations (`navigate`, `getPageText`, `readPage`, `find`, `executeJs`, `screenshot`, `click`, `type`, `press`, `scroll`, `formInput`, `wait`) look up the page from `pages` map first and throw a descriptive error with available tab IDs if not found.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_PAGES` | `20` | Maximum concurrent open tabs |
| `NAV_TIMEOUT` | `30,000ms` | Playwright navigation timeout for all `goto` calls |
| Chrome launch mode | headless, system Chrome | Uses `executablePath: 'google-chrome'` or `chromium` |

## Assets

### External Dependencies
- `playwright` npm package — `chromium.launch`, `Browser`, `BrowserContext`, `Page`
- System Chrome installation — must be present for `ensureBrowser` to succeed

### Consumed By
- `server/mcp/tool-handlers/browser.ts` — all `corvid_browser` MCP tool operations route through `ctx.browserService`
