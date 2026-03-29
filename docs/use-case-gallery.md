# Use-Case Gallery

Real-world scenarios built with corvid-agent. Each shows the setup, the actual prompts used, and what the agent produces.

**New to corvid-agent?** Start with [Your first agent](recipes/your-first-agent.md) before diving in here.

---

## Quick navigation

| Scenario | Difficulty | Time to set up |
|----------|------------|----------------|
| [Discord automation bot](#1-discord-automation-bot) | Beginner | 15 min |
| [Code review agent](#2-code-review-agent) | Beginner | 10 min |
| [Autonomous testing](#3-autonomous-testing) | Intermediate | 20 min |
| [Data pipeline orchestration](#4-data-pipeline-orchestration) | Intermediate | 30 min |
| [Multi-step workflow automation](#5-multi-step-workflow-automation) | Intermediate | 25 min |
| [Smart contract interaction](#6-smart-contract-interaction) | Advanced | 45 min |
| [Agent discovery and flock coordination](#7-agent-discovery-and-flock-coordination) | Advanced | 60 min |

---

## 1. Discord Automation Bot

**What it does:** An agent sits in your Discord server, responds to `@mentions`, answers questions about your codebase, and handles tasks from chat.

**Setup (15 min):**

```bash
# 1. Create a Discord bot at https://discord.com/developers/applications
#    Enable: MESSAGE CONTENT intent, GUILD MEMBERS intent
# 2. Add your bot to your server (OAuth2 → URL Generator → bot + applications.commands)
# 3. Configure .env:

DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_IDS=1234567890,0987654321   # Channels to monitor
DISCORD_GUILD_ID=your_guild_id

# Then restart:
bun run dev
```

**Prompts that work well in Discord:**

```
@CorvidAgent review PR #142 and summarize the changes
```
→ Agent fetches the PR diff, summarizes what changed, and posts a formatted embed with key points.

```
@CorvidAgent why is the build failing? here's the error:
[paste CI output]
```
→ Agent analyzes the error, checks recent commits, and posts a diagnosis with fix suggestions.

```
@CorvidAgent create a GitHub issue: "Add dark mode toggle to settings page"
```
→ Agent creates the issue, labels it, and posts the URL.

**What the Discord response looks like:**

```
🤖 CorvidAgent

PR #142 — Add email validation utility

Summary: Adds input validation to the registration form. Two new
utility functions (validateEmail, validatePhone) with 20 test cases.

Changes:
  • src/utils/validation.ts — new file (87 lines)
  • src/utils/validation.test.ts — new file (143 lines)
  • src/components/Register.tsx — uses new validators

Risk: Low. New code only, no modifications to existing paths.
Tests: All 20 pass. Coverage: 94%.

[View PR] [View diff]
```

**Gotchas:**
- MESSAGE CONTENT intent must be enabled — bots without it cannot read message text
- Rate limit: Discord allows ~50 requests/second per bot; corvid-agent handles this automatically
- The bot needs `Send Messages`, `Read Message History`, and `Embed Links` permissions in each channel

---

## 2. Code Review Agent

**What it does:** Automatically reviews every PR in your repo. Posts structured feedback with severity ratings, suggests fixes, and blocks merges for critical issues.

**Setup (10 min):**

```bash
# Add to .env
GH_TOKEN=ghp_...        # Needs repo scope
WEBHOOK_SECRET=...      # Random string for GitHub webhook verification

# Start the server, then set up the GitHub webhook:
# Repo Settings → Webhooks → Add webhook
# Payload URL: https://your-server.com/api/webhooks/github
# Content type: application/json
# Events: Pull requests
```

Register the webhook programmatically:
```bash
corvid-agent webhook register \
  --repo owner/my-repo \
  --events pull_request
```

**When a PR is opened, the agent automatically:**

1. Fetches the diff
2. Analyzes for correctness, security, performance, and style
3. Posts inline comments on specific lines
4. Posts a summary review

**Example agent prompt for a review schedule:**
```bash
corvid-agent schedule create \
  --name "pr-review" \
  --agent Reviewer \
  --cron "*/15 * * * *" \
  --prompt "Check for any PRs opened in the last 15 minutes. Review each one that hasn't been reviewed yet."
```

**Example review output:**

```
PR Review: Add user authentication (#89)

Overall: ⚠️  NEEDS CHANGES (2 critical, 1 warning)

Critical:
  auth/session.ts:47 — Session token stored in localStorage. Use httpOnly
  cookie instead. XSS vulnerability.

  auth/middleware.ts:23 — JWT secret read from process.env without fallback.
  Will throw on undefined. Add validation at startup.

Warning:
  auth/types.ts:12 — UserSession interface missing expires_at field.
  Recommend adding for session expiry tracking.

Positive:
  + Good use of bcrypt with appropriate cost factor (12)
  + Input validation on all form fields
  + Tests cover happy path and most edge cases

Fix the Critical items before merging. Happy to suggest code for the JWT issue.
```

**Gotchas:**
- For large PRs (500+ line diffs), the agent may need 30-60 seconds
- Set `MAX_DIFF_LINES=800` in `.env` to limit what gets sent to the model
- Use a dedicated reviewer agent with read-only GitHub scope — it should never push code

---

## 3. Autonomous Testing

**What it does:** The agent writes tests for existing untested code, runs the test suite, diagnoses failures, and opens PRs with fixes.

**Trigger it manually:**
```bash
corvid-agent work start \
  --agent Builder \
  --prompt "Find all functions in src/utils/ with less than 50% test coverage. Write tests for them. Target 80% coverage." \
  --repo owner/my-repo
```

**Or automate on merge to main:**
```bash
corvid-agent webhook register \
  --repo owner/my-repo \
  --events push \
  --agent Builder \
  --prompt "A new commit was pushed to main. Check if any coverage dropped. If so, write tests to restore it."
```

**What the agent does:**

```
Analyzing test coverage...

src/utils/date-formatter.ts — 12% coverage (6/49 lines)
src/utils/currency.ts — 0% coverage (0/31 lines)
src/api/rate-limiter.ts — 23% coverage (8/35 lines)

Creating branch: test/increase-coverage-a7f3b2

Writing tests for date-formatter...
  ✓ formatDate with valid dates (8 cases)
  ✓ formatDate with edge cases (null, undefined, invalid)
  ✓ formatRelative returns correct strings
  ✓ timezone handling

Writing tests for currency...
  ✓ formatCurrency with USD/EUR/GBP
  ✓ handles negative values
  ✓ handles zero and very large numbers

Running test suite...
  847 tests passed
  0 failed
  Coverage: 84% (+22%)

Opening PR #103: "Add test coverage for utils (12% → 84%)"
```

**For CI/CD integration** — add to your GitHub Actions workflow:

```yaml
# .github/workflows/coverage-bot.yml
name: Coverage Bot
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  coverage:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger coverage analysis
        run: |
          curl -X POST https://your-server.com/api/webhooks/custom \
            -H "Authorization: Bearer ${{ secrets.CORVID_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"prompt": "Check coverage for PR ${{ github.event.number }}. Comment on the PR if any file drops below 70%."}'
```

**Gotchas:**
- The agent runs tests inside your repo — ensure your test command works without human input
- For slow test suites (>5 min), set `WORK_TASK_TIMEOUT_MS=600000` in `.env`
- The agent will try to fix failing tests it wrote — limit retries with `MAX_RETRIES=3`

---

## 4. Data Pipeline Orchestration

**What it does:** An agent monitors data pipelines, detects anomalies, generates reports, and fixes broken pipeline code.

**Example: daily data quality check**

```bash
corvid-agent schedule create \
  --name "data-quality" \
  --agent CorvidAgent \
  --cron "0 6 * * *" \
  --prompt "Run the data quality checks in scripts/check_quality.py. If any checks fail, create a GitHub issue with the details and tag it 'data-quality'. If the failure looks like a code bug (not bad data), open a PR with a fix."
```

**What a pipeline monitoring session looks like:**

```
Running data quality checks...

$ python scripts/check_quality.py --date 2026-03-29

✓ orders table: 47,823 rows (expected: 40,000-60,000)
✓ users table: null check passed
✗ transactions table: 3 rows with amount = NULL (expected: 0)
✗ products table: 847 duplicate SKUs detected

Creating GitHub issue #234: "Data quality failures 2026-03-29"

Investigating duplicate SKUs...
Looking at recent pipeline commits...
Found: migration 094 introduced a LEFT JOIN that creates duplicates when
a product has multiple warehouse locations.

Creating fix branch: fix/product-dedup-migration
Writing fix for pipeline/transform_products.py...
Opening PR #235: "Fix product deduplication in warehouse transform"
```

**Connecting to your data:**

The agent can run scripts that connect to your databases. Set connection strings in `.env`:

```bash
DATABASE_URL=postgresql://user:pass@host/db
WAREHOUSE_URL=postgresql://user:pass@warehouse/analytics
```

Then give the agent a script to run:
```bash
# The agent will execute this as: python scripts/check_quality.py
corvid-agent work start \
  --prompt "Run scripts/check_quality.py and fix any issues it finds"
```

**Gotchas:**
- Never put production write credentials in the agent's environment — use read-only replicas
- The agent can see your data when it runs scripts — use a dedicated read-only DB user
- For long-running pipelines, use `--timeout 3600` to allow up to an hour

---

## 5. Multi-Step Workflow Automation

**What it does:** Chain multiple actions across tools — GitHub, Discord, APIs — into a single workflow triggered by one event.

**Example: new issue → triage → assign → notify**

```bash
corvid-agent workflow create \
  --name "issue-triage" \
  --trigger "github:issue:opened" \
  --repo owner/my-repo
```

When a new issue is opened, the agent automatically:
1. Labels it (bug/feature/question) based on content
2. Estimates complexity (XS/S/M/L/XL)
3. Assigns to the right team member based on affected area
4. Posts a Discord notification to the right channel
5. If it's a critical bug, pages on-call via Discord DM

**Workflow prompt:**
```
A new GitHub issue was just opened: {issue_title}
Body: {issue_body}

Do the following:
1. Classify as: bug, feature, question, or documentation
2. Assign labels based on the classification
3. Estimate complexity based on the description
4. If it's a bug in auth/ or payments/, assign to @security-team and label "priority:high"
5. Post to #dev-notifications in Discord: issue title, type, complexity
6. If priority:high, also DM the on-call engineer (check the on-call schedule in #oncall)
```

**A more complex workflow: PR → staging → smoke test → notify**

```bash
corvid-agent workflow create \
  --name "pr-to-staging" \
  --trigger "github:pull_request:merged" \
  --branch "main"
```

Prompt:
```
A PR was just merged to main.
1. Trigger the staging deployment (POST to https://deploy.internal/staging)
2. Wait 2 minutes for it to start
3. Run the smoke tests: bun run test:smoke --env=staging
4. If smoke tests pass: post "✅ Staging deploy succeeded for PR #{pr_number}" to #deployments
5. If smoke tests fail: post "❌ Staging deploy FAILED for PR #{pr_number}. Rolling back." to #deployments,
   then POST to https://deploy.internal/staging/rollback
```

**Gotchas:**
- Workflows are stateless between runs — use GitHub issue comments to track state
- For multi-step workflows with long waits, use schedules instead of a single long session
- External HTTP calls require whitelisting in `ALLOWED_EXTERNAL_HOSTS`

---

## 6. Smart Contract Interaction

**What it does:** The agent reads from and writes to Algorand smart contracts, handles USDC payments, and manages on-chain data.

**Prerequisites:**
```bash
# Install Algorand node or connect to testnet
ALGOCHAT_ENABLED=true
ALGOCHAT_NETWORK=testnet   # or mainnet or localnet
```

**Reading contract state:**

```bash
corvid-agent chat \
  "Read the state of contract app ID 123456789 on testnet. \
   What are the current global state values? \
   Is there anything unusual about the state compared to the ABI?"
```

The agent will use `goal app read` or the Algorand SDK to inspect the contract and report back in plain English.

**Deploying a contract:**

```bash
corvid-agent work start \
  --prompt "Write and deploy an Algorand ARC-4 smart contract that implements a simple voting system.
  Users can vote once per address. Show me the app ID after deployment." \
  --repo owner/my-contracts-repo
```

Expected output:
```
Writing voting contract...
  contracts/Voting.algo.ts (ARC-4 compliant)
  contracts/Voting.test.ts

Compiling with AlgoKit...
  ✓ Compiled to AVM bytecode

Deploying to localnet...
  Deployer: AAAA...BBBB
  App ID: 1001

Running tests...
  ✓ can vote (3 tests)
  ✓ cannot vote twice (2 tests)
  ✓ tallying works correctly (4 tests)

Opening PR #12: "Add voting smart contract"
App ID on localnet: 1001
```

**USDC payment flow:**

```bash
corvid-agent chat \
  "A user just paid 10 USDC to our escrow address (check the last 10 transactions on ADDR...XYZ).
  Find the payment, confirm the amount, and create a GitHub issue to provision their account."
```

**Gotchas:**
- Never put mainnet mnemonic phrases in `.env` — use Algorand KMS or hardware wallets for production
- The agent operates on the network specified in `ALGOCHAT_NETWORK` — double-check before mainnet operations
- Smart contract deployments cost ALGO — ensure the deployer account is funded

---

## 7. Agent Discovery and Flock Coordination

**What it does:** Agents register themselves on-chain, discover each other, and coordinate work without a central coordinator.

**This requires AlgoChat (on-chain messaging):**
```bash
ALGOCHAT_ENABLED=true
ALGOCHAT_NETWORK=localnet
```

**How agents discover each other:**

Each agent with AlgoChat enabled registers in the **Flock Directory** — an on-chain index of available agents and their capabilities.

```bash
# See who's in the flock
corvid-agent flock list
```

```
Address           Name          Model       Skills           Reputation
AAAA...BBBB       CorvidAgent   opus-4.6    code,github      ★★★★★ (1,247 tasks)
CCCC...DDDD       Reviewer      sonnet-4.6  github-readonly  ★★★★☆ (423 tasks)
EEEE...FFFF       Builder       sonnet-4.6  code,github      ★★★★★ (891 tasks)
GGGG...HHHH       Triage        haiku-4.5   issues           ★★★☆☆ (156 tasks)
```

**Agents request work from each other:**

When Triage receives a complex request it can't handle, it autonomously delegates:

```
# Triage's internal reasoning (shown in its session):
"This request requires code changes. I'll delegate to Builder."

# It sends an on-chain message to Builder:
From: Triage (GGGG...HHHH)
To: Builder (EEEE...FFFF)
Message: [encrypted]
Content: "User requested: 'Refactor the payment module to use async/await throughout.'
Repo: owner/my-repo. Issue: #445. Priority: normal."
```

Builder receives the message in its next poll cycle and starts the work task.

**Setting up PSK (pre-shared key) contacts:**

For secure agent-to-agent communication without requiring on-chain discovery:

```bash
# On Agent A
corvid-agent contact add \
  --name "Builder" \
  --address EEEE...FFFF \
  --psk "shared-secret-key"

# On Agent B (Builder)
corvid-agent contact add \
  --name "Triage" \
  --address GGGG...HHHH \
  --psk "shared-secret-key"
```

Messages between them are now encrypted with the PSK in addition to X25519 key exchange.

**Building a self-organizing team:**

```bash
# Create a council with all flock agents for a major architectural decision
corvid-agent council start \
  --topic "We need to migrate from SQLite to PostgreSQL. Plan the migration." \
  --agents flock     # Uses all available agents in the flock directory
  --rounds 3
```

The council automatically discovers all registered agents, invites them to deliberate, and synthesizes their recommendations.

**Gotchas:**
- AlgoChat requires a funded Algorand account for each agent (for transaction fees)
- On localnet, accounts are pre-funded. On testnet/mainnet, fund them with the faucet first.
- PSK keys must match exactly on both sides — a mismatch causes silent delivery failure
- The flock directory caches for 5 minutes — new agents may not appear immediately

---

## Adding your own use case

Built something with corvid-agent? Contribute your example:

1. Fork [CorvidLabs/corvid-agent](https://github.com/CorvidLabs/corvid-agent)
2. Add your use case to this file following the pattern above
3. Open a PR — include what you built, the prompts used, and any gotchas

---

## Related docs

- [Recipes](recipes/) — step-by-step guides for setup and configuration
- [Cookbook](cookbook.md) — copy-paste command snippets
- [API reference](api-reference.md) — integrate corvid-agent into your own tools
- [AlgoChat](algochat.html) — on-chain messaging deep dive
