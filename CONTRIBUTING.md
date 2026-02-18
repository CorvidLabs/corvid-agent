# Contributing to CorvidAgent

Thanks for your interest in contributing to CorvidAgent! This document covers the basics for getting started.

## Getting Started

1. **Fork the repo** and clone your fork
2. **Install dependencies**: `bun install`
3. **Copy the env template**: `cp .env.example .env`
4. **Fill in required values** in `.env` (see below)
5. **Start the dev server**: `bun run dev`

### Required Environment Variables

At minimum you need:
- `ALGOCHAT_MNEMONIC` — 25-word Algorand mnemonic for the agent's wallet
- `ANTHROPIC_API_KEY` — for agent sessions (optional if you're only working on non-agent features)

See `.env.example` for the full list of configuration options.

## Development

```bash
# Run the server in watch mode
bun run dev

# Run tests
bun test

# Run e2e tests (requires Playwright)
bun run test:e2e

# Build the Angular client
bun run build:client
```

## Project Structure

```
server/           # Bun HTTP server, routes, and core logic
  algochat/       # On-chain messaging bridge
  db/             # SQLite database access layer (47 migrations)
  discord/        # Bidirectional Discord bridge (raw WebSocket)
  lib/            # Shared utilities (logger, crypto, validation)
  mcp/            # MCP tool server
  middleware/     # HTTP/WS auth, CORS, startup security checks
  process/        # Agent lifecycle (SDK + Ollama, persona/skill injection)
  routes/         # REST API route handlers (26 modules)
  selftest/       # Self-test service
  telegram/       # Bidirectional Telegram bridge (long-polling, voice)
  voice/          # TTS (OpenAI) and STT (Whisper) with caching
  work/           # Work task service (branch, agent, validate, PR)
  ws/             # WebSocket handler
client/           # Angular 21 mobile-first UI
shared/           # Types and constants shared between server and client
e2e/              # Playwright end-to-end tests
deploy/           # Deployment configs (Docker, systemd, launchd)
```

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
- Keep the first line under 70 characters
- Add detail in the body if the change is non-trivial

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Verify before pushing:
   ```bash
   bunx tsc --noEmit --skipLibCheck   # type-check
   bun test                           # unit tests
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
