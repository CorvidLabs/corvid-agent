---
spec: doctor.spec.md
---

## User Stories

- As an agent operator, I want to run a single command that checks all platform dependencies so that I can quickly diagnose setup issues
- As an agent developer, I want actionable fix suggestions for each failing check so that I can resolve problems without searching documentation
- As a platform administrator, I want the doctor command to verify database availability, API keys, and service connectivity so that I can confirm the platform is ready to operate
- As an agent operator, I want the command to exit with a non-zero code on any failure so that I can use it in CI pipelines or setup scripts

## Acceptance Criteria

- `doctorCommand` checks Bun version and reports failure if below 1.0 with upgrade instructions
- `doctorCommand` checks Node.js availability
- `doctorCommand` checks that the `corvid-agent.db` database file exists at the project root; suggests running migrations if missing
- `doctorCommand` validates the `ANTHROPIC_API_KEY` environment variable is set; suggests adding it to `.env` if missing
- `doctorCommand` checks the server port is accessible
- `doctorCommand` verifies AlgoChat/Algorand localnet connectivity; suggests `algokit localnet start` on failure
- `doctorCommand` validates the GitHub token by making an API call; suggests regeneration link on 401
- Each check prints a pass/fail icon with a descriptive label and optional detail text
- Failing checks include a human-readable fix suggestion
- The command exits with code 1 if any check fails, code 0 if all pass
- Environment variables are loaded from `.env` without overwriting existing `process.env` values
- The project root is discovered by walking up from `cwd` looking for `package.json` containing `corvid-agent`

## Constraints

- The command must run without a running server (it checks prerequisites, not runtime state)
- Must load `.env` files without overwriting existing environment variables
- Depends on `cli/config.ts` for server URL configuration and `cli/render.ts` for formatting
- All output goes to stdout for consistent terminal display

## Out of Scope

- Automatically fixing detected issues (doctor only diagnoses)
- Checking runtime server health or API endpoint availability
- Verifying Ollama or other optional AI provider connectivity
- Database schema validation or migration execution
- Checking disk space or system resource availability
