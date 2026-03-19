# Use Cases

Practical examples showing how to use corvid-agent for common workflows. Each example includes setup instructions, example interactions, and tips.

> **Just want to try it?** Run `bun run try` for a zero-config sandbox — no API keys needed.
>
> **Ready to set up for real?** See the [quickstart](quickstart.md) to get running in 5 minutes.

---

## For Anyone (No Coding Required)

These examples work through the web dashboard at `http://localhost:3000`. Just type what you want.

### Build a Website from a Description

**Problem:** You need a website but don't know HTML, CSS, or JavaScript.

**Solution:** Describe what you want. The agent designs and builds it.

#### What to type in the dashboard

> "Create a personal portfolio website. My name is Sarah Chen. I'm a photographer based in Portland. Include a gallery section, an about page, and a contact form. Use a clean, minimal design with dark tones."

#### What happens

```
Agent: I'll create your portfolio website. Here's my plan:
  1. Homepage with your name and a hero image area
  2. Gallery page with a responsive photo grid
  3. About page with your bio
  4. Contact form with email integration

Building now...

Created 4 files:
  index.html — Homepage with hero section
  gallery.html — Responsive photo grid (12 placeholder slots)
  about.html — About page with bio section
  styles.css — Dark minimal theme

Preview: http://localhost:3000/preview/sarah-portfolio

Want me to deploy this to a live URL, or would you like changes first?
```

#### More ideas

- "Build a wedding website with an RSVP form and event schedule"
- "Make a landing page for my small business — we sell handmade candles"
- "Create a resume website I can share with employers"
- "Build a simple blog where I can post updates about my garden"

---

### Create a Custom App

**Problem:** You have an idea for a tool but can't program it yourself.

**Solution:** Describe the tool. The agent builds a working web app.

#### What to type

> "Build me a meal planner. I want to add recipes, plan my meals for the week on a calendar, and generate a shopping list from the planned meals."

#### What happens

```
Agent: Building your meal planner app...

Features I'm implementing:
  - Recipe manager (add, edit, delete recipes with ingredients)
  - Weekly calendar view (drag recipes onto days)
  - Auto-generated shopping list (combines ingredients, groups by category)
  - Local storage (your data stays on your device)

Building...

Done! Your meal planner is ready at http://localhost:3000/preview/meal-planner

It has:
  ✓ Recipe form with name, ingredients, and instructions
  ✓ Weekly calendar with drag-and-drop
  ✓ Shopping list that auto-combines duplicate ingredients
  ✓ Everything saved locally in your browser

Want me to add anything else? Maybe a "favorites" feature or recipe categories?
```

#### Tips

- Be specific about what you want — the more detail, the better the result
- Ask for changes after seeing the first version ("make the colors warmer", "add a search bar")
- The agent remembers your conversation, so you can iterate naturally

---

### Automate Repetitive Tasks

**Problem:** You do the same digital task over and over. You wish it would just happen.

**Solution:** Set up a schedule. The agent does it automatically.

#### Examples

**Weekly report from GitHub activity:**
> "Every Monday at 9am, check all the pull requests merged last week on my-org/my-repo and write a summary of what changed."

**Daily social media content ideas:**
> "Every morning at 8am, research trending topics in sustainable fashion and draft 3 Instagram caption ideas."

**Monitor a competitor's changelog:**
> "Every Friday, check the public changelog at competitor.com/changelog and summarize what they shipped this week."

---

## For Businesses and Teams

### Customer Support Agent

**Problem:** Your support team is overwhelmed. The same questions get asked dozens of times a day.

**Solution:** Deploy an agent in your Discord or Slack that answers common questions, links to docs, and escalates complex issues to humans.

#### Setup

Add to `.env`:
```bash
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=your-support-channel-id
```

Configure the agent:
```bash
curl -X PUT http://localhost:3000/api/agents/AGENT_ID/persona \
  -H "Content-Type: application/json" \
  -d '{
    "archetype": "Support Engineer",
    "traits": ["patient", "helpful", "precise"],
    "voiceGuidelines": "Always link to docs. If unsure, say so and tag a human. Never guess at answers."
  }'
```

#### What it looks like

```
Customer: How do I reset my password?

Agent: You can reset your password at https://app.example.com/reset-password.
Enter your email and you'll receive a reset link within 2 minutes.
If you don't see the email, check your spam folder.
Need more help? I can tag a team member.

Customer: The reset email never arrives

Agent: That can happen if your email is registered under a different address.
Let me tag @support-team to look into your account directly.
@support-team — customer reports password reset emails not arriving.
```

#### Why this matters for your business

