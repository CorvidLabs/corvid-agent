---
spec: doctor.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/cli-commands.test.ts` | Unit | CLI command registration, subcommand dispatch, help text |
| `server/__tests__/cli-config.test.ts` | Unit | `loadConfig()`: file reading, defaults, missing file handling |
| `server/__tests__/cli-render.test.ts` | Unit | Color/formatting helpers output |
| `server/__tests__/cli-client.test.ts` | Unit | CLI HTTP client for API calls |
| `server/__tests__/cli-chat.test.ts` | Unit | Chat command logic |
| `server/__tests__/cli-init.test.ts` | Unit | Init command scaffolding |
| `server/__tests__/cli-interactive.test.ts` | Unit | Interactive REPL mode |
| `server/__tests__/cli-utils.test.ts` | Unit | Shared CLI utility functions |

Note: `doctorCommand` itself is difficult to unit test due to its reliance on real system state (Bun version, filesystem, network). Its logic is tested via integration testing and manual verification.

## Manual Testing

- [ ] Run `bun run cli doctor` from the project root with all services running; confirm all checks show green checkmarks and exit code 0
- [ ] Run `bun run cli doctor` without `ANTHROPIC_API_KEY` set; confirm the Anthropic check fails with a descriptive fix suggestion
- [ ] Run `bun run cli doctor` with no `corvid-agent.db` file; confirm the database check fails with a suggestion to run migrations
- [ ] Run `bun run cli doctor` from a directory outside the project root; confirm the database check fails with a "run from project directory" suggestion
- [ ] Run `bun run cli doctor` with an invalid `GITHUB_TOKEN` (set to `invalid`); confirm the GitHub check fails with a 401 indication and a link to regenerate
- [ ] Bring down `algokit localnet`; run doctor and confirm the AlgoChat check fails with `algokit localnet start` suggestion
- [ ] Verify exit code: `bun run cli doctor; echo $?` — should be `0` when all pass, `1` when any fail

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Project root not found (no `package.json` with `corvid-agent`) | Database check fails with suggestion to run from project directory |
| Bun version is exactly `1.0.0` | Bun check passes (minimum version is 1.0) |
| Bun version is `0.9.9` | Bun check fails with upgrade instruction |
| `.env` file has `ANTHROPIC_API_KEY` but `process.env` already has it set | Env loading does not overwrite; uses the existing value |
| GitHub token has correct format but is expired/invalid | GitHub API returns 401; check fails with regeneration link |
| Server port is occupied by a different process | Port check fails; doctor still completes other checks and exits 1 |
| No network access (completely offline) | All network-based checks (GitHub, AlgoChat) fail gracefully with timeout errors |
