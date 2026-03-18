# corvid-agent

Decentralized development agent platform built on Algorand — spawns, orchestrates, and monitors AI agents that do real software engineering work with on-chain identity, encrypted inter-agent communication, and structured multi-agent deliberation.

See [VISION.md](VISION.md) for the full project manifesto: positioning, architecture, competitive landscape, technical principles, and long-term direction. VISION.md is the canonical source of truth for project identity.

## Architecture

```
server/          — Bun server (API, WebSocket, process management)
  algochat/      — On-chain messaging, wallets, agent directory
  db/            — SQLite via bun:sqlite (sessions, agents, projects, spending, credits, personas, skills)
  discord/       — Bidirectional Discord bridge (raw WebSocket gateway, no discord.js)
  lib/           — Shared utilities (logger, crypto, validation)
  mcp/           — MCP tool definitions and handlers (corvid_* tools)
  middleware/    — HTTP/WS auth, CORS, startup security checks
  process/       — Session lifecycle, SDK integration, approval flow, persona/skill injection
  routes/        — HTTP API routes (34 modules)
  selftest/      — Self-test service
  telegram/      — Bidirectional Telegram bridge (long-polling, voice notes, STT)
  voice/         — TTS via OpenAI tts-1, STT via Whisper, audio caching
  work/          — Work task service (branch, run agent, validate, PR)
  ws/            — WebSocket handler
client/          — Angular 21 mobile-first dashboard
shared/          — Shared TypeScript types (server + client)
deploy/          — Dockerfile, docker-compose, systemd, macOS LaunchAgent
e2e/             — Playwright end-to-end tests
```

## Tech Stack

- **Runtime:** Bun
- **Database:** bun:sqlite (62 migrations)
- **Agent SDK:** @anthropic-ai/claude-agent-sdk
- **MCP:** @modelcontextprotocol/sdk
- **Frontend:** Angular (standalone components, signals)
- **Blockchain:** Algorand (AlgoChat, wallets)
- **Voice:** OpenAI TTS (tts-1) and Whisper (STT)

## Algorand Network Topology

- **`localnet`** — Always used for agents on the same machine. Requires Docker + `algokit localnet start`. This is the default and correct setting for `ALGORAND_NETWORK` in `.env`.
- **`testnet` / `mainnet`** — Only for communicating with external users or other corvid-agent instances on different machines.

**Never set `ALGORAND_NETWORK=testnet` for local development.** Testnet wallets cost real testnet ALGO and transactions are slow. Localnet is free, instant, and self-contained.

## Protected Files

These files **must not** be modified by agents (enforced in `sdk-process.ts`).
Uses basename matching for unique filenames and substring matching for paths.

**Basename-protected:**
- `sdk-process.ts`, `CLAUDE.md`

**Path-protected:**
- `.env`, `corvid-agent.db`, `wallet-keystore.json`
- `server/selftest/`

## Repository Boundaries

The **Flock Directory smart contract** source code lives in [`CorvidLabs/flock-directory-contract`](https://github.com/CorvidLabs/flock-directory-contract) — **not** in this repo. This repo only contains:
- The **generated client** (`server/flock-directory/contract/FlockDirectoryClient.generated.ts`) for interacting with the deployed contract via ABI
- The **on-chain client facade** (`server/flock-directory/on-chain-client.ts`) that wraps the generated client

Do **not** add TEALScript source, TEAL bytecode, or any smart contract authoring artifacts to this repo. Contract development, compilation, and deployment artifacts belong in `flock-directory-contract`.

## Module Specifications

Specs in `specs/` are the source of truth for module behavior.

Before modifying any file listed in a spec's `files:` frontmatter,
read the corresponding spec and understand its invariants.

After modifying, run `bun run spec:check` alongside the existing
verification commands.

If your change violates a spec invariant, update the spec first
(add a Change Log entry) before proceeding.

Specs take precedence over code comments. If code contradicts
the spec, the code is the bug.

## Verification

Always run before committing:

```bash
bun x tsc --noEmit --skipLibCheck
bun test
bun run spec:check
```

All must pass. Work tasks auto-validate with tsc and test commands and will iterate up to 3 times on failure.

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

### Personas

Persona CRUD lives in `server/db/personas.ts`. Routes in `server/routes/personas.ts`.
`composePersonaPrompt()` builds the system prompt section. Injected via `server/process/manager.ts`.

### Skill Bundles

Bundle CRUD and assignment in `server/db/skill-bundles.ts`. Routes in `server/routes/skill-bundles.ts`.
`resolveAgentPromptAdditions()` and `resolveAgentTools()` merge bundles at session start.

### Bidirectional Bridges

- **Telegram:** `server/telegram/bridge.ts` — long-polling, voice notes via STT, voice responses via TTS
- **Discord:** `server/discord/bridge.ts` — raw WebSocket gateway, heartbeat, reconnect

Both are initialized in `server/index.ts` when their env vars are set. Both use the same session routing pattern: find-or-create a session per user, subscribe for responses, debounce and send back.

### Voice (TTS/STT)

- `server/voice/tts.ts` — `synthesize()` and `synthesizeWithCache()` (hashes text, checks `voice_cache` table)
- `server/voice/stt.ts` — `transcribe()` calls OpenAI Whisper API
- Both gated behind `OPENAI_API_KEY`

## Self-Improvement Workflow

Agents can create work tasks via `corvid_create_work_task` to propose codebase improvements:

1. Agent calls `corvid_create_work_task` with a description
2. Service creates a git worktree with a new branch, starts a new agent session
3. Agent implements changes, commits, runs validation
4. On validation pass, agent creates a PR
5. On validation fail, up to 3 iteration attempts are made
6. Worktree is cleaned up after completion (branch persists for PR review)

Protected files cannot be modified even in full-auto mode.

## Instance Configuration

Operators can add deployment-specific configuration (GitHub org, focus priorities, delegation model, community rules, security policies) in `.claude/CLAUDE.md`. See the [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) for details on project-level configuration.
