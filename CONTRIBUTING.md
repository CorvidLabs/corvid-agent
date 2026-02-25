# Contributing to CorvidAgent

Thanks for your interest in contributing to CorvidAgent! This document covers everything you need to get started.

## Quick Setup

The fastest way to get a development environment running:

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bash scripts/dev-setup.sh
```

The setup script checks prerequisites, copies `.env.example`, installs dependencies, builds the client, and verifies the server starts. Run with `--skip-prompts` for non-interactive mode.

### Manual Setup

1. **Fork the repo** and clone your fork
2. **Install Bun** (>= 1.3.0): `curl -fsSL https://bun.sh/install | bash`
3. **Install dependencies**: `bun install`
4. **Copy the env template**: `cp .env.example .env`
5. **Fill in required values** in `.env` (see below)
6. **Build the client**: `bun run build:client`
7. **Start the dev server**: `bun run dev`

### Required Environment Variables

At minimum you need:
- `ANTHROPIC_API_KEY` — for Claude agent sessions (optional if using Ollama-only mode)

Optional but recommended:
- `GH_TOKEN` — for GitHub integration (PRs, issues, webhooks)
- `ALGOCHAT_MNEMONIC` — 25-word Algorand mnemonic for on-chain identity

For 100% local mode with no cloud dependencies, set `ENABLED_PROVIDERS=ollama` and ensure Ollama is running locally.

See `.env.example` for the full list of 50+ configuration options with descriptions.

## Architecture Overview

```
                    +--------------------------+
                    |   Angular 21 Dashboard   |
                    |  (signals, standalone)   |
                    +------------+-------------+
                                 |
                            HTTP / WebSocket
                                 |
+--------------------------------+--------------------------------+
|                     Bun Server (port 3000)                      |
|                                                                 |
|  +----------+  +----------+  +-----------+  +----------------+  |
|  | Process  |  | Council  |  | Scheduler |  | Work Tasks     |  |
|  | Manager  |  | Engine   |  | Service   |  | (git worktree) |  |
|  +----------+  +----------+  +-----------+  +----------------+  |
|  | Telegram |  | Discord  |  | Voice     |  | Personas       |  |
|  | Bridge   |  | Bridge   |  | TTS / STT |  | + Skills       |  |
|  +----------+  +----------+  +-----------+  +----------------+  |
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                    SQLite (bun:sqlite)                     |  |
|  |  52 migrations | FTS5 search | WAL mode | foreign keys    |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

### Key Concepts

- **Agents** — AI entities with configurable models, permissions, personas, and skill bundles
- **Sessions** — Conversations between a user and an agent, streamed via WebSocket
- **Councils** — Multi-agent deliberation with a chairman that synthesizes responses
- **Work Tasks** — Self-improvement pipeline: branch, code, validate (type-check + tests), PR
- **Workflows** — DAG-based multi-step orchestration with suspend/resume
- **Schedules** — Cron/interval automation with optional approval gates
- **AlgoChat** — On-chain encrypted messaging via Algorand
- **Bridges** — Bidirectional Telegram, Discord, and Slack integrations

### Project Structure

```
server/           Bun HTTP + WebSocket server
  algochat/       On-chain messaging (bridge, wallet, directory)
  ast/            Tree-sitter AST parser for code understanding
  billing/        Usage metering and Stripe billing
  db/             SQLite schema (52 migrations) and query modules
  discord/        Bidirectional Discord bridge (raw WebSocket)
  github/         GitHub API operations (PRs, issues, reviews)
  lib/            Shared utilities (logger, crypto, validation, dedup)
  mcp/            MCP tool server and 36 corvid_* tool handlers
  middleware/     Auth, CORS, rate limiting, startup validation
  process/        Agent lifecycle (SDK + Ollama, persona/skill injection)
  routes/         REST API route handlers (28 modules)
  scheduler/      Cron/interval execution engine
  telegram/       Bidirectional Telegram bridge (long-polling, voice)
  voice/          TTS (OpenAI) and STT (Whisper) with caching
  work/           Work task service (worktree, branch, validate, PR)
  workflow/       Graph-based DAG workflow orchestration
  ws/             WebSocket handlers with pub/sub
client/           Angular 21 SPA (standalone components, signals)
shared/           TypeScript types shared between server and client
e2e/              Playwright end-to-end tests (30 spec files)
deploy/           Docker, docker-compose, systemd, launchd, nginx, caddy
packages/         Workspace packages (env, result utilities)
scripts/          Developer tooling and automation scripts
specs/            Module specification documents (33 specs)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (server, package manager, test runner) |
| Language | TypeScript (strict mode) |
| Frontend | Angular 21 (standalone components, signals) |
| Database | SQLite via bun:sqlite (WAL, FTS5) |
| Agent SDK | Claude Agent SDK + Ollama |
| Validation | Zod (runtime schema validation) |
| Blockchain | Algorand (AlgoChat, wallets) |
| Observability | OpenTelemetry (tracing + Prometheus metrics) |

