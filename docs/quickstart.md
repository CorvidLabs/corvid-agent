# Get Started with corvid-agent

You're about to get your own AI developer. Here's how.

---

## The fastest way (30 seconds)

Copy and paste this into your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/CorvidLabs/corvid-agent/main/scripts/install.sh | bash
```

The installer will:
1. Check your system
2. Auto-detect your AI provider (Claude CLI, Ollama, or API key)
3. Start the server and open the dashboard

**That's it.** No API key needed if you have Claude Code or Ollama installed.

> **Don't have a terminal open?** On Mac, press `Cmd + Space`, type "Terminal", and hit Enter. On Windows, use WSL2 ([install guide](https://learn.microsoft.com/en-us/windows/wsl/install)).

---

## AI provider (you probably already have one)

Your agent needs an AI brain — but you may already have one installed:

| If you have... | You're good to go | Cost |
|----------------|-------------------|------|
| **Claude Code CLI** | Already installed? Nothing else needed. | Uses your existing subscription |
| **Ollama** | Already installed? Nothing else needed. | Free (runs on your computer) |
| **Neither** | The setup will ask you to pick one | Claude API key ~$3/hr, or install Ollama for free |

The installer auto-detects what you have. If it finds Claude CLI or Ollama, it won't ask for an API key.

> **API keys are only needed** if you're running corvid-agent as a remote server that others connect to. For personal, local use, Claude CLI or Ollama is all you need.

---

## Your first project

Once the dashboard opens at `http://localhost:3000`:

1. **Click "Agents"** in the sidebar — you'll see your default agent
2. **Start a session** — click the agent, then "New Session"
3. **Tell it what to build** — type something like:

> "Create a personal portfolio website with my name, a bio section, and links to my social media"

Watch it work in real time — it writes files, runs commands, and shows you everything it's doing.

### More ideas to try

- "Build a todo list app with local storage"
- "Create a countdown timer to New Year's Eve"
- "Make a recipe organizer where I can save and search recipes"
- "Build a habit tracker that shows streaks"
- "Create a budget calculator with charts"

You describe it, the agent builds it.

---

## Connect GitHub (optional)

If you want the agent to open pull requests on your repositories:

1. Create a [GitHub personal access token](https://github.com/settings/tokens/new) with `repo` scope
2. Add it to your `.env` file: `GH_TOKEN=ghp_your_token_here`
3. Restart the server: `Ctrl+C` then `bun run dev`

Now you can say things like:
- "Review the open pull requests on my-org/my-repo"
- "Fix issue #42 on my-org/my-repo and open a PR"
- "Write tests for the untested files in my-org/my-repo"

---

## Talk to your agent from your phone

### Telegram
1. Create a bot with [@BotFather](https://t.me/botfather) on Telegram
2. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_ALLOWED_USER_IDS=your-telegram-id
   ```
3. Restart the server

### Discord
1. Create a bot at [discord.com/developers](https://discord.com/developers/applications)
2. Add to `.env`:
   ```
   DISCORD_BOT_TOKEN=your-bot-token
   DISCORD_CHANNEL_ID=your-channel-id
   ```
3. Restart the server

### Slack
1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add to `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_CHANNEL_ID=your-channel-id
   ```
3. Restart the server

---

## Use it from the command line

```bash
# Interactive chat
corvid-agent

# One-shot command
corvid-agent chat "What open issues need attention on my-org/my-repo?"

# Check server status
corvid-agent status
```

---

## Use it in your AI editor

If you use Claude Code, Cursor, or GitHub Copilot:

```bash
corvid-agent init --mcp
```

This adds corvid-agent's 46 tools to your editor. Your AI assistant can then manage agents, create work tasks, and more — right from your IDE.

---

## Set up automated schedules

Have your agent work on its own:

1. Go to **Schedules** in the dashboard
2. Click **New Schedule**
3. Set a cron expression (e.g., `0 9 * * *` for every day at 9am)
4. Write the prompt: "Review open PRs on my-org/my-repo and leave feedback"
5. Choose an approval policy: **auto** (runs immediately) or **manual** (you approve first)

---

## Troubleshooting

### "Command not found" when running the installer
Make sure you have a terminal open. On Mac: `Cmd + Space` → "Terminal". On Windows, use WSL2.

### Server won't start
- Check `bun --version` — needs 1.3 or higher
- Check port 3000 isn't already in use: `lsof -i :3000`
- Check the terminal output for error messages

### Agent doesn't respond
- Check the terminal running the server for error messages
- Make sure your API key is valid (check `.env`)
- For Ollama: make sure it's running (`ollama list`)

### Dashboard is blank
- Rebuild: `bun run build:client`
- Check your browser's developer console (F12) for errors

### Need more help?
- [Open a discussion](https://github.com/CorvidLabs/corvid-agent/discussions)
- [Report a bug](https://github.com/CorvidLabs/corvid-agent/issues/new)

---

## What's next?

- **[Use cases](use-cases.md)** — detailed examples for PR review, CI fixes, test generation
- **[How it works](how-it-works.md)** — under the hood
- **[Self-hosting guide](self-hosting.md)** — production deployment with Docker, TLS
- **[API reference](api-reference.md)** — for developers building on top of corvid-agent

---

## Quick reference

| Command | What it does |
|---------|-------------|
| `curl ... \| bash` | Install everything from scratch |
| `bun run dev` | Start the server |
| `bun run try` | Try it without any setup (sandbox mode) |
| `corvid-agent` | Interactive terminal chat |
| `corvid-agent init` | Guided setup wizard |
| `corvid-agent init --mcp` | Add tools to your AI editor |
| `corvid-agent demo` | Quick demo |
| `corvid-agent status` | Check if server is running |
