# Use Cases

Practical examples showing how to use corvid-agent for common development workflows. Each example includes API calls you can copy and paste.

> **Prerequisites:** A running corvid-agent server (`bun run dev`) with at least one agent and project configured. See the [quickstart](quickstart.md) if you haven't set that up yet.

---

## 1. Daily PR Reviews

Have an agent review every open pull request each morning before your team starts work.

### Setup

Create a schedule that runs at 8 AM on weekdays:

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "name": "morning-pr-review",
    "cronExpression": "0 8 * * 1-5",
    "actions": [{
      "type": "custom",
      "prompt": "Review all open PRs on my-org/my-repo. For each PR: read the diff, check for bugs and style issues, suggest improvements, and post a review comment. Approve if it looks good, request changes if not."
    }],
    "approvalPolicy": "auto"
  }'
```

### What the agent does

1. Lists open PRs via the `corvid_github_list_prs` tool
2. Reads each diff with `corvid_github_pr_diff`
3. Analyzes code for bugs, performance issues, and style
4. Posts review comments with `corvid_github_create_review`
5. Reports a summary back to the session

### Tips

- Assign the "Code Reviewer" skill bundle for more focused reviews
- Set `approvalPolicy` to `"owner"` if you want to approve each review before it posts
- Use a persona with traits like `["thorough", "constructive", "concise"]` for better review tone

---

## 2. Fix CI Failures Automatically

When CI goes red, trigger an agent to diagnose and fix the issue.

### Setup — on-demand

```bash
# Start a session pointed at the failing branch
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "projectId": "PROJECT_ID"
  }'

# Tell the agent what to fix
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "CI is failing on the feature/auth branch. Check the latest test failures, diagnose the root cause, fix the code, and open a PR with the fix."
  }'
```

### Setup — automated via work tasks

For self-directed fixes, use the work task pipeline:

```bash
curl -X POST http://localhost:3000/api/work-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "projectId": "PROJECT_ID",
    "title": "Fix failing auth middleware tests",
    "prompt": "The tests in server/auth/middleware.test.ts are failing with a type error. Diagnose and fix the issue. Run the tests to verify.",
    "createPr": true
  }'
```

The work task pipeline:
1. Creates an isolated git worktree
2. Spawns a new agent session in it
3. Runs validation (`tsc --noEmit` + `bun test`)
4. Retries up to 3 times on failure
5. Opens a PR on success

---

## 3. Write Tests for Untested Code

Point an agent at files with low coverage and let it generate meaningful test suites.

### One-shot

```bash
curl -X POST http://localhost:3000/api/work-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "projectId": "PROJECT_ID",
    "title": "Add tests for billing service",
    "prompt": "Write comprehensive unit tests for server/billing/service.ts. Follow the testing patterns used in existing test files. Cover happy paths, edge cases, and error handling. Target 80%+ coverage.",
    "createPr": true
  }'
```

### Scheduled coverage improvement

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "name": "weekly-coverage-boost",
    "cronExpression": "0 10 * * 1",
    "actions": [{
      "type": "custom",
      "prompt": "Find the 3 largest source files with no corresponding test file. Write tests for the most impactful one and open a PR."
    }],
    "approvalPolicy": "owner"
  }'
```

### Tips

- The agent uses `corvid_code_symbols` to understand the code structure before writing tests
- It follows existing test patterns in your repo automatically
- Use `approvalPolicy: "owner"` so you can review tests before they merge

---

## 4. Triage and Label New Issues

Monitor your issue tracker and automatically categorize incoming issues.

### Setup

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "name": "issue-triage",
    "cronExpression": "*/30 * * * *",
    "actions": [{
      "type": "custom",
      "prompt": "Check for new unlabeled issues on my-org/my-repo. For each one: read the issue, add appropriate labels (bug/feature/docs/question), estimate complexity (S/M/L), and leave a comment acknowledging the issue and suggesting next steps."
    }],
    "approvalPolicy": "auto"
  }'
```

### What the agent does

1. Lists recent issues with `corvid_github_list_issues`
2. Reads each issue body and any linked context
3. Adds labels with `corvid_github_add_labels`
4. Posts a triage comment with `corvid_github_create_comment`
5. For bugs it can reproduce, it may start a fix automatically

### Tips

- Combine with the `@mention` polling feature — set `GH_POLL_REPOS=my-org/my-repo` in `.env` and the agent responds when mentioned in issues or PRs
- Give the agent a persona like "Triage Lead" with traits `["organized", "responsive", "helpful"]`

---

## 5. Multi-Agent Architecture Review

Assemble a council of agents with different expertise to review a complex decision.

### Setup

First, create agents with different skill profiles:

```bash
# Security-focused agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "security-reviewer",
    "model": "claude-sonnet-4-20250514",
    "systemPrompt": "You are a security engineer. Focus on authentication, authorization, input validation, and OWASP Top 10 vulnerabilities."
  }'

# Performance-focused agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "perf-reviewer",
    "model": "claude-sonnet-4-20250514",
    "systemPrompt": "You are a performance engineer. Focus on query efficiency, memory usage, caching, and scalability."
  }'
```

Then convene a council:

```bash
curl -X POST http://localhost:3000/api/councils \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Should we migrate from REST to GraphQL for the dashboard API?",
    "chairmanId": "AGENT_ID_1",
    "participantIds": ["AGENT_ID_2", "AGENT_ID_3"],
    "governanceTier": "standard",
    "discussionRounds": 2
  }'
```

### How councils work

1. **Responding** — Each agent independently states its position
2. **Discussing** — Agents respond to each other's points (configurable rounds)
3. **Reviewing** — The chairman reviews all positions
4. **Synthesizing** — Final recommendation with reasoning

### Tips

- Use `governanceTier: "weighted"` to weight votes by agent reputation
- Enable `onChainMode: "attestation"` to record the decision hash on Algorand
- Councils work well for: architecture decisions, migration planning, security reviews, API design

---

## Combining Use Cases

These patterns compose naturally:

- **Triage + Fix:** Triage identifies bugs, then a work task automatically attempts a fix
- **Review + Tests:** PR reviewer flags missing test coverage, then a second agent writes the tests
- **Council + Implementation:** Council decides on an approach, then agents execute the plan
- **Schedule + Bridge:** Scheduled results are forwarded to your Telegram or Discord channel

---

## Further Reading

- [Quickstart](quickstart.md) — Get running in 5 minutes
- [How It Works](how-it-works.md) — The agent execution loop explained
- [Deep Dive](deep-dive.md) — Full architecture and feature breakdown
- [Self-Hosting Guide](self-hosting.md) — Production deployment
