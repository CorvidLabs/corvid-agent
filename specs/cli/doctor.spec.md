---
module: cli-doctor
version: 1
status: active
files:
  - cli/commands/doctor.ts
db_tables: []
depends_on:
  - specs/config/loader.spec.md
---

# CLI Doctor

## Purpose

Performs a comprehensive system health check for the corvid-agent platform. Validates runtime dependencies (Bun, Node.js), database availability, AI provider API keys, server port accessibility, AlgoChat/Algorand localnet connectivity, and GitHub token validity. Provides actionable fix suggestions for each failing check.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `doctorCommand` | `()` | `Promise<void>` | Run all health checks and print results to stdout. Exits with code 1 if any check fails |

## Invariants

1. Each check prints a pass/fail icon with a label and optional detail
2. Failing checks include a human-readable fix suggestion
3. The command exits with code 1 if any check fails, 0 if all pass
4. Environment variables are loaded from `.env` without overwriting `process.env`
5. The project root is discovered by walking up from `cwd` looking for `package.json` containing `corvid-agent`

## Behavioral Examples

### Scenario: All checks pass

- **Given** Bun >= 1.0, Node.js installed, database exists, Anthropic key set, server port available, AlgoChat reachable, GitHub token valid
- **When** `doctorCommand()` is called
- **Then** all checks print with green checkmarks and the process exits normally

### Scenario: Missing Anthropic API key

- **Given** `ANTHROPIC_API_KEY` is not set in environment or `.env`
- **When** `doctorCommand()` is called
- **Then** the Anthropic check fails with a fix suggestion to add the key

### Scenario: Database file missing

- **Given** no `corvid-agent.db` file exists at the expected path
- **When** `doctorCommand()` is called
- **Then** the database check fails with a suggestion to run migrations

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Project root not found | Database check fails with suggestion to run from project directory |
| Bun version < 1.0 | Bun check fails with upgrade instructions |
| GitHub token invalid (401) | GitHub check fails with regeneration link |
| AlgoChat localnet unreachable | AlgoChat check fails with `algokit localnet start` suggestion |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `cli/config.ts` | `loadConfig()` for server URL |
| `cli/render.ts` | `c` color/formatting helpers |

### Consumed By

| Module | What is used |
|--------|-------------|
| `cli/index.ts` | `doctorCommand` registered as CLI subcommand |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-28 | corvid-agent | Initial spec |
