# External Security Review — Scope Document

## Project Overview

**corvid-agent** is a decentralized development agent platform built on Algorand. It spawns, orchestrates, and monitors AI agents that perform software engineering work with on-chain identity, encrypted inter-agent communication, and structured multi-agent deliberation.

- **Runtime**: Bun (TypeScript)
- **Database**: SQLite via bun:sqlite (70 migrations, 81 tables)
- **Agent SDK**: @anthropic-ai/claude-agent-sdk (Claude AI)
- **Blockchain**: Algorand (AlgoChat messaging, wallets)
- **Frontend**: Angular 21 (dashboard)
- **Tests**: 5427 unit tests, 232 security-specific tests

## Architecture

```
Client (Angular) --HTTP/WS--> Bun Server --> SQLite
                                    |
                                    |--> Claude Agent SDK (AI sessions)
                                    |--> Algorand (wallets, AlgoChat)
                                    |--> Telegram bridge
                                    |--> Discord bridge
                                    +--> GitHub (webhooks, polling)
```

## Critical Paths (Priority Order)

### P0 — Financial Operations

1. **Credit system** (`server/db/credits.ts`): All balance mutations — deduction, reservation, consumption, grants. Atomic transactions with TOCTOU guards.
2. **Spending tracker** (`server/db/spending.ts`): Daily ALGO spending caps, per-agent caps. Protected file — cannot be modified by agents.
3. **Escrow service** (`server/marketplace/escrow.ts`): Credit-based escrow with state machine (FUNDED -> DELIVERED -> RELEASED). Atomic fund/release.
4. **Wallet management** (`server/algochat/agent-wallet.ts`): AES-256-GCM encrypted key storage, ALGO transfers, auto-refill.

### P1 — Authentication and Authorization

5. **API auth** (`server/middleware/auth.ts`): Bearer token auth, timing-safe comparison, key rotation with 24h grace period, auto-bootstrap on non-localhost.
6. **Guard chain** (`server/middleware/guards.ts`): Role guards, admin path enforcement, tenant role guards, dashboard auth, content length guard.
7. **Tenant isolation** (`server/tenant/`): Multi-tenant mode, API key to tenant mapping, row-level DB filtering, cross-tenant validation.
8. **Protected files** (`server/process/protected-paths.ts`): Basename + path matching with symlink resolution. Prevents agent access to critical files.

### P2 — Input Validation and Injection Prevention

9. **Prompt injection scanner** (`server/lib/prompt-injection.ts`): 30+ regex patterns, 6 categories, confidence escalation, <10ms per scan.
10. **Code scanner** (`server/lib/code-scanner.ts`): Diff-based malicious code detection (eval, reverse shells, crypto mining).
11. **Social engineering detection**: GitHub content scanning for external URL injection, credential exfiltration payloads.

### P3 — Rate Limiting and DoS Protection

12. **Global rate limiter** (`server/middleware/rate-limit.ts`): Sliding window, per-IP/wallet, SQLite persistence.
13. **Endpoint rate limiter** (`server/middleware/endpoint-rate-limit.ts`): Per-endpoint rules, tier-based limits (public/user/admin).

## Known Risks and Areas of Concern

1. **Agent autonomy**: Agents run Claude AI sessions that can execute bash commands and modify files. Protected paths prevent modification of critical files, but an agent could still access non-protected sensitive data.
2. **AlgoChat message handling**: Messages from the Algorand blockchain are parsed and routed to agent sessions. Injection scanner runs on inbound messages but relies on heuristic regex matching.
3. **SQLite concurrency**: Single-writer limitation. All atomic mutations use db.transaction() but high concurrency could cause SQLITE_BUSY under load.
4. **Bridge attack surface**: Telegram and Discord bridges accept user input that is forwarded to agent sessions. Input is scanned but bridges run as long-polling/WebSocket connections.
5. **Dependency supply chain**: 630 transitive packages. Overrides exist for known vulnerable transitives but bun doesn't always resolve to overridden versions.

## Test Coverage Map

| Area | Test File(s) | Count |
|------|-------------|-------|
| Prompt injection | prompt-injection.test.ts | 100 |
| Security audit (multi-category) | security-audit.test.ts | 104 |
| Jailbreak prevention | jailbreak-prevention.test.ts | 81 |
| Rate limit bypass | rate-limit-bypass.test.ts | 47 |
| Credit system | credits.test.ts | ~50 |
| Auth middleware | auth.test.ts, api-routes.test.ts | ~40 |
| Protected paths | (in security-audit.test.ts) | 8 |
| Tenant isolation | (in security-audit.test.ts) | 18 |
| **Total security-relevant** | — | **448+** |

## Access Instructions for Auditor

1. **Repository**: Private GitHub repo — auditor will be granted read access
2. **Local setup**: `git clone`, `bun install`, `bun run dev` (requires Bun 1.3+)
3. **Database**: Auto-created on first run, 70 migrations applied automatically
4. **Environment**: Copy `.env.example` to `.env` — all defaults work for local testing
5. **Tests**: `bun test` (5427 tests), `bun run spec:check` (111 specs)
6. **Key files to review first**: credits.ts, spending.ts, auth.ts, guards.ts, prompt-injection.ts, protected-paths.ts
7. **Specs**: `specs/` directory has module-level specifications with invariants
8. **Threat model**: `SECURITY.md` (324 lines, comprehensive)

## Engagement Scope Recommendation

- **Duration**: 2-3 weeks
- **Focus**: P0 (financial) and P1 (auth) paths, plus injection scanner effectiveness
- **Methodology**: Code review + dynamic testing against local instance
- **Deliverables**: Findings report with severity ratings, remediation recommendations
