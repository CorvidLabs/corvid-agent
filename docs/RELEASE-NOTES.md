# corvid-agent v1.0.0-rc — Release Notes

**Date:** 2026-03-29
**Version:** v1.0.0-rc (based on v0.59.x development series)
**Status:** Release Candidate — Automated gate: ✅ 24/24 checks pass. Manual sign-off pending.

---

## Overview

corvid-agent is a decentralized AI agent platform built on Algorand. Agents have on-chain identity, encrypted inter-agent communication, and structured multi-agent deliberation. This release candidate represents the culmination of the v0.x development series and establishes the feature baseline for the v1.0.0 mainnet launch.

---

## What's New Since v0.8.0

This release candidate covers the journey from v0.8.0 (major multi-channel bridge release) through v0.59.x. Key areas of investment:

### Multi-Agent Orchestration

- **Councils** — structured multi-agent deliberation with stages: `responding → discussing → reviewing → synthesizing`. Configurable governance tiers, real-time WebSocket vote events, and a full council management UI.
- **Buddy mode** — lightweight 2-agent review loop: primary agent produces output, buddy reviews before delivery. Visible review rounds in Discord with zero-config default pairings.
- **Delegation tools** — `corvid_delegate_task` and `corvid_dispatch_model` route subtasks to the right model tier (Opus/Sonnet/Haiku) based on complexity.
- **Multi-tool chain continuation** — limited-tier models can chain multiple tool calls across continuation rounds for complex multi-step workflows.
- **Try-mode auto-detect** — zero-config sandbox auto-detects Claude, OpenAI, Gemini, Ollama, and OpenRouter from environment.

### On-Chain Identity & Memory

- **Flock Directory** — on-chain agent registry (ARC-56 contract client, MCP tool and API). Agents can discover, verify, and communicate with each other across deployments. Now uses A2A HTTP transport.
- **ARC-69 on-chain memory** — long-term memories stored as ARC-69 ASAs on localnet AlgoChat. Three-tier architecture: SQLite (ephemeral) → ARC-69 ASA (long-term, mutable) → plain txn (permanent, immutable).
- **Reputation scoring** — track agent reliability, quality, and trustworthiness over time. Score history, trend charts, and agent comparison in the dashboard.
- **Daily attestation** — on-chain daily activity attestation published via scheduler.

### Bridges & Communication

- **Discord bridge** (production-grade) — raw WebSocket gateway (no discord.js), per-user sessions, slash commands (`/ask`, `/status`, `/help`, `/agent-skill`, `/agent-persona`), public channel mode with role-based access, buddy review visible in threads, tiered `/message` tool access.
- **Telegram bridge** — long-polling, voice notes with automatic STT transcription, work-intake mode for submitting tasks directly from Telegram.
- **AlgoChat** — X25519-encrypted messaging, PSK contacts, on-chain encrypted broadcast.
- **MCP over Streamable HTTP** — expose all MCP tools at `/mcp` for Cursor, Copilot, OpenCode, and other IDE integrations.
- **A2A protocol** — Google Agent-to-Agent interoperability.

### Work Tasks

- **Git worktree isolation** — each work task runs in an isolated worktree branch. Agent writes code, validates (lint + tsc + tests), opens PR automatically.
- **Priority queue** — preemption support for higher-priority tasks.
- **Intern PR guard** — prevent intern-tier models (local Ollama) from creating production PRs.
- **Retry UI** — retry failed work tasks from the dashboard.
- **Work delegation attribution** — agent ID parameter for tracking who delegated what.

### Model & Provider Ecosystem

- **Multi-provider routing** — Anthropic (Claude Opus/Sonnet/Haiku), OpenAI (GPT-4.1/Mini/Nano, o3, o4-mini), Gemini, Ollama (local + cloud proxy), Cursor, OpenRouter.
- **Cost-aware routing** — automatic model selection based on task complexity, latency, and budget. Configurable fallback chains.
- **Ollama production tier** — Ollama promoted to production-quality provider with exit code classification, transient/permanent error detection, idle timeout, loop detection, and text-based tool calling for models without native tool support.
- **Cursor provider** — Cursor IDE agent as a first-class LlmProvider with full parity to Anthropic/Ollama.
- **Cloud intern models** — GPT-OSS, DeepSeek V3.1, Qwen3 Coder as cloud intern model options via Ollama proxy.
- **Model exam system** — 18 test cases across 6 categories for benchmarking new models before adding to production chains.

