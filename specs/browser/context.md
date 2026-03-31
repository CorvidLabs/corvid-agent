# Browser Service — Context

## Why This Module Exists

Some agent tasks require web interaction — scraping pages, filling forms, taking screenshots, testing web UIs. The browser service provides a managed Playwright instance that agents can use via the `corvid_browser` MCP tool without needing to manage browser lifecycle themselves.

## Architectural Role

Browser is a **shared infrastructure service** — a single headless Chrome instance that all agent sessions share. It's lazily initialized (only started when first used) to avoid wasting resources.

## Key Design Decisions

- **System Chrome, not bundled**: Uses the system-installed Chrome rather than a bundled Chromium. This reduces binary size and leverages the host's GPU acceleration.
- **Headless by default**: Runs headless for server deployments. Can be switched to headed mode for debugging.
- **Shared instance**: One browser instance serves all agents to avoid memory bloat from multiple browser processes.

## Relationship to Other Modules

- **MCP Tools**: The `corvid_browser` tool delegates to this service.
- **Deep Research**: The research tool uses the browser for web page fetching when needed.
