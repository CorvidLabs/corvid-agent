---
spec: service.spec.md
---

## User Stories

- As a team agent, I want to open a web page in a browser tab and read its content so that I can research information from the web during tasks
- As a team agent, I want to take screenshots of web pages so that I can visually verify page state or share results with humans
- As a team agent, I want to interact with web pages (click, type, fill forms) so that I can automate web-based workflows
- As an agent operator, I want the browser to launch lazily on first use so that system resources are not consumed when browser automation is not needed
- As a platform administrator, I want a hard limit on open tabs so that a runaway agent cannot exhaust system memory

## Acceptance Criteria

- `BrowserService.ensureBrowser` lazily launches a headless Chrome instance on first use; subsequent calls return immediately
- Concurrent calls to `ensureBrowser` serialize and wait for the in-progress launch rather than launching a second browser
- `createTab` creates a new browser tab and optionally navigates to a URL; returns a `BrowserTab` with `id`, `url`, and `title`
- `createTab` throws an error when `MAX_PAGES` (20) tabs are already open
- `closeTab` closes a tab by ID and removes it from the internal map
- `navigate` navigates an existing tab to a URL with a 30-second timeout (`NAV_TIMEOUT`)
- `getPageText` returns the full text content of a page
- `readPage` returns a simplified DOM tree, optionally filtered by CSS selector and truncated by `maxLength`
- `find` locates elements by CSS selector or text search and returns matching results
- `executeJs` runs arbitrary JavaScript in a tab's context and returns the result as a string
- `screenshot` returns a PNG buffer of the page, with optional full-page capture
- `click`, `type`, `press`, `scroll`, and `formInput` perform the corresponding browser interactions on the specified tab
- `wait` pauses for a specified duration or until a CSS selector appears
- `close` shuts down the browser and cleans up all internal state
- Tab close event handlers automatically remove closed tabs from the internal page map
- Requesting a non-existent tab ID throws an error listing available tab IDs

## Constraints

- Maximum 20 concurrent tabs per browser instance (`MAX_PAGES = 20`)
- Navigation timeout is 30 seconds (`NAV_TIMEOUT = 30000`)
- Requires system Chrome installation; Playwright `chromium.launch` is used
- Browser runs in headless mode only
- Single shared browser instance across all agent sessions
- No support for authenticated browser contexts (cookies, sessions) across tabs

## Out of Scope

- Multiple browser instances or browser pools
- Browser context isolation between agents or sessions
- File download or upload automation
- Browser extension support
- Non-Chrome browsers (Firefox, WebKit)
- Persistent browser sessions across server restarts
