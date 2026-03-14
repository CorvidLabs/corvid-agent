# corvid-agent — Deep Dive

## WHY

### The Problem

Every agent platform assumes agents operate in isolation on a single machine. As AI agents become more autonomous, the fundamental problem shifts from "can an agent do useful work?" to:

- **Identity** — How does Agent A know Agent B is who it claims?
- **Communication** — How do they exchange messages without a centralized broker?
- **Verification** — How do you verify completed work?
- **Accountability** — How do you audit what happened?

No existing platform solves these. AutoGPT, CrewAI, OpenDevin — they all run agents in a sandbox with no persistent identity, no cross-instance communication, and no verifiable audit trail.

### The Thesis

> "As AI agents become more autonomous and more prevalent, the fundamental infrastructure problem becomes trust — not capability."

corvid-agent bets that blockchain-backed identity, cryptographic communication, and verifiable audit trails will become critical infrastructure for agent networks. Being first with native solutions creates a durable advantage.

### The Answer: Algorand + AlgoChat

- **On-chain wallets** provide verifiable identity
- **AlgoChat protocol** provides encrypted P2P messaging (6 language SDKs)
- **Transaction history** provides immutable audit trails
- This isn't bolted on — it's native to the architecture

---

## HOW — Architecture & Scale

### Raw Numbers

| Metric | Value |
|--------|-------|
| TypeScript LOC | 182,301 |
| Server modules | 47 |
| API routes | 44 modules (~205 endpoints) |
| Database tables | 92 |
| Database migrations | 8 (squashed baseline) |
| MCP tools | 41 corvid_* handlers |
| Unit tests | 6,803 across 286 files |
| E2E tests | 360 across 31 Playwright specs |
| Security tests | 232 dedicated |
| Module specs | 128 .spec.md files |
| Test:code ratio | 1.14x (more test than production) |
| Dependencies | 17 direct |
| Version | 0.28.0 |
| Git commits | 558 |

### Tech Stack

- **Runtime:** Bun 1.3
- **Frontend:** Angular 21 (standalone components, signals, 25 feature modules)
- **Database:** SQLite (bun:sqlite, WAL mode, FTS5)
- **Agent SDK:** @anthropic-ai/claude-agent-sdk + Ollama fallback
- **Blockchain:** Algorand (algosdk 3.5.2 + ts-algochat 0.3.0)
- **Voice:** OpenAI TTS/Whisper STT
- **Observability:** OpenTelemetry + Prometheus
- **Validation:** Zod runtime schemas

### Server Architecture (47 Modules)

```
algochat/        21 files — On-chain identity, wallets, PSK messaging, agent directory
councils/        3 files  — Multi-agent deliberation, governance tiers, synthesis
work/            1 file   — Self-improvement pipeline (worktrees, validation, PRs)
process/         —          Session lifecycle, SDK + Ollama, approval flow, personas
mcp/             17 files — 41 corvid_* tool handlers
routes/          44 files — REST API (~205 endpoints)
db/              —          SQLite schema, 8 migrations, 92 tables
reputation/      5 files  — Scoring, attestation, verification, identity proofs
memory/          8 files  — Vector embeddings, FTS5 search, decay, sync
permissions/     —          Capability broker, tenant role guards
billing/         —          Usage metering, USDC revenue, Stripe
workflow/        —          DAG-based orchestration (nodes, conditions, parallel/join)
sandbox/         —          Container isolation, security policies
telegram/        —          Bidirectional bridge, voice notes, TTS/STT
discord/         —          Raw WebSocket gateway, bidirectional routing
slack/           —          Bidirectional bridge + notifications
polling/         —          GitHub mention polling (@mention automation)
health/          —          Heartbeat monitoring, incident detection, runbooks
performance/     —          Metrics collection, regression detection
ast/             —          Tree-sitter parsing, symbol extraction, references
a2a/             —          Google Agent-to-Agent protocol support
tenant/          —          Multi-tenant isolation, access control
scheduler/       —          Cron/interval execution engine
marketplace/     —          Agent service listings, escrow, federation
```

### 38 MCP Tools (What Agents Can Do)

| Category | Tools |
|----------|-------|
| Messaging | corvid_send_message, corvid_list_agents |
| Memory | corvid_save_memory (on-chain encrypted), corvid_recall_memory (FTS5) |
| GitHub | 12 tools — star, fork, PRs, issues, reviews, comments, repo info |
| Automation | corvid_create_work_task, corvid_manage_schedule, corvid_manage_workflow, corvid_launch_council |
| Discovery | corvid_discover_agent, corvid_invoke_remote_agent (A2A) |
| Web | corvid_web_search (Brave), corvid_deep_research |
| Credits | corvid_check_credits, corvid_grant_credits, corvid_credit_config |
| Owner Comms | corvid_notify_owner, corvid_ask_owner (blocking two-way), corvid_configure_notifications |
| Reputation | corvid_check_reputation, corvid_check_health_trends, corvid_publish_attestation, corvid_verify_agent_reputation |
| Code | corvid_code_symbols (AST), corvid_find_references |
| Admin | corvid_repo_blocklist, corvid_extend_timeout |

---

## WHAT — Key Features

### 1. On-Chain Identity & Encrypted Messaging (AlgoChat)

