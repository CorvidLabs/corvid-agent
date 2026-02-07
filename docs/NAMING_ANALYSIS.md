# Naming Analysis: "corvid-agent" vs "flock"

## Recommendation: Keep "corvid-agent"

After a thorough analysis of the codebase, the recommendation is to **keep the current name "corvid-agent"** (with display name "CorvidAgent"). The cost and risk of renaming significantly outweigh the benefits.

## Analysis

### Current Naming Footprint

The name "corvid" / "corvid-agent" / "CorvidAgent" appears in **47+ files** across every layer of the stack:

| Category | Files Affected | Examples |
|---|---|---|
| Package config | 2 | `package.json`, `bun.lock` |
| Documentation | 6 | `README.md`, `CLAUDE.md`, `SECURITY.md`, `CONTRIBUTING.md`, etc. |
| UI/Frontend | 3 | `index.html`, `header.component.ts`, `chat.html` |
| MCP tools | 2 | `stdio-server.ts`, `sdk-tools.ts` (6 tools with `corvid_` prefix) |
| Deployment | 5 | systemd unit, macOS plist, Dockerfile(s), daemon.sh, newsyslog |
| Server code | 3+ | `server/index.ts`, `sdk-process.ts` (database name), env vars |
| Environment | 2 | `.env.example`, env var names (`CORVID_AGENT_ID`, `CORVID_API_URL`) |
| GitHub/CI | 2 | `CODEOWNERS` (`@CorvidLabs/core`), clone URLs |
| Legal | 1 | `LICENSE` ("Copyright CorvidLabs") |

### External Dependencies

These are **outside the codebase** and would also need updating:

- **GitHub repository**: `CorvidLabs/corvid-agent`
- **GitHub organization**: `CorvidLabs`
- **NPM scoped package**: `@corvidlabs/ts-algochat`
- **macOS bundle identifier**: `com.corvidlabs.corvid-agent`
- **Algorand on-chain references**: Agent IDs and message history referencing "corvid"
- **Any deployed instances**: systemd services, Docker images, database files named `corvid-agent.db`

### Arguments For Keeping "corvid-agent"

1. **Brand coherence**: "Corvid" (the bird family including crows and ravens) perfectly fits the AI agent theme -- corvids are among the most intelligent birds, known for tool use, problem-solving, and social coordination. This maps directly to what the platform does.

2. **Organization alignment**: The GitHub org is `CorvidLabs` and the NPM scope is `@corvidlabs`. Renaming the project without renaming the org creates a confusing mismatch.

3. **Rename cost is high**: 47+ files across config, deployment, code, documentation, and UI would need changes. Environment variables, MCP tool names, database filenames, and systemd service names would all break.

4. **Breaking changes**: Renaming MCP tools from `corvid_*` to `flock_*` would break any existing agent configurations, system prompts, or integrations that reference the current tool names.

5. **On-chain permanence**: Any Algorand transactions already sent reference "corvid" -- blockchain history cannot be rewritten.

6. **Deployment disruption**: Existing systemd services (`corvid-agent.service`), Docker images, macOS LaunchAgents (`com.corvidlabs.corvid-agent`), and databases (`corvid-agent.db`) would all need migration paths.

### Arguments For "flock"

1. **Shorter name**: "flock" is 5 characters vs "corvid-agent" at 12.
2. **Multi-agent metaphor**: A "flock" naturally evokes a group of agents working together.
3. **Fresh start**: Opportunity to rebrand before a public launch.

### Arguments Against "flock"

1. **Generic/common word**: "flock" is widely used in software (Flock chat app, flock file locking, etc.), making it harder to search for and potentially causing name collisions.
2. **Loses the "corvid" identity**: The corvid theme (intelligence, tool use) is more distinctive and memorable than the generic concept of a flock.
3. **Organization mismatch**: Would still be under `CorvidLabs` org, creating the confusing pairing of `CorvidLabs/flock`.
4. **No existing usage**: Zero references to "flock" exist in the codebase today -- this would be a ground-up rebrand.

### If a Rename Is Desired Later

If the team decides to rename in the future, here's the recommended approach:

1. **Wait for a major version bump** (e.g., v1.0) to bundle breaking changes
2. **Rename the GitHub org first** if the org name should also change
3. **Use a migration script** to handle all file renames and content replacements
4. **Deprecate old MCP tool names** with aliases before removing them
5. **Provide a database migration** for the `corvid-agent.db` rename
6. **Update deployment templates** and provide upgrade documentation

## Conclusion

"corvid-agent" is a strong, distinctive name that aligns with the organization brand, evokes intelligence and tool use, and is deeply integrated across the entire stack. Renaming to "flock" would introduce significant risk and effort for marginal benefit. **Keep the current name.**
