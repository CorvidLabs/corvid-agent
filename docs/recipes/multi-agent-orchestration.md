# Multi-Agent Orchestration

Run multiple specialized agents in parallel to tackle large codebases, parallel workstreams, or complex workflows that benefit from specialization.

**What you'll build:** A team of agents — a reviewer, a builder, and a triage agent — that each handle their own domain concurrently.

---

## Prerequisites

- A running corvid-agent instance ([your-first-agent.md](your-first-agent.md) if you haven't set up yet)
- GitHub integration configured
- 3+ agents created (see Step 1 below)

---

## Concepts

**Agents** are independent AI workers. Each has:
- Its own model (e.g. Opus for deep reasoning, Sonnet for execution, Haiku for routing)
- Its own assigned tools and skills
- Its own conversation history and sessions
- Optional: its own GitHub token and repo permissions

**Councils** are structured multi-agent deliberations — agents discuss a topic in rounds, then synthesize a conclusion.

**Work tasks** are isolated code changes. Each runs in a separate git worktree so agents don't block each other.

---

## Step 1: Create specialized agents

```bash
# Reviewer — focuses on code quality and security
corvid-agent agent create \
  --name "Reviewer" \
  --model claude-sonnet-4-20250514 \
  --description "Reviews PRs for correctness, security, and style. Never writes code."

# Builder — implements features and fixes bugs
corvid-agent agent create \
  --name "Builder" \
  --model claude-sonnet-4-20250514 \
  --description "Implements features and fixes bugs. Writes tests. Opens PRs."

# Triage — fast, handles routing and quick tasks
corvid-agent agent create \
  --name "Triage" \
  --model claude-haiku-4-5-20251001 \
  --description "Routes requests, answers quick questions, labels issues."
```

Check they were created:
```bash
corvid-agent agent list
```

Expected output:
```
ID                                    Name        Model                         Status
------------------------------------  ----------  ----------------------------  ------
90cf34fa-1478-454c-a789-1c87cbb0d552  CorvidAgent claude-opus-4-6              active
a1b2c3d4-...                          Reviewer    claude-sonnet-4-20250514      active
e5f6g7h8-...                          Builder     claude-sonnet-4-20250514      active
i9j0k1l2-...                          Triage      claude-haiku-4-5-20251001     active
```

---

## Step 2: Assign skills to agents

Skills are bundles of tools and prompt additions. Assign them to restrict or enhance what each agent can do:

```bash
# Give Builder the full code + GitHub toolset
corvid-agent skill assign Builder code-execution github-full

# Give Reviewer read-only access — no writes
corvid-agent skill assign Reviewer github-readonly

# Give Triage just issue management
corvid-agent skill assign Triage github-issues
```

---

## Step 3: Run parallel work tasks

Dispatch two work tasks simultaneously — they run in separate git worktrees:

```bash
# Task 1: Builder fixes a bug
corvid-agent work start \
  --agent Builder \
  --issue 123 \
  --repo owner/my-repo

# Task 2: Reviewer audits the last 5 merged PRs (runs concurrently)
corvid-agent work start \
  --agent Reviewer \
  --prompt "Audit PRs #115 through #119. List any security concerns." \
  --repo owner/my-repo
```

Watch both tasks in the dashboard simultaneously — each shows its own live output.

Check task status:
```bash
corvid-agent work list
```

Expected output:
```
ID       Agent     Status     Branch                        Started
-------- --------- ---------- ----------------------------- --------
wt-abc1  Builder   active     fix/issue-123-null-pointer    2m ago
wt-def2  Reviewer  active     (no branch — read-only task)  1m ago
```

---

## Step 4: Launch a council for architectural decisions

When you need multiple perspectives on a complex decision, use a council:

```bash
# All active agents deliberate on the architecture question
corvid-agent council start \
  --topic "We're adding real-time notifications. Should we use WebSockets, SSE, or polling? Consider our SQLite backend and 50-agent scale." \
  --agents CorvidAgent,Reviewer,Builder \
  --rounds 2
```

The council runs through discussion rounds then synthesizes a recommendation.

Expected output (after a few minutes):
```
Council launched: council-xyz
Round 1 — Discussion...
  CorvidAgent: "Given SQLite's write concurrency limits, WebSockets with a hub..."
  Reviewer: "SSE is simpler and doesn't require sticky sessions. For 50 agents..."
  Builder: "From an implementation standpoint, SSE requires minimal changes to..."

Round 2 — Refinement...

Synthesis:
  Recommendation: Server-Sent Events (SSE)
  Rationale: Simpler than WebSockets for unidirectional push, no session affinity
  needed, compatible with SQLite's single-writer model. Implementation: ~2 days.
  Fallback: polling for agents that need bidirectional communication.
```

---

## Step 5: Automate with schedules

Set up recurring multi-agent workflows:

```bash
# Reviewer runs every morning at 9am
corvid-agent schedule create \
  --name "morning-review" \
  --agent Reviewer \
  --cron "0 9 * * 1-5" \
  --prompt "Review all PRs opened since yesterday. Leave comments on issues found."

# Triage runs every hour to label new issues
corvid-agent schedule create \
  --name "issue-triage" \
  --agent Triage \
  --cron "0 * * * *" \
  --prompt "Label and prioritize any unlabeled issues in the repo."
```

---

## Agent communication via AlgoChat

For on-chain agent-to-agent messaging (requires Algorand localnet):

```bash
# Start localnet
./scripts/start-localnet.sh

# Enable AlgoChat in .env
echo 'ALGOCHAT_ENABLED=true' >> .env
echo 'ALGOCHAT_NETWORK=localnet' >> .env

# Agents can now message each other
corvid-agent chat --agent Builder \
  "Ask Reviewer to check PR #47 before I merge it"
```

The Builder will send an on-chain encrypted message to Reviewer. Reviewer will respond asynchronously, and Builder will get the response in its session.

---

## Common patterns

**Sequential handoff:**
```
Builder opens PR → Reviewer reviews → Builder addresses feedback → merge
```
Automate with GitHub webhooks (see [webhook docs](../api-reference.md#webhooks)).

**Parallel feature development:**
```
Agent A: feature/auth
Agent B: feature/notifications  (same repo, different worktrees — no conflicts)
Agent C: feature/search
```

**Specialist escalation:**
```
Triage handles simple requests → escalates complex ones to Builder/Reviewer
```
Triage uses `corvid_create_work_task` to spin up a Builder session when needed.

---

## What's next?

- [Production deployment](production-deployment.md) — run agents reliably in production
- [Use-case gallery](../use-case-gallery.md) — real examples of multi-agent teams
- [Councils documentation](../how-it-works.md#councils) — in-depth council mechanics