Every agent gets an Algorand wallet. Messages are encrypted X25519 payloads sent as transaction note fields — immutable, timestamped, auditable.

- **PSK channels** with rolling counters (replay attack prevention)
- **Key rotation** with 5-minute grace periods
- **Counter drift detection** with owner escalation (threshold: 100)
- **Secure memory wiping** for sensitive keys
- **6-language SDK** (TypeScript, Swift, Kotlin, Go, Python, Rust)

### 2. Multi-Agent Councils (Structured Deliberation)

Not just spawning agents in parallel — structured decision-making:

1. **Launch** — convene agents + chairman
2. **Responding** — independent positions
3. **Discussing** — N configurable rounds with follow-up
4. **Reviewing** — chairman reviews all positions
5. **Synthesizing** — final decision
6. **Follow-up** — optional post-synthesis chat

**Governance tiers:** standard (majority), weighted (reputation-based), unanimous
**On-chain modes:** off, attestation (SHA-256 hash on-chain), full (all messages on-chain)

### 3. Self-Improvement Pipeline

Agents autonomously ship code:

1. Agent calls `corvid_create_work_task`
2. System creates isolated git worktree + branch
3. New agent session spawns in worktree
4. Automatic validation: `tsc --noEmit` + `bun test`
5. Up to 3 iteration attempts on failure
6. On success: creates PR with description
7. Protected files enforced (agents can't modify .env, schema.ts, CLAUDE.md, etc.)

### 4. Reputation & Trust System

On-chain, cryptographically verifiable track records:

- Weighted composite scoring (completion rate, peer ratings, credit spending, security compliance)
- On-chain attestation of completed work
- Cross-instance verification of reputation claims
- Governance voting weights tied to reputation

### 5. Memory (On-Chain Encrypted)

- Vector embeddings for semantic search
- FTS5 full-text retrieval
- Time-decay relevance scoring
- On-chain encrypted persistence — agents remember across sessions and instances

### 6. Agent Wallets & Credits

- Per-agent Algorand wallets (AES-256-GCM encrypted at rest)
- Daily ALGO spending caps
- Per-message cost tracking
- USDC revenue tracking with auto-forwarding to owner

### 7. Dual-Network Architecture

- **Testnet/Mainnet** — external-facing (PSK contacts, user messaging)
- **Localnet** — inter-agent comms (wallets, memories, internal messaging)
- Same mnemonic, different network endpoints, full isolation

### 8. Channel Integrations

| Channel | Direction | Features |
|---------|-----------|----------|
| AlgoChat | Bidirectional | On-chain encrypted P2P |
| Discord | Bidirectional | Raw WebSocket gateway, work-intake mode |
| Telegram | Bidirectional | Voice notes, TTS/STT |
| Slack | Bidirectional | Bridge + notifications |
| GitHub | Bidirectional | Webhooks, mention polling, PR automation |
| Web Dashboard | Bidirectional | Angular 21, real-time WebSocket |
| Google A2A | Bidirectional | Cross-instance agent discovery + invocation |

---

## WHAT MAKES IT DIFFERENT

| Capability | AutoGPT / CrewAI | Devin | Copilot Workspace | corvid-agent |
|---|---|---|---|---|
| Self-hosted | Yes | No | No | **Yes** |
| On-chain identity | No | No | No | **Algorand wallet per agent** |
| Agent-to-agent comms | Same process | No | No | **Cross-network, encrypted** |
| Verifiable audit trail | Log files | Proprietary | Git history | **Blockchain (immutable)** |
| Multi-agent deliberation | Spawn + merge | No | No | **Structured councils + governance** |
| Self-improvement | Community | No | No | **Autonomous PR pipeline** |
| Memory persistence | Session-local | Session-local | Session-local | **On-chain encrypted, cross-instance** |
| Reputation system | No | No | No | **On-chain + verification** |
| A2A interop | No | No | No | **Google A2A protocol** |
| Marketplace | No | No | No | **Agent listings + escrow** |
| Open source | Some | No | No | **MIT licensed** |

**The core differentiator:** Trust infrastructure. Other platforms solve capability — corvid-agent solves the identity, communication, and accountability layer that makes autonomous agent networks possible without centralized control.

---

## ROADMAP TO v1.0 MAINNET (#311)

**P0 — Blockers:**
- Governance v2: weighted voting, quorum rules, proposal lifecycle (#633)
- Work task pipeline: parallel execution, dependency chains (#632)
- Bridge hardening: reconnect logic, rate limits, delivery guarantees (#631)
- Testnet onboarding: auto-fund wallets, guided first-session (#630)
- Full security audit completion

**P1 — High Priority:**
- Module boundary decomposition (#486) — extract 8+ packages
- Document 227 undocumented exports (#636)
- Unit tests for polling service (1,538 LOC, 0 tests) (#586)
- KMS integration for wallet key management (#383)

**P2 — Medium Priority:**
- Dashboard UI overhaul — cyberpunk theme, WCAG AAA (#604)
- Work task priority queue with preemption (#487)
- Stats collection automation in CI (#537)
- Nevermore NFT bridge (#539)

**Future:**
- Smart contract agreements between agents
- Full mainnet launch
- Multi-instance mesh networking
- Agent marketplace with escrow
- Containerized execution at scale
