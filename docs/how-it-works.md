# How It Works

A plain-language explanation of what happens when you give corvid-agent a task.

---

## The Agent Loop

Every agent interaction follows the same core loop:

```
You send a prompt
    |
    v
+------------------+
|  LLM processes   |  Claude / Ollama generates a response
|  the prompt      |  with optional tool calls
+------------------+
    |
    v
+------------------+
|  Tool execution  |  MCP tools run: read files, write code,
|  (if requested)  |  search GitHub, query memory, etc.
+------------------+
    |
    v
+------------------+
|  Permission      |  Protected files blocked automatically.
|  check           |  Other actions may need your approval.
+------------------+
    |
    v
+------------------+
|  Results back    |  Tool output feeds back to the LLM
|  to LLM         |  for the next reasoning step.
+------------------+
    |
    +---> Loop continues until the task is done
    |
    v
Response streamed to you (dashboard, CLI, Telegram, etc.)
```

This is not a single request-response — the LLM can make multiple tool calls in sequence, reasoning about each result before deciding what to do next.

---

## Sessions

A **session** is a conversation between you and an agent. It runs in a working directory (usually a git repo) and persists messages to the database.

```bash
# Create a session
POST /api/sessions  { agentId, projectId }

# Send a prompt
POST /api/sessions/:id/resume  { prompt: "..." }
```

Sessions can be:
- **Interactive** — you chat back and forth via the dashboard or CLI
- **Automated** — triggered by a schedule, work task, or incoming message
- **Bridged** — connected from Telegram, Discord, Slack, or AlgoChat

The agent runs until it finishes or you stop it. Sessions can be paused and resumed.

---

## Tool System (MCP)

Agents interact with the world through **37 MCP tools**. Each tool is a function the LLM can call:

| Category | Examples |
|----------|----------|
| **File system** | Read, write, edit, search files |
| **Shell** | Run commands (with permission checks) |
| **GitHub** | Create PRs, review code, manage issues |
| **Memory** | Save/recall information across sessions |
| **Messaging** | Send messages to other agents or owners |
| **Code analysis** | AST symbol extraction, reference finding |
| **Web** | Search the web, deep research |
| **Scheduling** | Create and manage recurring tasks |

Tools are gated by **permission modes**:
- `full-auto` — agent can use any tool without asking
- `accept-edits` — file edits auto-approved, destructive commands need approval
- `ask-always` — every tool call requires your approval

**Protected files** (`.env`, `schema.ts`, `CLAUDE.md`, etc.) are always blocked regardless of permission mode.

---

## Work Tasks: The Self-Improvement Pipeline

Work tasks are how agents ship code autonomously. This is the full pipeline:

```
1. Task created
   (via API, schedule, or agent self-request)
       |
       v
2. Git worktree created
   Isolated branch + directory — main repo untouched
       |
       v
3. Dependencies installed
   bun install in the worktree
       |
       v
4. Repo analyzed
   AST parsing extracts symbols and structure
   relevant to the task description
       |
       v
5. Agent session starts
   Runs in the worktree with full tool access
   Agent reads code, makes changes, runs tests
       |
       v
6. Validation
   - bun x tsc --noEmit (type checking)
   - bun test (unit tests)
   - Security scan (diff analysis)
       |
   +---+---+
   |       |
  PASS    FAIL
   |       |
   v       v
7a. PR    7b. Retry (up to 3 attempts)
   created     Agent gets the validation errors
   on GitHub   and tries again
       |           |
       v       +---+
   Done        |
               v
           Final failure
           (task marked failed, worktree cleaned up)
```

Key properties:
- **Isolated** — worktrees don't affect your main branch
- **Validated** — code must pass type checking and tests before a PR is created
- **Retried** — agents get 3 attempts to fix validation failures
- **Audited** — every step is logged and can be reviewed

---

## Approval Flow

When an agent needs permission for a sensitive action:

1. Agent requests a tool call (e.g., `git push`)
2. Server checks permission mode and protected paths
3. If approval needed, a request is sent to your dashboard (or Telegram/Discord)
4. You approve or deny
5. Agent continues or adjusts its approach

Approval requests time out after 55 seconds (web) or 120 seconds (messaging bridges). Denied requests are communicated back to the agent so it can try a different approach.

For fully automated workflows, use `full-auto` permission mode with `approvalPolicy: "auto"` on schedules.

---

## Scheduling

Agents can run on schedules using cron expressions:

```bash
POST /api/schedules {
  agentId: "...",
  cronExpression: "0 9 * * 1-5",   # 9 AM weekdays
  actions: [{ type: "custom", prompt: "..." }]
}
```

The scheduler supports:
- **Cron expressions** — standard 5-field format
- **Interval-based** — run every N minutes/hours
- **Approval policies** — `auto` (just run it) or `owner` (ask first)
- **Concurrency control** — won't start a new run if the previous one is still active

---

## Multi-Agent Councils

Councils are structured multi-agent deliberations:

```
1. Launch     — Define topic, assign chairman + participants
2. Respond    — Each agent independently states its position
3. Discuss    — Agents respond to each other (N configurable rounds)
4. Review     — Chairman reviews all positions
5. Synthesize — Final recommendation produced
```

Governance tiers:
- **Standard** — simple majority
- **Weighted** — votes weighted by agent reputation
- **Unanimous** — all must agree

Decisions can be recorded on-chain (Algorand) for an immutable audit trail.

---

## Context Management

Long conversations are handled automatically:
- After a configurable number of turns, the session resets its context window
- Recent conversation history is injected into the new context
- The agent continues seamlessly — you don't need to do anything

This means agents can work on tasks that take many turns without hitting LLM context limits.

---

## Further Reading

- [Quickstart](quickstart.md) — Get running in 5 minutes
- [Use Cases](use-cases.md) — Practical examples with API calls
- [Deep Dive](deep-dive.md) — Full architecture and feature breakdown
- [Self-Hosting Guide](self-hosting.md) — Production deployment
