# corvid-agent

Decentralized development agent platform built on Algorand — spawns, orchestrates, and monitors AI agents that do real software engineering work with on-chain identity, encrypted inter-agent communication, and structured multi-agent deliberation.

See [VISION.md](VISION.md) for the full project manifesto. See [skills/](skills/README.md) for detailed guides on every capability.

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
  routes/        — HTTP API routes (52 modules)
  selftest/      — Self-test service
  telegram/      — Bidirectional Telegram bridge (long-polling, voice notes, STT)
  voice/         — TTS via OpenAI tts-1, STT via Whisper, audio caching
  work/          — Work task service (branch, run agent, validate, PR)
  ws/            — WebSocket handler
client/          — Angular 21 mobile-first dashboard
shared/          — Shared TypeScript types (server + client)
deploy/          — Dockerfile, docker-compose, systemd, macOS LaunchAgent
e2e/             — Playwright end-to-end tests
skills/          — AI agent skills (30 skill files)
```

## Tech Stack

- **Runtime:** Bun
- **Database:** bun:sqlite (28 migration files, schema version 103)
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

These files **must not** be modified by agents (enforced in `sdk-process.ts`):

- `sdk-process.ts`, `CLAUDE.md` (basename-protected)
- `.env`, `corvid-agent.db`, `wallet-keystore.json`, `server/selftest/` (path-protected)

## Repository Boundaries

The **Flock Directory smart contract** source lives in [`CorvidLabs/flock-directory-contract`](https://github.com/CorvidLabs/flock-directory-contract) — not in this repo. This repo only contains the generated client and on-chain client facade. Do not add TEALScript/TEAL artifacts here.

## Module Specifications

Specs in `specs/` are the source of truth. Read the relevant spec before modifying files listed in its `files:` frontmatter. If your change violates a spec invariant, update the spec first. Specs take precedence over code comments.

## Verification

Always run before committing — see [verification skill](skills/verification/SKILL.md) for details:

```bash
bun run lint                          # Biome lint check
bun x tsc --noEmit --skipLibCheck     # TypeScript type checking
bun test                              # Test suite
bun run spec:check                    # Spec invariant verification
```

## Coding Conventions

- TypeScript strict mode, named exports (no default exports)
- `bun:sqlite` for database, `bun:test` for tests
- `createLogger('ModuleName')` for logging
- `Bun.spawn` over `child_process` for subprocesses
- Typed error enums with `Sendable` conformance patterns

## Skills Reference

Detailed guides for every workflow and tool live in `skills/`. Key skills:

| Category | Skills |
|----------|--------|
| **Tools** | algochat, coding, code-analysis, contacts, credits, health, memory, owner-comms, projects, repo-management, search, agent-discovery |
| **Workflows** | git, github, work-tasks, scheduling, orchestration, verification, testing |
| **Platforms** | discord, telegram, messaging, voice, smart-contracts, flock-directory, reputation |
| **Languages** | swift, rest-api, database |

## Common Patterns

### Adding an MCP Tool
1. Add handler in `server/mcp/tool-handlers.ts`
2. Register with `tool()` in `server/mcp/sdk-tools.ts`
3. If needed, add service to `McpToolContext` and plumb through `manager.ts`

### Personas & Skill Bundles
- Persona CRUD: `server/db/personas.ts`, routes: `server/routes/personas.ts`
- Skill bundles: `server/db/skill-bundles.ts`, routes: `server/routes/skill-bundles.ts`
- Both injected at session start via `server/process/manager.ts`

## Self-Knowledge: Check Before Claiming

Before claiming you **cannot** do something or that a capability is **missing**:

1. **Check your MCP tools** — list what's available in the current session
2. **Check `skills/`** — read `skills/README.md` or the specific `skills/<name>/SKILL.md` for capability docs
3. **Check `server/routes/`** — REST endpoints exist beyond MCP tools (e.g., `POST /api/discord/send-image`)
4. **Check `specs/routes/routes.spec.md`** — the API reference for all HTTP endpoints

**Never claim a capability doesn't exist without checking these locations first.** Filing an issue about a missing feature that already exists wastes developer time.

## Verification Before Claims

- **Deployment state**: Always `git fetch origin` and compare against `origin/main` before claiming deployed code is stale or out of date. Never base deployment claims solely on local branch state.
- **Contact lookup**: Always use `corvid_lookup_contact` before claiming a contact cannot be found. Exhaust all lookup tools before giving up.
- **Memory state**: Use `corvid_recall_memory` or `corvid_read_on_chain_memories` to check for memories before claiming none exist. Memories are stored as ARC-69 ASAs on localnet — `read_on_chain_memories` reads both ASA and plain transaction memories.

## Instance Configuration

Operators can add deployment-specific configuration in `.claude/CLAUDE.md`. See the [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) for details.