### Personas & Skills

- **Character/Persona system** — agents have distinct personalities (archetype, traits, background, voice guidelines). Persona injected into system prompt at session start.
- **Skill bundles** — composable tool + prompt packages assignable to agents. 5 built-in presets: Code Reviewer, DevOps, Researcher, Communicator, Analyst.
- **Shared agent library (CRVLIB)** — ARC-69 shared on-chain component library. Agents can publish and consume reusable components.
- **Memory browser** — full CRUD UI with search, filter, pagination, and signal-based service for managing on-chain memories.

### Marketplace

- **Tiered pricing plans** — per-use credit billing, verification badges, quality gates, free trial periods, usage metering and analytics.
- **Reputation-gated access** — trust badges and quality gates based on agent reputation scores.
- **Escrow system** — fund → deliver → release flow with 72h auto-release and dispute resolution.
- **USDC mainnet ASA** — mainnet USDC ASA ID `31566704` configured in `.env.mainnet.example`.

### Dashboard & UI

- **Angular 21** — standalone components, signals, mobile-first layout.
- **Chat-first layout** — streamlined navigation with command palette promotion.
- **3D visualizations** — Three.js agent network constellation, 3D library browser, agent comms timeline — all toggleable via dual-mode views.
- **Analytics** — spending trend bar chart, sessions breakdown donut, agent usage dual-bar, all pure CSS.
- **Dashboard customization** — drag-and-drop widget reorder, per-audience defaults (Creator/Developer/Enterprise), reset-to-defaults.
- **WCAG AA compliance** — full accessibility audit across all 13+ feature pages.

### Developer Experience

- **CLI doctor** — `corvid-agent doctor` health check with first-run welcome banner.
- **One-line install** — `curl | sh` quickstart for new users.
- **`bun run setup` wizard** — guided first-run configuration.
- **`corvid-agent init`** — project bootstrap with `--mcp`, `--yes`, and auto-clone flags.
- **`corvid-agent settings`** — view/edit config from CLI.
- **Docker-first** — `docker-compose.yml` at root for zero-config container startup.
- **OpenAPI docs** — auto-generated API reference at `/api/docs`.
- **specsync** — bidirectional spec-to-code validation. 195/195 specs pass.

---

## Security Hardening

This release candidate passes all 24 automated security gating criteria:

| Category | Details |
|----------|---------|
| **Injection detection** | 30+ prompt injection patterns, <10ms scanner, active on all inbound channels (Discord, Telegram, AlgoChat, HTTP) |
| **Jailbreak prevention** | Dedicated test suite, unicode bypass detection, API route scanning, prompt leakage prevention |
| **RBAC** | Permission broker with 50+ actions. Role guards on all 46+ route modules. Auth middleware enforced at startup. |
| **Spending caps** | Per-agent and per-tenant daily ALGO limits. `DAILY_ALGO_LIMIT_MICRO` enforced before any transaction. |
| **Tenant isolation** | 88 isolation tests. Tenant-scoped data access. |
| **Wallet security** | AES-256-GCM encryption, PBKDF2 600,000 iterations, secure memory wipe after signing operations. |
| **Key management** | KMS migration enforcement, encrypted in-memory key cache, key access audit logging, key rotation tested. |
| **CORS** | Fail-safe: server refuses to start when `ALLOWED_ORIGINS=*` in remote mode. |
| **Rate limiting** | Per-route rate limits, client-side dedup, stampede throttling (max 5 sessions spawned per poll cycle). |
| **Container sandbox** | `SANDBOX_ENABLED=true` isolates agent-generated code execution (recommended for production). |
| **CodeQL** | TOCTOU race fixed, fd leak fixed, SQL injection in test files replaced with parameterized queries. |
| **CVEs** | path-to-regexp ReDoS (GHSA-), Hono GHSA-v8w9-8mx6-g223, express-rate-limit bypass, YAML GHSA-48c2-rrv3-qjmp — all patched. |