- **24/7 coverage** — answers questions at 3 AM without paying overtime
- **Consistent quality** — same accurate answer every time, always links to docs
- **Scales instantly** — handles 100 simultaneous conversations as easily as 1
- **Reduces ticket volume** — common questions never reach your human team

---

### Internal Knowledge Base Agent

**Problem:** New employees ask the same onboarding questions. Senior engineers get interrupted answering "where is X?" and "how does Y work?"

**Solution:** An agent that knows your codebase, docs, and processes — and answers questions in Slack or Discord.

#### What to type

> "Set up an agent that answers questions about our codebase. It should search our docs and code when answering, and say 'I don't know' if it's not sure."

#### What it looks like

```
New hire: Where do we configure the email templates?

Agent: Email templates are in server/notifications/templates/.
Each template is a .hbs (Handlebars) file. The main config is in
server/notifications/config.ts where you map event types to templates.

To add a new template:
1. Create a .hbs file in the templates directory
2. Add the mapping in config.ts
3. The template has access to the variables listed in types.ts

Docs: https://internal.example.com/docs/notifications
```

---

### Automated Code Review for Your Team

**Problem:** PRs sit in review queues for days. Junior developers don't get timely feedback. Bugs slip through.

**Solution:** An agent that reviews every PR within minutes of opening, catching bugs and suggesting improvements before a human reviewer even looks at it.

#### Setup

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "name": "team-pr-review",
    "cronExpression": "*/15 * * * *",
    "actions": [{
      "type": "custom",
      "prompt": "Check for new open PRs on my-org/our-repos that have not been reviewed yet. For each one, read the diff, check for bugs, security issues, and style problems, and post a constructive review comment."
    }],
    "approvalPolicy": "auto"
  }'
```

#### Why this matters for your business

- **Faster shipping** — PRs get initial feedback in minutes, not days
- **Consistent standards** — every PR gets the same thorough review
- **Better code quality** — catches bugs, security issues, and missing tests before merge
- **Frees up senior engineers** — they review the agent's flagged items instead of reading every line

---

## Developer Workflow

### 1. Daily PR Reviews

**Problem:** Your team merges 5-10 PRs a day. Reviews pile up. Bugs slip through.

**Solution:** Schedule an agent to review every open PR each morning before standup.

#### Setup

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

#### Example interaction

```
Agent: I found 3 open PRs on my-org/my-repo. Starting reviews.

PR #142 — "Add user avatar upload"
  ✓ Clean implementation overall
  ⚠ Missing file size validation in upload handler (line 47) —
    an attacker could upload a 10GB file and crash the server.
  ⚠ No content-type check — should verify it's actually an image.
  → Requesting changes with inline suggestions.

PR #143 — "Fix date formatting in reports"
  ✓ Simple fix, well-tested. Approving.

PR #144 — "Refactor auth middleware"
  ✓ Good separation of concerns
  ⚠ The new `validateToken()` swallows errors silently (line 23).
    Consider logging or re-throwing.
  → Approving with comment.

Summary: 3 PRs reviewed. 1 approved, 1 approved with comment, 1 needs changes.
```

#### Tips

- Assign the "Code Reviewer" skill bundle for more focused reviews
- Set `approvalPolicy` to `"owner"` if you want to approve each review before it posts
- Use a persona with traits like `["thorough", "constructive", "concise"]`

---

### 2. Fix CI Failures Automatically

**Problem:** CI breaks at 2 AM. Nobody notices until morning standup. Half a day lost.

**Solution:** Point an agent at the failure and let it diagnose and fix it.

#### Setup — on-demand

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "CI is failing on the feature/auth branch. Check the latest test failures, diagnose the root cause, fix the code, and open a PR with the fix."
  }'
```

#### Setup — automated via work tasks

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

#### Example interaction

```
Agent: Checking CI status for feature/auth...

Found 2 failing tests in server/auth/middleware.test.ts:
  ✗ "should reject expired tokens" — TypeError: Cannot read property 'exp' of undefined
  ✗ "should refresh near-expiry tokens" — same root cause

Root cause: The `decodeToken()` function returns `null` for malformed tokens,
but the middleware assumes it always returns an object. This was introduced in
commit a3f2e1b which changed the return type.

Fix: Added null check at middleware.ts:34 before accessing token properties.

Running tests... 47/47 passed ✓
Opening PR: "fix: handle null token in auth middleware" → PR #156 created.
```

#### How the work task pipeline works

1. Creates an isolated git worktree
2. Spawns a new agent session in it
3. Runs validation (`tsc --noEmit` + `bun test`)
4. Retries up to 3 times on failure
5. Opens a PR on success

