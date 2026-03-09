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

## How it works

AI assistants use progressive disclosure:
1. **Startup** — Read `name` and `description` from SKILL.md frontmatter (~100 tokens per skill)
2. **Activation** — When a user request matches, load the full skill body
3. **Execution** — The assistant uses the MCP tools described in the skill
