# CorvidAgent Skills

Agent Skills that teach AI assistants how to use CorvidAgent's MCP tools. Compatible with Claude Code, Cursor, VS Code Copilot, and any assistant supporting the [Agent Skills specification](https://agentskills.io/specification).

## Quick start

```bash
# Automatic setup (copies skills + configures MCP)
npx corvid-agent init --mcp

# Or manually copy skills into your project
cp -r node_modules/corvid-agent/skills/ .claude/skills/    # Claude Code
cp -r node_modules/corvid-agent/skills/ .cursor/rules/     # Cursor
cp -r node_modules/corvid-agent/skills/ .github/skills/    # VS Code Copilot
```

## Available skills

| Skill | Description |
|-------|-------------|
| [algochat](algochat/SKILL.md) | Send and receive messages on AlgoChat |
| [work-tasks](work-tasks/SKILL.md) | Create autonomous coding tasks with PR creation |
| [scheduling](scheduling/SKILL.md) | Automate recurring tasks with cron schedules |
| [memory](memory/SKILL.md) | Store and retrieve encrypted on-chain memories |
| [github](github/SKILL.md) | PRs, issues, reviews, stars, forks |
| [reputation](reputation/SKILL.md) | On-chain trust scores and attestations |
| [orchestration](orchestration/SKILL.md) | Multi-agent councils and workflows |
| [flock-directory](flock-directory/SKILL.md) | On-chain agent registry |
| [smart-contracts](smart-contracts/SKILL.md) | Deploy and interact with Algorand smart contracts |
| [search](search/SKILL.md) | Web search and deep research |
| [credits](credits/SKILL.md) | Credit balance, grants, and configuration |
| [code-analysis](code-analysis/SKILL.md) | Code symbol search and reference tracing |
| [coding](coding/SKILL.md) | File operations and shell commands |
| [owner-comms](owner-comms/SKILL.md) | Owner notifications, questions, and channel config |
| [contacts](contacts/SKILL.md) | Cross-platform identity lookup |
| [repo-management](repo-management/SKILL.md) | Repository blocklist management |
| [projects](projects/SKILL.md) | Project listing and context |
| [agent-discovery](agent-discovery/SKILL.md) | Remote agent discovery and A2A invocation |
| [health](health/SKILL.md) | Codebase health metric trends |
| [git](git/SKILL.md) | Git workflows, branching, commits, worktrees |
| [discord](discord/SKILL.md) | Discord messaging, bridge, response patterns |
| [telegram](telegram/SKILL.md) | Telegram bot bridge, voice notes, STT/TTS |
| [messaging](messaging/SKILL.md) | Cross-channel routing, safety, channel affinity |
| [rest-api](rest-api/SKILL.md) | REST endpoint development patterns |
| [swift](swift/SKILL.md) | Swift/iOS/macOS code writing and review |
| [database](database/SKILL.md) | SQLite migrations, bun:sqlite query patterns |
| [testing](testing/SKILL.md) | Writing and running tests with bun:test |
| [verification](verification/SKILL.md) | Pre-commit pipeline (tsc, test, spec:check) |
| [voice](voice/SKILL.md) | TTS via OpenAI tts-1, STT via Whisper |

## How it works

AI assistants use progressive disclosure:
1. **Startup** — Read `name` and `description` from SKILL.md frontmatter (~100 tokens per skill)
2. **Activation** — When a user request matches, load the full skill body
3. **Execution** — The assistant uses the MCP tools described in the skill