### Database

SQLite with embedded migrations in `server/db/schema.ts`. The database is auto-created and migrated on first server start — no separate migration step needed. The current schema version is 52 with 47+ tables.

Key patterns:
- All queries use parameterized statements (no string interpolation)
- WAL mode for concurrent reads
- FTS5 full-text search for memory queries
- Foreign keys enforced

## Development

### Common Commands

```bash
# Start the server in watch mode (auto-restarts on file changes)
bun run dev

# Run all server unit tests
bun test

# Run a specific test file
bun test server/__tests__/db.test.ts

# Run E2E tests (requires Playwright: npx playwright install)
bun run test:e2e

# Run E2E tests in UI mode (interactive)
bun run test:e2e:ui

# Build the Angular client
bun run build:client

# Run Angular client dev server (separate terminal)
bun run dev:client

# Run Angular component tests
cd client && npx vitest run

# Type-check the entire project
bunx tsc --noEmit --skipLibCheck

# Validate module specs
bun run spec:check

# Check for SQL injection patterns
bun run lint:sql
```

### Development Workflow

1. **Start the server**: `bun run dev` — starts on `http://localhost:3000` with file watching
2. **Make changes** — the server restarts automatically on save
3. **Test your changes** — run the relevant tests (see Testing section)
4. **Type-check before committing**: `bunx tsc --noEmit --skipLibCheck`

### Code Patterns

- **Logging**: Use `createLogger('module-name')` from `server/lib/logger.ts` — never `console.log`
- **Validation**: Use Zod schemas for request/response validation
- **Error handling**: Always catch and log errors with context
- **Database queries**: Use parameterized queries only — run `bun run lint:sql` to check
- **Route handlers**: Follow existing patterns in `server/routes/`
- **Types**: Shared types go in `shared/`, server-only types stay in `server/`

## Testing

### Unit Tests (1757+)

```bash
bun test                              # Run all tests (~30s)
bun test server/__tests__/db.test.ts  # Run a specific file
bun test --watch                      # Watch mode
```

Tests live in `server/__tests__/` (119 test files) and cover API routes, authentication, billing, database, bridges (Discord/Telegram/Slack), GitHub tools, MCP handlers, scheduling, workflows, and more.

### E2E Tests (348)

```bash
npx playwright install                # One-time: install browsers
bun run test:e2e                      # Run all E2E tests
bun run test:e2e:ui                   # Interactive UI mode
```

E2E tests are in `e2e/` (30 spec files) and cover 198/202 testable API endpoints plus all Angular UI routes. The test config starts a dev server on port 3001 automatically.

### Client Tests

```bash
cd client && npx vitest run           # Run Angular component tests (~2s)
cd client && npx vitest               # Watch mode
```

### Module Spec Validation

```bash
bun run spec:check                    # Validate 33 module specs in specs/
```

Checks YAML frontmatter, required sections, API surface coverage, file existence, and dependency graph integrity.

### Writing Tests

- Place server tests in `server/__tests__/`
- Use Bun's built-in test runner (`describe`, `it`, `expect`)
- Mock external dependencies (APIs, file system) rather than making real calls
- Follow existing test patterns for consistency

## Making Changes

### Before You Start

- Check [existing issues](https://github.com/CorvidLabs/corvid-agent/issues) to avoid duplicating work
- For significant changes, open an issue first to discuss the approach

### Code Style

- **TypeScript** throughout — no `any` types unless absolutely necessary
- **Structured logging** via `createLogger()` — never use `console.log`
- **Error handling** — always catch and log errors with context
- Keep functions focused and files under ~300 lines where practical

### Commit Messages

Write clear, concise commit messages:
- Use imperative mood: "Add feature" not "Added feature"
- Prefix with type: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Keep the first line under 70 characters
- Add detail in the body if the change is non-trivial

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Verify before pushing:
   ```bash
   bunx tsc --noEmit --skipLibCheck   # type-check
   bun test                           # unit tests
   bun run lint:sql                   # SQL injection check
   ```
4. Open a PR with:
   - A short title describing the change
   - A summary of what and why
   - A test plan (how to verify the change works)

## Reporting Issues

When filing a bug report, include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Bun version, Node version)
- Relevant logs (redact any secrets!)

## Security

If you discover a security vulnerability, **do not open a public issue**. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
