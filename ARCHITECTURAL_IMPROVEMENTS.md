# CorvidAgent Architecture

## Overview

CorvidAgent is a **local-first** AI agent platform. Each user runs their own instance on their own machine (or VM/sandbox) with their own AI provider credentials. There is no multi-tenant server.

The only external communication channel is **AlgoChat** — on-chain messaging on Algorand. This gives agents cryptographic identity without passwords or central auth servers.

## Core Components

### AlgoChat Bridge (`server/algochat/`)
- Polls Algorand for incoming messages
- Routes messages to the correct agent
- Handles owner authorization via `ALGOCHAT_OWNER_ADDRESSES`
- Supports PSK encryption and group messaging

### Agent Sessions (`server/process/`)
- Spawns Claude Agent SDK subprocesses per agent
- Session lifecycle management with automatic cleanup
- Configurable timeout (default 30 min)
- Approval system for privileged operations

### Dashboard API (`server/routes/`)
- REST API on localhost for the web dashboard
- CRUD for projects, agents, sessions, work tasks
- No authentication (localhost only) — CORS allows all origins
- Global error boundary returns proper JSON errors

### Work Tasks (`server/work/`)
- Git branch-based task execution
- Agents implement changes, run validation, open PRs
- Requires `GH_TOKEN` for GitHub integration

### Credit System (`server/db/credits.ts`)
- Tracks per-wallet message credits
- Purchased with ALGO, consumed per conversation turn
- Configurable rates via environment or database

### Spending Tracker (`server/db/spending.ts`)
- Daily ALGO spending limits (default: 10 ALGO/day)
- Prevents runaway agent spending
- Checked before every blockchain transaction

## API Input Validation

All API routes validate input with Zod schemas (`server/lib/validation.ts`):
- 20+ schemas covering all endpoints
- `parseBodyOrThrow()` for request body validation
- `parseQuery()` for query parameter validation
- Consistent error responses for malformed input

## Testing

122 tests covering:
- Database CRUD operations and schema validation
- All Zod schemas and parse helpers
- API route integration (malformed input, CRUD)
- Encryption (AES-256-GCM wallet encryption)

```bash
bun test           # Run all tests
bun test --watch   # Watch mode
```

## Deployment

### Local (default)
```bash
cp .env.example .env  # Configure your mnemonic and API key
bun install
bun run dev           # Development with hot reload
bun server/index.ts   # Production
```

### Server (optional)
Example configs in `deploy/` for Docker, systemd, and macOS launchd. Add a reverse proxy with auth if exposing to the network — see `SECURITY.md`.
