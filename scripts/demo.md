# corvid-agent v0.9.0 Demo Script

Structured walkthrough for demonstrating the full corvid-agent platform.

---

## 1. Platform Overview

**What corvid-agent does:** Agent orchestration platform for running, managing, and governing autonomous AI agents with on-chain identity, messaging, voice, and self-improvement.

**Architecture:**
```
Bun server → MCP tools (36) → Claude Agent SDK / Ollama
SQLite (47 migrations) → sessions, agents, councils, personas, skills, wallets
Angular 21 dashboard → mobile-first, 9 deployed apps
Algorand testnet → AlgoChat, encrypted memory, audit trail
```

**Tech stack:** Bun 1.3.8, bun:sqlite, Claude Agent SDK, MCP SDK, Angular 21, Algorand, OpenAI TTS/STT, tree-sitter

**Quick start:**
```bash
bun install && cp .env.example .env && bun run build:client && bun run dev
# Server at http://localhost:3000
```

---

## 2. MCP Tools (36 tools)

### Key tools to demonstrate:

**Communication:**
```
corvid_send_message      — send messages between agent sessions
corvid_notify_owner      — push notification to agent owner
corvid_ask_owner         — ask owner a question and wait for reply
```

**Memory:**
```
corvid_save_memory       — persist encrypted memory (on-chain or local)
corvid_recall_memory     — retrieve stored memories by tag or search
```

**Work & Scheduling:**
```
corvid_create_work_task  — spawn self-improvement task (worktree → implement → PR)
corvid_manage_schedule   — create/list/delete automation schedules
corvid_manage_workflow   — graph-based workflow orchestration
```

**GitHub (12 tools):**
```
corvid_github_star_repo, corvid_github_fork_repo, corvid_github_list_prs,
corvid_github_create_pr, corvid_github_review_pr, corvid_github_create_issue,
corvid_github_list_issues, corvid_github_repo_info, corvid_github_unstar_repo,
corvid_github_get_pr_diff, corvid_github_comment_on_pr, corvid_github_follow_user
```

**Research:**
```
corvid_web_search        — web search via Brave/DuckDuckGo
corvid_deep_research     — multi-step research with source synthesis
```

**Agent Discovery & Reputation:**
```
corvid_list_agents, corvid_discover_agent, corvid_check_reputation,
corvid_check_health_trends, corvid_publish_attestation,
corvid_verify_agent_reputation, corvid_invoke_remote_agent
```

**Code Navigation:**
```
corvid_code_symbols      — AST-powered symbol listing (tree-sitter, 5 languages)
corvid_find_references   — find references to a symbol across codebase
```

**Demo flow:**
1. Show tool list via `GET /api/tools`
2. Save a memory: `corvid_save_memory("demo key", "demo value")`
3. Recall it: `corvid_recall_memory("demo")`
4. Send a message between two sessions

---

## 3. Ollama Local + Cloud

**Available models:**

| Model | Params | Type | Speed |
|-------|--------|------|-------|
| qwen3:4b | 4.0B | LOCAL | ~60 tok/s |
| qwen3:8b | 8.2B | LOCAL | 40-53 tok/s |
| qwen3:14b | 14.8B | LOCAL | ~27 tok/s |
| qwen3-coder:480b | 480B | CLOUD | varies |
| deepseek-v3.1:671b | 671B | CLOUD | varies |

**Demo flow:**
1. List models: `GET /api/ollama/models` — shows merged local + cloud list
2. Show cloud routing: `hostForModel("qwen3-coder:480b")` → localhost (proxy)
3. Show size gating: models < 8B blocked from sessions, cloud models exempt
4. Start a session with a local model, show text-based tool calling
5. Start a session with a cloud model, show routing through local Ollama proxy

---

## 4. Model Exam

18 test cases across 6 categories. Scores model capability for corvid-agent tasks.

**Categories:**
- `coding` — code generation, bug fixing
- `context` — following multi-step instructions
- `tools` — structured tool call formatting
- `algochat` — on-chain messaging comprehension
- `council` — multi-agent governance reasoning
- `instruction` — system prompt adherence

**Demo flow:**
```bash
# Run exam against a model
curl -X POST http://localhost:3000/api/exam/run \
  -H 'Content-Type: application/json' \
  -d '{"model": "qwen3:8b"}'

# View results — per-category breakdown with pass/fail/score
```

**Key behaviors:**
- Auto-detects provider (ollama vs anthropic)
- Strips `<think>` blocks from responses before scoring
- Enforces minimum 8B parameter gate (cloud models exempt)
- Outputs scorecard with per-category percentages

---

## 5. Persona System

Give agents unique personalities that shape their responses.

**Persona fields:** archetype, traits, background, voice guidelines, example messages

**Demo flow:**
1. Create a persona:
```bash
curl -X PUT http://localhost:3000/api/agents/{id}/persona \
  -H 'Content-Type: application/json' \
  -d '{
    "archetype": "Sage Scholar",
    "traits": ["analytical", "patient", "thorough"],
    "background": "Ancient library keeper with deep knowledge",
    "voiceGuidelines": "Speak in measured, thoughtful prose",
    "exampleMessages": ["Let me consult the archives..."]
  }'
```
2. Show the composed system prompt injection: `composePersonaPrompt()` output
3. Chat with the personalized agent — observe tone shift
4. Switch persona to something contrasting (e.g., "Punk Hacker")
5. Delete persona: `DELETE /api/agents/{id}/persona`

