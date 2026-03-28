# Cookbook

Copy-paste recipes for common corvid-agent workflows. Each recipe is self-contained with exact commands.

> **Prerequisites:** A running corvid-agent server. See [quickstart](quickstart.md) if you haven't set up yet.

---

## Setup Recipes

### Set Up GitHub Integration

```bash
# 1. Create a GitHub personal access token at https://github.com/settings/tokens
#    Scopes needed: repo, read:org, read:user

# 2. Add it to your .env
echo 'GH_TOKEN=ghp_your_token_here' >> .env

# 3. Restart the server
bun run dev
```

Verify it works:

```bash
corvid-agent chat "List my open pull requests" --tools github
```

### Set Up Discord Bot

```bash
# 1. Create a bot at https://discord.com/developers/applications
# 2. Enable MESSAGE CONTENT intent under Bot settings
# 3. Add to .env:
cat >> .env << 'EOF'
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CHANNEL_IDS=channel_id_1,channel_id_2
EOF

# 4. Restart the server
bun run dev

# 5. Configure runtime settings (no restart needed for these):
corvid-agent settings discord mode allowlist
corvid-agent settings discord allowed_user_ids '["your_discord_user_id"]'
```

### Set Up for a Team

```bash
# 1. Generate API key for remote access
echo 'API_KEY=your-shared-api-key' >> .env
echo 'BIND_ADDRESS=0.0.0.0' >> .env

# 2. Set up credit limits
corvid-agent settings credits credits_per_algo 2000
corvid-agent settings credits low_credit_threshold 100

# 3. Create agents for different roles
corvid-agent agent create --name "Reviewer" --model claude-sonnet-4-20250514 \
  --description "Reviews PRs and suggests improvements"

corvid-agent agent create --name "Writer" --model claude-sonnet-4-20250514 \
  --description "Writes documentation and content"
```

---

## Daily Workflows

### Code Review a PR

```bash
# Quick review
corvid-agent chat "Review PR #42 — focus on security and performance" --tools github

# Detailed review with line comments
corvid-agent chat "Do a thorough code review of PR #42. Leave inline comments on any issues." --tools github
```

### Fix a Bug from an Issue

```bash
# Let the agent read the issue and fix it
corvid-agent chat "Fix issue #123. Read the issue, find the bug, and create a PR with the fix." \
  --tools github,code
```

### Summarize Recent Activity

```bash
# What happened this week
corvid-agent chat "Summarize all PRs merged this week and any open issues" --tools github

# Specific repo
corvid-agent chat "What changed in the auth module in the last 5 commits?" --tools code
```

### Write Tests for Existing Code

```bash
corvid-agent chat "Write unit tests for server/routes/settings.ts. \
  Match the existing test patterns in the codebase." --tools code
```

---

## Configuration Recipes

### View All Server Settings

```bash
corvid-agent settings
```

### Adjust Credit Pricing

```bash
# See current rates
corvid-agent settings credits

# Update
corvid-agent settings credits credits_per_algo 5000
corvid-agent settings credits free_credits_on_first_message 50
```

### Check API Key Health

```bash
corvid-agent settings api-key
```

### Rotate API Key (via curl)

```bash
# Rotate with 90-day expiry
curl -X POST http://localhost:3000/api/settings/api-key/rotate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ttlDays": 90}'
```

---

## Deployment Recipes

### Docker (Simplest)

```bash
# From the repo root:
docker compose up -d

# Check it's running:
corvid-agent status

# View logs:
docker compose logs -f corvid-agent
```

### Docker with Custom Config

```bash
# Create .env with your settings first, then:
docker compose up -d

# The root docker-compose.yml automatically loads .env
# Edit .env and restart to change settings:
docker compose restart
```

### Production with Reverse Proxy

```bash
# 1. Use the deploy compose file
cd deploy
cp ../.env .env  # or create a production .env

# 2. Add TLS settings
echo 'BIND_ADDRESS=127.0.0.1' >> .env  # Only listen locally
echo 'API_KEY=your-strong-production-key' >> .env

# 3. Start
docker compose up -d

# 4. Point nginx/caddy at http://127.0.0.1:3000
# See docs/self-hosting.md for full reverse proxy configs
```

---

## API Recipes (curl)

### Create an Agent

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "description": "A helpful coding assistant",
    "model": "claude-sonnet-4-20250514"
  }'
```

### Send a Message

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-id",
    "message": "Hello, what can you do?"
  }'
```

### List Active Sessions

```bash
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $API_KEY"
```

### Get Server Health

```bash
curl http://localhost:3000/api/health
```

---

## Troubleshooting Recipes

### Server Won't Start

```bash
# Check if port is in use
lsof -i :3000

# Check .env is valid
bun run dev 2>&1 | head -20

# Try a different port
PORT=3001 bun run dev
```

### Can't Connect from CLI

```bash
# Check server URL
corvid-agent config get serverUrl

# Update if needed
corvid-agent config set serverUrl http://localhost:3000

# Verify auth
corvid-agent config set authToken your-api-key
corvid-agent status
```

### Discord Bot Not Responding

```bash
# Check bot is connected
corvid-agent status

# Check Discord config
corvid-agent settings discord

# Verify channel IDs are correct
corvid-agent settings discord additional_channel_ids '["new_channel_id"]'
```

---

## MCP Integration (Claude Code / Cursor)

### Add corvid-agent Tools to Your Editor

```bash
corvid-agent init --mcp
```

This adds corvid-agent's MCP tools to your AI editor, giving it access to:
- File operations (read, write, edit, run commands)
- GitHub integration (PRs, issues, code search)
- Memory (save/recall context across sessions)
- Web search and deep research

### Use with Claude Code

```bash
# After init --mcp, just use Claude Code normally.
# corvid-agent tools appear alongside built-in tools.

# To verify MCP is configured:
cat ~/.claude/settings.json | grep corvid
```

See [mcp-setup.md](mcp-setup.md) for detailed configuration options.
