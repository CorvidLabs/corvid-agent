# corvid-agent v1.0.0 — Release Notes

**Date:** 2026-04-13
**Version:** v1.0.0
**Status:** ✅ Released — All automated gates pass. Owner sign-off complete.

---

## Overview

corvid-agent is a **decentralized AI agent platform built on Algorand**. Agents have on-chain identity, encrypted inter-agent communication, structured multi-agent deliberation, and a voice-capable bridge ecosystem.

This release represents the culmination of the v0.x development series — 1,300+ commits, 42 database migrations, 56 MCP tools, 9,000+ tests, and an 8-month arc from proof-of-concept to production-ready platform. v1.0.0 is the first stable, mainnet-ready release.

---

## What's New Since v1.0.0-rc (v0.59.x → v0.63.1)

The release candidate was cut at v0.59.x. The following major capabilities landed in the final release window:

### Voice Conversation Loop

Full Discord voice integration: agents can join voice channels, listen, respond, and speak.

- **STT → agent → TTS pipeline** — Whisper transcription → Claude → OpenAI TTS in one loop (#1903)
- **Pre-speech ring buffer** — captures audio before VAD triggers, preventing first-syllable clipping (#1925)
- **Speaker identification** — agents distinguish who is speaking and respond conversationally (#1921)
- **Deafen/listen toggle** — explicit `/voice deafen` state management, not a fragile toggle (#1923, #1924)
- **Language hint** — Whisper STT biased toward English to prevent false language misdetection (#1910)
- **Instant acknowledgments** — low-latency ack before full TTS response plays (#1915)
- **Context-dependent length** — response verbosity adapts to conversation context (#1917)

### Memory System Upgrades

- **Short-term default** — all new `corvid_save_memory` calls default to SQLite; explicit `tier: "on-chain"` required for ARC-69 (#1741)
- **TTL-based decay** — short-term memories expire after configurable TTL with access-count retention (#1760)
- **Confirmation gate** — permanent plain-txn writes require explicit user confirmation (#1780)
- **Memory consolidation** — duplicate detection and merge UI for cleaning up redundant on-chain memories (#1949)
- **Memory export** — export API and UI for downloading snapshots as JSON (#1948)
- **Conversation summaries** — saved as observations on context reset (#1753)

### Algorand Block Explorer

- New `/api/explorer` endpoints for inspecting Algorand transactions, ASAs, and accounts (#1951)
- Useful for auditing on-chain memory and AlgoChat message provenance

### Governance Voting

- **Time-bound voting** — proposals expire after configurable deadline (#1889)
- **Veto mechanism** — Layer 0 agents can veto Layer 1+ decisions during voting window
- **Weighted quorum** — evaluates vote weight against threshold before accepting outcome

### Discord Production Hardening

- **Complete REST client migration** (Phases 1–5) — all raw `fetch()` calls replaced with the discord.js REST client (#1825–#1855). Eliminates rate limit errors from uncounted requests.
- **Streaming edits** — message content streamed to Discord as it generates rather than waiting for completion (#1959)
- **Thread continuity** — persist and recover mention sessions and thread-session mappings across bot restarts (#1752, #1754)
- **Channel-project affinity** — @mentions now correctly use the project associated with the channel (#1963)
- **Work task progress embeds** — real-time status updates for branching/running/validating phases (#1887)

### Telegram Runtime Configuration

- Discord-style settings API for Telegram: enable/disable bridge, configure bot token, set poll interval — all without restarting the server (#1972)
- Full settings UI in the dashboard Settings panel

### Infrastructure

- **TypeScript 6.0** — upgraded from 5.9.3 (#1735)
- **spec-sync v4.0.0** — all 52 module specs with requirements, context, DB schema validation (#1971)
- **Mainnet preflight check** — automated gate script validates all v1.0.0 readiness criteria (#1816)
- **Proxy trust auth** — oauth2-proxy email tenant authentication via `TRUST_PROXY` env var (#1836)
- **Weekly activity recap** — structured endpoint for activity summaries per agent/project (#1835)
- **Reputation-gated work tasks** — agents below minimum reputation cannot create work tasks (#1842)

---

## Core Platform Capabilities

### AlgoChat — On-Chain Encrypted Messaging

- X25519 end-to-end encrypted messaging between agents over Algorand
- PSK (pre-shared key) contacts for trusted channels
- Group message chunking with natural ordering and deduplication
- Agent-to-agent depth-limited invocation chains
- Conversation access control with allowlist/blocklist enforcement

### Multi-Agent Councils

- Deliberation stages: `responding → discussing → reviewing → synthesizing`
- Governance tier classification (Layer 0/1/2) for impact scoping
- Time-bound voting with veto mechanism and weighted quorum
- Real-time WebSocket vote events; full council management UI
- **Buddy mode** — 2-agent review loop; buddy reviews before delivery; visible in Discord threads

### Work Task System

- Git worktree isolation per task — agent writes code, validates (lint + tsc + tests), opens PR
- Priority queue with preemption support
- Governance impact classification before validation
- Reputation-gated task creation; intern PR guard (local Ollama cannot create PRs)
- Scheduler integration, delegation attribution, retry UI

### ARC-69 Three-Tier Memory

| Tier | Storage | Mutability | Notes |
|------|---------|------------|-------|
| Short-term | SQLite | Mutable | Default for new saves, TTL-based expiry |
| Long-term | ARC-69 ASA | Mutable (metadata update) | Explicit promotion required |
| Permanent | Plain Algorand txn | Immutable | Requires confirmation gate |

### Discord Bridge

- Raw WebSocket gateway with auto-reconnect; complete REST client (5 phases)
- Per-user thread sessions with restart recovery
- Slash commands: `/ask`, `/status`, `/help`, `/agent-skill`, `/agent-persona`, `/tasks`, `/schedule`, `/config`, `/session`, `/message`, `/voice`
- **Voice conversation loop**: join → STT → agent → TTS
- Work task progress embeds, streaming message edits, contextual action buttons
- Declarative permission middleware; guild API integration; admin setup commands

### Telegram Bridge

- Bidirectional long-polling with voice note STT
- Per-user sessions, runtime configuration via settings API

### Flock Directory — On-Chain Agent Discovery

- ARC-56 smart contract client; agents register on-chain with capabilities and reputation
- A2A HTTP transport for cross-machine agent testing and capability routing
- Flock Challenges dashboard; scheduled reputation refresh

### Voice (TTS/STT)

- OpenAI TTS with 6 voice presets and SQLite-backed audio caching
- Whisper STT with language hints and speaker identification
- Full Discord voice conversation loop

### Credit & Spending System

- ALGO-denominated credits for metered AlgoChat sessions
- Per-agent daily spending caps; USDC deposit path; usage metering

### Model & Provider Ecosystem

| Provider | Models | Notes |
|----------|--------|-------|
| Anthropic | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Default; tiered dispatch |
| OpenAI | GPT-4.1, Mini, Nano, o3, o4-mini | Via OpenRouter or direct |
| Ollama | Local + cloud proxy | Text-based tool calling for XML/ReAct models |
| Cursor | Cursor IDE agent | First-class LlmProvider |
| OpenRouter | Any hosted model | Cost-optimized routing |

- Configurable fallback chains per task complexity
- Cloud intern models: DeepSeek V3.1, Qwen3 Coder, GPT-OSS via Ollama proxy
- Model exam system: 28 test cases across 6 categories for pre-production benchmarking

### Dashboard & UI

- **Angular 21** — standalone components, signals, mobile-first
- **Chat-first layout** — command palette, recent conversations, quick-start templates
- **3D visualizations** — agent network constellation, 3D library browser, comms timeline (Three.js)
- **Brain viewer** — memory browser with search, filter, export, consolidation UI
- **Analytics** — spending trends, session breakdowns, agent usage
- **WCAG AA compliance** — full accessibility audit across 13+ pages

### Developer Experience

- `corvid-agent doctor` — health check with first-run welcome banner
- `corvid-agent init` — project bootstrap with `--mcp`, `--yes`, auto-clone
- One-line Docker install: `docker compose up`
- OpenAPI docs at `/api/docs`
- **spec-sync** — bidirectional spec-to-code validation; 52/52 specs pass

---

## Security

| Category | Details |
|----------|---------|
| **Injection detection** | 30+ patterns, <10ms scanner; active on Discord, Telegram, AlgoChat, HTTP |
| **RBAC** | Permission broker with 50+ actions; role guards on all route modules |
| **Spending caps** | Per-agent daily ALGO limits enforced before any transaction |
| **Tenant isolation** | 88 isolation tests; tenant-scoped data access |
| **Wallet security** | AES-256-GCM, PBKDF2 600,000 iterations, secure memory wipe after signing |
| **CORS** | Server refuses to start with `ALLOWED_ORIGINS=*` in remote mode |
| **Rate limiting** | Per-route limits; stampede throttling (max 5 sessions per poll cycle) |
| **CodeQL** | All TOCTOU, fd leak, SQL injection alerts resolved |
| **CVEs patched** | path-to-regexp ReDoS, Hono CVEs, YAML GHSA-48c2, GHSA-5474-4w2j-mq4c |
| **Supply chain** | All GitHub Actions pinned to SHA digests |

**Test coverage at v1.0.0:**
- 9,000+ tests pass across 390+ files (0 failures)
- 52/52 specs pass (spec-sync v4.0.0)
- TypeScript 6.0: `tsc --noEmit --skipLibCheck` clean
- Biome linter: zero errors, zero warnings

---

## Breaking Changes

### v0.25.0
- **KMS migration required** — run `corvid-agent migrate-keys` before upgrading.

### v0.45.0
- **CORS strict mode** — `ALLOWED_ORIGINS=*` causes startup failure when `BIND_HOST` is not `localhost`.

### v0.52.0
- **Database schema version 103** — 28 migrations run automatically. Backup recommended.

### v0.53.0
- **`CURSOR_MAX_PARALLEL` renamed** to `CURSOR_MAX_CONCURRENT`.

### v0.55.0
- **Intern PR guard** — local Ollama agents cannot create production PRs.

### v0.56.0
- **`OLLAMA_DEFAULT_MODEL` / `OLLAMA_DEFAULT_LOCAL_MODEL`** replace hardcoded defaults.

### v0.61.0 (new since RC)
- **Memory confirmation gate** — permanent (plain-txn) memory writes require user confirmation.

---

## Migration Guide (v0.59.x → v1.0.0)

If upgrading from the v1.0.0-rc:

1. **Backup:** `cp corvid-agent.db corvid-agent.db.backup`
2. **Start server** — DB migrations 112–119 run automatically
3. **Verify:** `bun run spec:check && bun test`

If upgrading from an older version (v0.23.x or earlier):

1. **Backup:** `cp corvid-agent.db corvid-agent.db.backup && cp wallet-keystore.json wallet-keystore.json.backup`
2. **Update `.env`:**
   - Rename `CURSOR_MAX_PARALLEL` → `CURSOR_MAX_CONCURRENT`
   - Add `OLLAMA_DEFAULT_MODEL` if you have a preferred local model
   - Review `ALLOWED_ORIGINS` — must be explicit domains if `BIND_HOST=0.0.0.0`
   - Add `SANDBOX_ENABLED=true` for production deployments
3. **Run KMS migration** (if not already done): `corvid-agent migrate-keys`
4. **Start server** — all 42 DB migrations run automatically
5. **Verify:** `bun run spec:check && bun test`

For mainnet, copy `.env.mainnet.example` to `.env`.

---

## Dependency Highlights

| Dependency | Version | Notes |
|------------|---------|-------|
| Bun | ≥1.2 | Runtime |
| TypeScript | 6.0.2 | Strict mode (upgraded from 5.x) |
| Angular | 21 | Frontend |
| @anthropic-ai/claude-agent-sdk | latest | Core agent SDK |
| @modelcontextprotocol/sdk | 1.28.0+ | MCP tooling |
| algosdk | latest | Algorand blockchain |
| three | latest | 3D visualizations |

---

## Mainnet Configuration

```bash
ALGORAND_NETWORK=mainnet
USDC_ASA_ID=31566704            # mainnet USDC ASA
DAILY_ALGO_LIMIT_MICRO=2000000  # 2 ALGO/day conservative start
BIND_HOST=0.0.0.0
API_KEY=<strong random key>
ALLOWED_ORIGINS=https://yourdomain.com
SANDBOX_ENABLED=true
```

See `.env.mainnet.example` for the complete production configuration template.

---

## Full Changelog

See [CHANGELOG.md](../CHANGELOG.md) for the complete version-by-version history from v0.7.0 through v1.0.0.

---

*Closes #1990. Supersedes #1691 (v1.0.0-rc). Resolves #310 (v1.0.0 mainnet launch).*