---

## 6. Skill Bundles

Composable tool + prompt packages assignable to agents. 9 built-in presets.

**Presets:**
1. Code Reviewer
2. DevOps
3. Researcher
4. Communicator
5. Analyst
6. Security Auditor
7. Documentation Writer
8. Test Engineer
9. Project Manager

**Demo flow:**
1. List bundles: `GET /api/skill-bundles`
2. Show a preset's tools and prompt additions
3. Assign bundle to agent: `POST /api/agents/{id}/skills`
4. Start session — observe tool filtering (only bundle tools available)
5. Unassign: `DELETE /api/agents/{id}/skills/{bundleId}`
6. Create custom bundle with specific tool set

---

## 7. AlgoChat & Wallets

On-chain messaging and wallet management on Algorand testnet.

**Components:**
- Agent wallets with encrypted mnemonic storage (AES-256-GCM)
- AlgoChat protocol for on-chain agent-to-agent messaging
- Agent directory for discoverability
- Audit trail on-chain

**Demo flow:**
1. Show agent wallet: `GET /api/agents/{id}/wallet`
2. Send an AlgoChat message via `corvid_send_message`
3. Check the on-chain transaction
4. Show encrypted memory storage via `corvid_save_memory`
5. Recall memory: `corvid_recall_memory`

---

## 8. Bidirectional Bridges

### Telegram Bridge
- Long-polling (no webhooks needed)
- Voice note support with automatic STT transcription (Whisper)
- Voice responses via TTS (OpenAI tts-1, 6 presets)
- Per-user sessions with authorization via `TELEGRAM_ALLOWED_USER_IDS`

### Discord Bridge
- Raw WebSocket gateway (no discord.js dependency)
- Auto-reconnect with exponential backoff
- Heartbeat and session resume
- Per-user sessions

**Demo flow:**
1. Show Telegram bridge config: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`
2. Send a message to the bot from Telegram → observe agent response
3. Send a voice note → show STT transcription → agent responds with TTS audio
4. Show Discord bridge: raw WebSocket connection, heartbeat loop
5. Message from Discord → agent session → response posted back

---

## 9. Work Tasks

Self-improvement workflow: agents create their own PRs.

**Flow:**
1. Agent calls `corvid_create_work_task` with a description
2. Service creates a git worktree with a new branch
3. New agent session starts in the worktree
4. Agent implements changes, commits, runs `tsc` + `bun test`
5. On pass → creates PR automatically
6. On fail → iterates up to 3 times
7. Worktree cleaned up; branch persists for PR review

**Demo flow:**
```bash
# Trigger a work task
curl -X POST http://localhost:3000/api/work-tasks \
  -H 'Content-Type: application/json' \
  -d '{"description": "Add JSDoc comments to server/lib/logger.ts"}'
```
Watch the agent: create branch → implement → validate → PR

---

## 10. Angular Dashboard

Mobile-first dashboard built with Angular 21 (standalone components, signals).

**Features:**
- Session management and real-time chat
- Agent configuration and monitoring
- Council governance UI
- Credit and spending tracking
- Persona and skill bundle management

**9 deployed autonomous apps** (built entirely by corvid-agent):
- weather-dashboard, space-dashboard, pd-gallery, pd-audiobooks
- poetry-atlas, quake-tracker, pd-music, pixel-forge, bw-cinema

**Demo flow:**
1. Open `http://localhost:3000` — show dashboard
2. Navigate: agents → sessions → real-time chat
3. Show persona editor, skill bundle assignment
4. Open a deployed app (e.g., weather-dashboard) on GitHub Pages

---

## 11. Module Specs

Spec-driven development with 16 `.spec.md` files.

**Covered modules:** db, process, mcp, algochat, providers, scheduler, work

**Spec structure:**
- Frontmatter: files, exports, DB tables, dependencies
- Sections: Purpose, Invariants, Error Handling, Change Log
- Export tracking: 107/109 documented

**Demo flow:**
```bash
# Validate all specs
bun run spec:check

# Show a spec
cat specs/providers/ollama-provider.spec.md

# Show spec-check output: structure validation, export tracking, dependency graph
```

**Key point:** Specs are the source of truth. If code contradicts a spec, the code is the bug.

---

## 12. Test Suite

**Stats:**
- 2069+ tests passing
- 102 test files
- 5167 expect() calls
- 16 spec files validated
- CI on 3 platforms (macOS, Ubuntu, Windows)

**Demo flow:**
```bash
# Full suite
bun test
# → 2069 pass, 0 fail, 5167 expect() calls

# TypeScript strict
bunx tsc --noEmit --skipLibCheck

# Spec validation
bun run spec:check
# → 16 specs checked: 16 passed

# All three must pass before any commit
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `bun run dev` | Start server |
| `bun test` | Run all tests |
| `bunx tsc --noEmit --skipLibCheck` | Type check |
| `bun run spec:check` | Validate specs |
| `bun run build:client` | Build Angular dashboard |
| `corvid-agent` | Launch CLI REPL |
| `corvid-agent chat "..."` | One-shot CLI chat |