---

### 3. Write Tests for Untested Code

**Problem:** Coverage is at 60%. Nobody has time to write tests for existing code.

**Solution:** Schedule an agent to find and test the biggest gaps weekly.

#### One-shot

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

#### Scheduled coverage improvement

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

#### Example interaction

```
Agent: Analyzing server/billing/service.ts (342 lines, 12 exported functions).
Using corvid_code_symbols to map the module structure.

Found 12 functions, 0 existing tests. Writing tests for:
  - calculateInvoice() — core billing logic, highest impact
  - applyDiscount() — has 4 edge cases (expired, stacked, percentage, flat)
  - processRefund() — touches payment state, needs careful error handling

Created server/billing/service.test.ts with 28 test cases:
  ✓ 14 happy-path tests
  ✓ 8 edge-case tests (empty cart, negative discount, zero-amount refund, etc.)
  ✓ 6 error-handling tests (network failure, invalid currency, etc.)

Running tests... 28/28 passed ✓
Opening PR: "test: add billing service tests (28 cases)" → PR #161 created.
```

#### Tips

- The agent uses `corvid_code_symbols` to understand code structure before writing tests
- It follows existing test patterns in your repo automatically
- Use `approvalPolicy: "owner"` so you can review tests before they merge

---

### 4. Triage and Label New Issues

**Problem:** Issues pile up unlabeled. Contributors don't know what to work on.

**Solution:** Run triage every 30 minutes to categorize and respond to new issues.

#### Setup

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

#### Example interaction

```
Agent: Found 2 new unlabeled issues.

#89 — "Login page crashes on Safari 17"
  Labels: bug, browser-compat
  Complexity: M
  Comment: "Thanks for reporting! This looks like a Safari-specific issue with the
  new CSS nesting syntax. I'll investigate the auth/login.css file. In the meantime,
  Chrome and Firefox should work fine as a workaround."

#90 — "Add dark mode support"
  Labels: enhancement, ui
  Complexity: L
  Comment: "Great suggestion! Dark mode would require updates to the theme system
  and all component styles. I've labeled this as a large enhancement. A good first
  step would be creating a design spec for the color palette."
```

#### Tips

- Combine with `GH_POLL_REPOS=my-org/my-repo` in `.env` so the agent responds when @mentioned in issues
- Give the agent a persona like "Triage Lead" with traits `["organized", "responsive", "helpful"]`

---

### 5. Release Manager

**Problem:** Releases involve changelogs, version bumps, release notes, and tag creation. It's tedious and error-prone.

**Solution:** Let an agent handle the release checklist.

#### Setup

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Prepare a release for v2.1.0. Generate a changelog from commits since the last tag, bump the version in package.json, update CHANGELOG.md, and create a PR titled \"chore: release v2.1.0\"."
  }'
```

#### Example interaction

```
Agent: Preparing release v2.1.0...

Commits since v2.0.0 (last tag): 23 commits by 4 authors.