**Test coverage at RC:**
- 9,244 tests pass across 390 files (0 failures)
- 195/195 specs pass
- TypeScript: `tsc --noEmit --skipLibCheck` clean
- Security scan: clean

---

## Breaking Changes

### v0.25.0
- **KMS migration required** — wallets must be migrated to the KMS-managed key store. Server enforces migration at startup. Run `corvid-agent migrate-keys` before upgrading.

### v0.45.0
- **CORS strict mode** — `ALLOWED_ORIGINS=*` now causes startup failure when `BIND_HOST` is not `localhost`. Set explicit origins or leave `BIND_HOST=127.0.0.1` for local-only deployments.

### v0.52.0
- **Database schema version 103** — 28 migration files run automatically. No data loss; all new columns have DEFAULT values. Backup recommended before upgrading.

### v0.53.0
- **`CURSOR_MAX_PARALLEL` renamed** to `CURSOR_MAX_CONCURRENT`. Update your `.env` if you set this value.

### v0.55.0
- **Intern PR guard** — agents using local Ollama models (intern tier) can no longer create production GitHub PRs. Use a cloud model or explicitly promote the agent tier.

### v0.56.0
- **`OLLAMA_DEFAULT_MODEL` and `OLLAMA_DEFAULT_LOCAL_MODEL`** env vars replace hardcoded model name defaults.

---

## Migration Guide (v0.23.x → v1.0.0-rc)

1. **Backup your database:** `cp corvid-agent.db corvid-agent.db.backup`
2. **Backup your wallet keystore:** `cp wallet-keystore.json wallet-keystore.json.backup`
3. **Update `.env`:**
   - Rename `CURSOR_MAX_PARALLEL` → `CURSOR_MAX_CONCURRENT`
   - Add `OLLAMA_DEFAULT_MODEL` if you have a preferred local model
   - Add `OLLAMA_DEFAULT_LOCAL_MODEL` for local-only routing preference
   - Review `ALLOWED_ORIGINS` — must be explicit domain(s) if `BIND_HOST=0.0.0.0`
   - Add `SANDBOX_ENABLED=true` for production deployments
4. **Run KMS migration** (if not already done): `corvid-agent migrate-keys`
5. **Start server** — DB migrations 024–111 run automatically
6. **Verify:** `bun run spec:check && bun test`

For mainnet deployment, copy `.env.mainnet.example` to `.env` and fill in all required values.

---

## Known Issues & Pending Manual Gate Criteria

The following 5 manual checks are required for v1.0.0 (full mainnet launch) but are pending human verification:

- [ ] 3+ external testnet users running stable instances
- [ ] Zero critical issues reported by testnet users
- [ ] Self-hosting docs validated by external users
- [ ] Owner security posture review complete
- [ ] **Owner sign-off on mainnet readiness** ← blocks v1.0.0 tag

Current automated gate: 24/24 ✅

---

## Dependency Highlights

| Dependency | Version | Notes |
|------------|---------|-------|
| Bun | ≥1.2 | Runtime |
| TypeScript | 5.x | Strict mode |
| Angular | 21 | Frontend |
| @anthropic-ai/claude-agent-sdk | latest | Core agent SDK |
| @modelcontextprotocol/sdk | latest | MCP tooling |
| algosdk | latest | Algorand blockchain |
| three | latest | 3D visualizations |

---

## Mainnet Configuration

See `.env.mainnet.example` for the production configuration template. Key settings for mainnet:

```bash
ALGORAND_NETWORK=mainnet
USDC_ASA_ID=31566704          # mainnet USDC
DAILY_ALGO_LIMIT_MICRO=2000000  # 2 ALGO/day conservative start
BIND_HOST=0.0.0.0
API_KEY=<strong random key>
ALLOWED_ORIGINS=https://yourdomain.com
SANDBOX_ENABLED=true
```

---

## Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for the complete commit-by-commit history from v0.7.0 through v0.59.x.

---

*Closes #1691. Part of #310 v1.0.0-rc.*
