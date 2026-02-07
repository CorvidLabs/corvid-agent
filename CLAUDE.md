# corvid-agent

Agent orchestration platform — manages Claude agent sessions with MCP tools, AlgoChat messaging, and on-chain wallet integration.

## Architecture

```
server/          — Bun server (API, WebSocket, process management)
  algochat/      — On-chain messaging, wallets, agent directory
  db/            — SQLite via bun:sqlite (sessions, agents, projects, spending, credits)
  lib/           — Shared utilities (logger, crypto, validation)
  mcp/           — MCP tool definitions and handlers (corvid_* tools)
  middleware/    — HTTP/WS auth, CORS, startup security checks
  process/       — Session lifecycle, SDK integration, approval flow
  routes/        — HTTP API routes
  selftest/      — Self-test service
  work/          — Work task service (branch, run agent, validate, PR)
  ws/            — WebSocket handler
client/          — Angular 21 mobile-first dashboard
shared/          — Shared TypeScript types (server + client)
deploy/          — Dockerfile, docker-compose, systemd, macOS LaunchAgent
e2e/             — Playwright end-to-end tests
```

## Tech Stack

- **Runtime:** Bun
- **Database:** bun:sqlite
- **Agent SDK:** @anthropic-ai/claude-agent-sdk
- **MCP:** @modelcontextprotocol/sdk
- **Frontend:** Angular (standalone components, signals)
- **Blockchain:** Algorand (AlgoChat, wallets)

## Protected Files

These files **must not** be modified by agents (enforced in `sdk-process.ts`).
Uses basename matching for unique filenames and substring matching for paths.

**Basename-protected:**
- `spending.ts`, `sdk-process.ts`, `manager.ts`, `sdk-tools.ts`, `tool-handlers.ts`
- `schema.ts`, `package.json`, `CLAUDE.md`

**Path-protected:**
- `.env`, `corvid-agent.db`, `wallet-keystore.json`
- `server/index.ts`, `server/algochat/bridge.ts`, `server/algochat/config.ts`
- `server/selftest/`

## Verification

Always run before committing:

```bash
bunx tsc --noEmit --skipLibCheck
bun test
```

Both must pass. Work tasks auto-validate with these commands and will iterate up to 3 times on failure.

## Coding Conventions

- TypeScript strict mode
- Named exports (no default exports)
- Use `bun:sqlite` for database access, `bun:test` for tests
- Use `createLogger('ModuleName')` for logging
- Errors: define typed error enums with `Sendable` conformance patterns
- Prefer `Bun.spawn` over `child_process` for subprocesses

## Common Patterns

### Adding an MCP Tool

1. Add handler function in `server/mcp/tool-handlers.ts`
2. Register with `tool()` in `server/mcp/sdk-tools.ts`
3. If the handler needs a new service, add it to `McpToolContext` and plumb through `manager.ts`

### Database Migrations

Add table creation / migration SQL in `server/db/schema.ts` inside the `MIGRATIONS` object.

### API Endpoints

Add route handlers in `server/routes/` and register in `server/routes/index.ts`.

## Self-Improvement Workflow

Agents can create work tasks via `corvid_create_work_task` to propose codebase improvements:

1. Agent calls `corvid_create_work_task` with a description
2. Service creates a git worktree with a new branch, starts a new agent session
3. Agent implements changes, commits, runs validation
4. On validation pass, agent creates a PR
5. On validation fail, up to 3 iteration attempts are made
6. Worktree is cleaned up after completion (branch persists for PR review)

Protected files cannot be modified even in full-auto mode.
