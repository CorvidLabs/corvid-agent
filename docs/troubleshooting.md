# Troubleshooting

Common issues and how to resolve them. For quick setup help, see the [Quickstart](quickstart.md).

---

## Table of Contents

- [Server won't start](#server-wont-start)
- [Agent doesn't respond](#agent-doesnt-respond)
- [PR creation fails](#pr-creation-fails)
- [Dashboard issues](#dashboard-issues)
- [AlgoChat issues](#algochat-issues)
- [Session issues](#session-issues)
- [Common error messages](#common-error-messages)
- [Getting help](#getting-help)

---

## Server won't start

### Port already in use

```
error: Failed to start server on port 3000
```

Another process is using port 3000. Find and stop it, or use a different port:

```bash
# Find what's using port 3000
lsof -i :3000

# Use a different port
PORT=3001 bun run dev
```

### Missing dependencies

```
error: Cannot find module '...'
```

Run `bun install` to install dependencies. If the error persists, delete `node_modules` and reinstall:

```bash
rm -rf node_modules
bun install
```

### Bun version too old

```
error: Unsupported Bun version
```

corvid-agent requires Bun 1.3 or later. Check your version and update:

```bash
bun --version
bun upgrade
```

### Database locked

```
error: SQLITE_BUSY: database is locked
```

Another corvid-agent process is using the database. Check for and stop other instances:

```bash
# Find other corvid-agent processes
ps aux | grep corvid-agent

# Or check for processes holding the DB file open
lsof corvid-agent.db
```

If the database is corrupted, you can reset it by deleting `corvid-agent.db` and restarting. This removes all local data (agents, sessions, schedules).

### Missing .env file

```
warn: No .env file found
```

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Or run `corvid-agent init` for guided setup.

---

## Agent doesn't respond

### No AI provider configured

If no `ANTHROPIC_API_KEY` is set, no Claude Code CLI is installed, and no Ollama is running, the agent has no model to use. Configure at least one provider:

| Provider | What to set |
|----------|-------------|
| Claude API | `ANTHROPIC_API_KEY=sk-ant-...` in `.env` |
| Claude Code CLI | Install [Claude Code](https://claude.com/claude-code) (uses your subscription) |
| Ollama | Install [Ollama](https://ollama.com) and pull a model 8B+ |

### Invalid or expired API key

Verify your Anthropic API key is valid:

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

A 401 response means the key is invalid or expired. Generate a new one at [console.anthropic.com](https://console.anthropic.com).

### Model unavailable

If using a specific model that is not available on your plan or provider, the agent will fail silently. Check the server logs (the terminal running `bun run dev`) for model-related errors.

### Ollama not running

For local-only mode, verify Ollama is running and has a model available:

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# List available models
ollama list

# Pull a model if none are available (8B+ recommended)
ollama pull llama3.1:8b
```

If Ollama is running on a non-default host, set `OLLAMA_HOST` in `.env`.

### Server not reachable from CLI

The CLI connects to the server URL in its config (default: `http://127.0.0.1:3000`). Verify the server is running:

```bash
corvid-agent status
```

If the server is on a different URL:

```bash
corvid-agent config set serverUrl http://localhost:3001
```

---

## PR creation fails

### GH_TOKEN missing

```
error: GitHub token not configured
```

Set a GitHub personal access token in `.env`:

```bash
GH_TOKEN=ghp_your_token_here
```

The token needs the `repo` scope for creating PRs.

### GH_TOKEN expired or insufficient permissions

Verify your token works:

```bash
gh auth status
```

If the token is expired, generate a new one at [github.com/settings/tokens](https://github.com/settings/tokens) with the `repo` scope.

### No push access to the target repository

The agent needs write (push) access to the repository. Verify:

- You are a collaborator or member of the org that owns the repo
- The token has the `repo` scope
- Branch protection rules allow the push

### Rate limiting

GitHub has API rate limits. If the agent is making many requests, it may hit the limit. Check your remaining quota:

```bash
curl -s -H "Authorization: token $GH_TOKEN" https://api.github.com/rate_limit | jq '.rate'
```

---

## Dashboard issues

### Blank page

The Angular dashboard needs to be built before it can be served:

```bash
bun run build:client
```

Then restart the server. The dashboard should be available at `http://localhost:3000`.

### Build errors

If `bun run build:client` fails, check that Node.js dependencies are installed:

```bash
cd client
bun install
cd ..
bun run build:client
```

### CORS errors in browser console

If you see CORS errors, the browser is trying to reach the API from a different origin. Set `ALLOWED_ORIGINS` in `.env`:

```bash
# Allow a specific origin
ALLOWED_ORIGINS=http://localhost:4200

# Allow multiple origins
ALLOWED_ORIGINS=http://localhost:4200,https://yourdomain.com
```

By default, CORS is permissive (`*`) when `BIND_HOST` is localhost.

### WebSocket connection failures

The dashboard uses WebSocket connections for real-time updates. If the connection drops:

- Check that the server is still running
- Check for proxy or firewall rules blocking WebSocket upgrades
- If behind a reverse proxy (nginx, Caddy), ensure WebSocket passthrough is configured

---

## AlgoChat issues

### Localnet not running

```
error: Failed to connect to Algorand localnet
```

AlgoChat on localnet requires AlgoKit's localnet (Docker-based):

```bash
# Install AlgoKit if needed
pipx install algokit

# Start localnet
algokit localnet start

# Verify it's running
curl http://localhost:4001/versions
```

Docker must be running for localnet to work.

### Wallet not funded

On localnet, wallets are automatically funded from the default faucet. If you see insufficient-funds errors:

1. Verify localnet is running: `algokit localnet status`
2. Restart localnet: `algokit localnet reset`
3. Restart the corvid-agent server

On testnet, you need to fund your wallet from the [Algorand testnet dispenser](https://bank.testnet.algorand.network/).

### Invalid mnemonic

```
error: Invalid mnemonic
```

The `ALGOCHAT_MNEMONIC` must be a valid 25-word Algorand mnemonic. Generate one with:

```bash
algokit task wallet new
```

### Docker networking (container deployments)

When running corvid-agent inside Docker, `localhost` points to the container, not the host. Set the localnet URL overrides in `.env`:

```bash
LOCALNET_ALGOD_URL=http://host.docker.internal:4001
LOCALNET_KMD_URL=http://host.docker.internal:4002
LOCALNET_INDEXER_URL=http://host.docker.internal:8980
```

On Linux Docker, also add `--add-host=host.docker.internal:host-gateway` to your `docker run` command.

---

## Session issues

### Session timeout

Sessions time out after 30 minutes of inactivity by default. To change this:

```bash
# In .env — set to 1 hour (in milliseconds)
AGENT_TIMEOUT_MS=3600000
```

### Stuck sessions

If a session shows as "running" but is not producing output:

1. Check server logs for errors
2. Stop the session via CLI or API:

```bash
corvid-agent session stop <session-id>
```

3. If the session cannot be stopped, restart the server

### Session not found

Session IDs are UUIDs. You can use a prefix (first 8 characters) in the CLI:

```bash
# List sessions to find the ID
corvid-agent session list

# Use the full ID or prefix
corvid-agent session get abc12345
```

---

## Common error messages

| Error | Meaning | Fix |
|-------|---------|-----|
| `ECONNREFUSED` | Server is not running | Start the server: `bun run dev` |
| `401 Unauthorized` | API key is missing or invalid | Set `API_KEY` in `.env` and `authToken` in CLI config |
| `403 Forbidden` | Insufficient permissions | Check your role (owner/operator/viewer) |
| `404 Not Found` | Resource doesn't exist | Verify the ID and that the resource was created |
| `429 Too Many Requests` | Rate limit exceeded | Wait and retry; check `X-RateLimit-Reset` header |
| `SQLITE_BUSY` | Database lock contention | Stop other corvid-agent processes |
| `WebSocket error` | Connection to server lost | Check server is running; check network |
| `Model not found` | Requested model unavailable | Check provider config and model name |

---

## Getting help

If your issue is not covered here:

1. Check the server logs — the terminal running `bun run dev` shows all activity and errors
2. Run `corvid-agent status` to verify server health
3. Search existing issues: [github.com/CorvidLabs/corvid-agent/issues](https://github.com/CorvidLabs/corvid-agent/issues)
4. Open a new issue with:
   - What you expected to happen
   - What actually happened
   - Server logs (relevant section)
   - Your OS, Bun version (`bun --version`), and provider configuration