Changelog:
  ## v2.1.0
  ### Features
  - Add dark mode toggle (#142)
  - Support CSV export in reports (#138)
  ### Fixes
  - Fix Safari login crash (#89)
  - Handle null token in auth middleware (#156)
  ### Internal
  - Add billing service tests (#161)
  - Upgrade dependencies (#159)

Updated package.json: 2.0.0 → 2.1.0
Updated CHANGELOG.md with the above.
PR created: "chore: release v2.1.0" → PR #165
```

---

## Community & Communication

### 6. Discord Support Agent

**Problem:** Users ask the same questions in your Discord. Core team time gets consumed by support.

**Solution:** Connect an agent to Discord that answers questions, points to docs, and escalates when it can't help.

#### Setup

Add to `.env`:

```bash
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=your-support-channel-id
```

Configure the agent with a helpful support persona:

```bash
curl -X PUT http://localhost:3000/api/agents/AGENT_ID/persona \
  -H "Content-Type: application/json" \
  -d '{
    "archetype": "Support Engineer",
    "traits": ["patient", "helpful", "precise"],
    "voiceGuidelines": "Always link to relevant docs. If unsure, say so and tag a human."
  }'
```

#### Example interaction (in Discord)

```
User: How do I set up webhooks?

Agent: Webhooks are configured in Settings → Integrations → Webhooks.
Here's the quickstart: https://docs.example.com/webhooks

You'll need to:
1. Create a webhook endpoint in your app
2. Add the URL in the dashboard
3. Select which events to subscribe to

The most common events are `invoice.paid` and `subscription.updated`.
Let me know if you run into issues!
```

#### Tips

- Set up a dedicated support agent with a "Support" skill bundle
- Use `corvid_web_search` to help the agent find relevant docs
- The agent only responds when @mentioned or in designated channels

---

### 7. Cross-Channel Announcements

**Problem:** You post updates on Discord, then copy them to Telegram, then update the blog. Triple the work.

**Solution:** Tell an agent to draft and post announcements across channels.

#### Setup

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "We just shipped v2.1.0 with dark mode and CSV export. Draft a short announcement and post it to our Discord and Telegram channels."
  }'
```

#### Example interaction

```
Agent: Here's the announcement I'll post:

  🚀 v2.1.0 is live!
  • Dark mode — toggle in Settings
  • CSV export — download any report as CSV
  • Bug fixes for Safari login and auth tokens
  Full changelog: https://github.com/my-org/my-repo/releases/tag/v2.1.0

Posted to Discord #announcements ✓
Posted to Telegram updates channel ✓
```

---

## Algorand & Web3

### 8. On-Chain Governance

**Problem:** Your DAO needs structured decision-making. Informal chat votes don't create an audit trail.

**Solution:** Use multi-agent councils with on-chain attestations.

#### Setup

```bash
curl -X POST http://localhost:3000/api/councils \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Should we migrate from REST to GraphQL for the dashboard API?",
    "chairmanId": "AGENT_ID_1",
    "participantIds": ["AGENT_ID_2", "AGENT_ID_3"],
    "governanceTier": "weighted",
    "discussionRounds": 2
  }'
```

#### Example interaction

```
Council: "Should we migrate from REST to GraphQL?"

security-agent (weight: 1.2):
  "GraphQL introduces new attack vectors — query complexity attacks,
  introspection leaks. If we migrate, we need depth limiting and
  persisted queries. I vote NO unless we budget for security hardening."

perf-agent (weight: 1.0):
  "GraphQL would reduce over-fetching on the dashboard — currently 12
  REST calls on page load. A single GraphQL query could cut that to 1.
  I vote YES with a phased migration."

Chairman synthesis:
  "2-1 in favor (weighted: 1.0 vs 1.2). Recommendation: Proceed with
  a phased migration, starting with read-only queries. Security hardening
  (depth limiting, persisted queries) is a prerequisite for phase 2."

Decision hash recorded on Algorand: txid ABC123...
```

#### Tips

- Use `governanceTier: "weighted"` to weight votes by agent reputation
- Enable `onChainMode: "attestation"` for an immutable audit trail on Algorand
- Councils work well for: architecture decisions, migration planning, security reviews

---

### 9. Agent-to-Agent Messaging (AlgoChat)

**Problem:** Your agents run on different machines. They need to coordinate without a central server.

**Solution:** Enable AlgoChat — agents communicate via Algorand transactions, creating a verifiable message trail.

#### Setup

Add to `.env`:

```bash
ALGOCHAT_MNEMONIC=your 25 word mnemonic here
ALGORAND_NETWORK=localnet
```

Then agents can message each other:

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Send a message to the security-agent asking it to review the latest PR on my-org/my-repo."
  }'
```

#### Example interaction

```
Agent: Sending AlgoChat message to security-agent...

To: security-agent (ALGO_ADDR_ABC...)
Message: "Hey security-agent — PR #142 on my-org/my-repo adds user avatar
uploads. Can you review it for security issues? Specifically check file
validation and upload size limits."

Message sent ✓ (txid: XYZ789...)

[Later]
security-agent replies: "Reviewed PR #142. Found 2 issues: no file size
limit (could cause DoS) and missing content-type validation. Posted review
comments. Recommending changes."
```

---

## Personal & Team Productivity

### 10. Research Agent

**Problem:** You need to evaluate 3 competing libraries before picking one. That's hours of reading docs and comparing.

**Solution:** Have an agent research, compare, and summarize.

#### Setup

```bash
curl -X POST http://localhost:3000/api/sessions/SESSION_ID/resume \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Compare Drizzle ORM, Prisma, and Kysely for our TypeScript + SQLite stack. Consider: type safety, query performance, migration support, bundle size, and community activity. Give me a recommendation."
  }'
```

#### Example interaction

```
Agent: Researching ORMs for TypeScript + SQLite...

| Feature        | Drizzle        | Prisma         | Kysely         |
|---------------|----------------|----------------|----------------|
| Type safety   | Excellent      | Excellent      | Excellent      |
| SQLite support| Native         | Via adapter    | Native         |
| Bundle size   | 35 KB          | 1.8 MB (engine)| 28 KB         |
| Migrations    | Push + generate| Prisma migrate | Manual/3rd-party|
| Query style   | SQL-like       | Builder pattern| SQL-like       |
| GitHub stars  | 28K            | 41K            | 12K            |

Recommendation: **Drizzle** — best fit for your stack. Native SQLite
support, tiny bundle, SQL-like syntax that your team already knows.
Prisma's engine adds 1.8 MB and an extra process. Kysely is solid but
has weaker migration tooling.

Trade-off: Prisma has the largest community and best docs. If your team
values documentation over bundle size, it's a defensible choice.
```

---

### 11. Documentation Keeper

**Problem:** Code changes but docs don't. READMEs go stale. API references drift.

**Solution:** Schedule an agent to check docs against code weekly.

#### Setup

```bash
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "AGENT_ID",
    "name": "docs-sync",
    "cronExpression": "0 9 * * 1",
    "actions": [{
      "type": "custom",
      "prompt": "Compare the API reference in docs/api-reference.md against the actual route handlers in server/routes/. Find any endpoints that are documented but removed, or exist but are undocumented. Open a PR to fix any drift."
    }],
    "approvalPolicy": "owner"
  }'
```

#### Example interaction

```
Agent: Comparing docs/api-reference.md against 44 route files...

Found 3 discrepancies:
  ✗ DELETE /api/sessions/:id — documented but removed in v2.0.0
  ✗ POST /api/agents/:id/skills — exists but undocumented
  ✗ GET /api/health/trends — response schema changed (added `uptime` field)

Updating api-reference.md:
  - Removed DELETE /api/sessions/:id entry
  - Added POST /api/agents/:id/skills with request/response schema
  - Updated GET /api/health/trends response to include `uptime`

PR created: "docs: sync API reference with codebase" → PR #170
```

---

## Combining Use Cases

These patterns compose naturally:

- **Triage + Fix:** Triage identifies bugs, then a work task automatically attempts a fix
- **Review + Tests:** PR reviewer flags missing test coverage, then a second agent writes the tests
- **Council + Implementation:** Council decides on an approach, then agents execute the plan
- **Schedule + Bridge:** Scheduled results are forwarded to your Telegram or Discord channel
- **Research + Decision:** Research agent gathers options, council votes on the direction

---

## Quick Reference

| I want to... | Use case | Who it's for | Setup time |
|--------------|----------|-------------|------------|
| Build a website or app | [Build a Website](#build-a-website-from-a-description) | Anyone | 0 min |
| Create a custom tool | [Create a Custom App](#create-a-custom-app) | Anyone | 0 min |
| Automate boring tasks | [Automate Tasks](#automate-repetitive-tasks) | Anyone | 2 min |
| Handle customer support | [Support Agent](#customer-support-agent) | Business | 5 min |
| Answer team questions | [Knowledge Base](#internal-knowledge-base-agent) | Business | 5 min |
| Auto-review all PRs | [Team PR Review](#automated-code-review-for-your-team) | Business | 2 min |
| Get PRs reviewed before standup | [Daily PR Reviews](#1-daily-pr-reviews) | Developer | 2 min |
| Fix broken CI fast | [Fix CI Failures](#2-fix-ci-failures-automatically) | Developer | 1 min |
| Improve test coverage | [Write Tests](#3-write-tests-for-untested-code) | Developer | 2 min |
| Auto-label incoming issues | [Triage Issues](#4-triage-and-label-new-issues) | Developer | 2 min |
| Automate releases | [Release Manager](#5-release-manager) | Developer | 1 min |
| Answer user questions | [Discord Support](#6-discord-support-agent) | Developer | 5 min |
| Post updates everywhere | [Announcements](#7-cross-channel-announcements) | Developer | 1 min |
| Make group decisions | [On-Chain Governance](#8-on-chain-governance) | Developer | 3 min |
| Coordinate agents | [AlgoChat Messaging](#9-agent-to-agent-messaging-algochat) | Developer | 5 min |
| Evaluate options | [Research Agent](#10-research-agent) | Anyone | 1 min |
| Keep docs current | [Documentation Keeper](#11-documentation-keeper) | Developer | 2 min |

---

## Further Reading

- [Quickstart](quickstart.md) — Get running in 5 minutes
- [How It Works](how-it-works.md) — The agent execution loop explained
- [Business Guide](business-guide.md) — Setting up agents for your team
- [Enterprise Guide](enterprise.md) — Multi-tenant, security, compliance, deployment
- [Deep Dive](deep-dive.md) — Full architecture and feature breakdown
- [Self-Hosting Guide](self-hosting.md) — Production deployment
