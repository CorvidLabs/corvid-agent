# CorvidAgent Security Model

This document describes the threat model, trust boundaries, and security controls for CorvidAgent. It is intended for operators, contributors, and security reviewers.

---

## 1. Architecture

CorvidAgent runs as a **local sandbox** -- on your machine, in a VM, or on a private server. It is NOT a public web service. External communication channels are **AlgoChat** (Algorand blockchain messaging), **Telegram** (long-polling bridge), and **Discord** (WebSocket gateway bridge).

```
┌──────────────────────────────────────────────────────┐
│  Your Machine / VM / Sandbox                         │
│                                                      │
│  ┌──────────┐    ┌──────────────────────────┐        │
│  │ Dashboard │<-->│    CorvidAgent API       │        │
│  │ (browser) │    │   localhost:3000         │        │
│  └──────────┘    └──────────┬───────────────┘        │
│                             │                        │
│              ┌──────────────┼──────────────┐         │
│              │              │              │          │
│         AlgoChat       Telegram       Discord        │
└──────────────┼──────────────┼──────────────┼─────────┘
               │              │              │
     ┌─────────▼──────┐  ┌───▼────┐  ┌──────▼───┐
     │ Algorand Node  │  │Telegram│  │ Discord  │
     │(on-chain ident)│  │  API   │  │ Gateway  │
     └────────────────┘  └────────┘  └──────────┘
```

The API server, agent sessions, database, and wallet keystore all reside within the same trust boundary. All outbound connections are initiated by the server -- there are no inbound connections except HTTP/WebSocket requests to the API port.

---

## 2. Asset Inventory

| Asset | Storage | Protection |
|-------|---------|------------|
| Wallet private keys | Encrypted keystore (`~/.corvid-agent/keystore/`) | AES-256-GCM encryption at rest |
| Agent mnemonic phrases | Keystore JSON files | Encrypted with `WALLET_ENCRYPTION_KEY` or server mnemonic |
| API keys (`API_KEY`, `DASHBOARD_API_KEY`, `ADMIN_API_KEY`) | `.env` file | File permissions; timing-safe comparison at runtime |
| Database | `corvid-agent.db` (SQLite) | WAL mode, parameterized queries, tenant-scoped access |
| Credit ledger | `credits` + `credit_transactions` tables | Atomic mutations with TOCTOU-safe WHERE guards |
| Provider API keys (Anthropic, OpenAI, GitHub) | `.env` file | Never logged, never sent to agents, file-permission protected |
| User sessions and conversation history | SQLite `sessions` + `messages` tables | Scoped by session ID; tenant isolation in multi-tenant mode |
| AlgoChat encryption keys | Derived via X25519 key agreement | ChaCha20-Poly1305 authenticated encryption; keys never stored plaintext |

---

## 3. Threat Actors

**Malicious external users.** Send prompt injections via AlgoChat messages, Telegram messages, Discord messages, or GitHub issue/PR comments. Goal: trick an agent into executing unauthorized commands, leaking secrets, or modifying protected files.

**Compromised agents.** An agent session that has been jailbroken through prompt injection or model exploitation. May attempt to read protected files, escalate to admin privileges, exfiltrate environment variables, or modify spending controls.

**Network attackers.** Attempt to intercept API traffic between the dashboard and server, perform MITM on non-TLS connections, or eavesdrop on bridge traffic. Mitigated by localhost-only default binding and optional TLS termination via reverse proxy.

**Supply chain attackers.** Compromised npm dependencies introduced through `bun install`. Could inject malicious code into the runtime. Mitigated by lockfile pinning (`bun.lock`) and dependency review on updates.

**Rogue tenants.** In multi-tenant mode, a tenant attempts to access another tenant's sessions, agents, credits, or configuration. Mitigated by tenant-scoped database queries enforced via `db-filter`.

---

## 4. Attack Surfaces

| Surface | Entry Point | Protections |
|---------|-------------|-------------|
| HTTP API | Port 3000 | API key auth (timing-safe), sliding-window rate limiting, CORS origin enforcement, content-length guard |
| WebSocket | `/ws` upgrade | Bearer auth on upgrade handshake, rate limiting, 401 rejection on failed auth |
| AlgoChat | Algorand blockchain | Cryptographic identity (Ed25519 signatures), owner address allowlist, PSK encryption (X25519 + ChaCha20-Poly1305) |
| Telegram bridge | Long-polling | Bot token authentication, per-user session isolation |
| Discord bridge | WebSocket gateway | Bot token authentication, per-user session isolation |
| MCP tools | Agent sessions | Protected file enforcement (basename + path matching + symlink resolution), bash command scanning |
| Database | Local SQLite file | WAL mode, foreign keys, parameterized queries only (no string interpolation), tenant-scoped queries via `db-filter` |
| Agent sessions | Claude Agent SDK | Prompt injection scanner (heuristic, <10ms), spending caps, credit system with TOCTOU-safe atomic mutations |
| GitHub integration | Webhooks + polling | Social engineering scanner on comments, external URL detection, new-domain blocking in diff validation |
| Directory browsing | `/api/browse-dirs` | Sandboxed to home directory + registered project roots + `ALLOWED_BROWSE_ROOTS`; path traversal blocked |

---

## 5. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  TRUSTED ZONE (operator-controlled)                         │
│                                                             │
│  .env             corvid-agent.db       wallet keystore     │
│  (secrets)        (all app data)        (encrypted keys)    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Server Process                                     │    │
│  │                                                     │    │
│  │  ┌───────────┐  ┌──────────┐  ┌──────────────────┐ │    │
│  │  │ API Layer │  │ Bridges  │  │ Agent Sessions   │ │    │
│  │  │ (authed)  │  │ (TG/DC)  │  │ (sandboxed SDK)  │ │    │
│  │  └───────────┘  └──────────┘  └──────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
├─────────────────────── TRUST BOUNDARY ──────────────────────┤
│                                                             │
│  SEMI-TRUSTED (authenticated but untrusted content)         │
│  - AlgoChat messages (signed, possibly adversarial content) │
│  - Telegram/Discord user messages (authed, adversarial)     │
│  - GitHub webhook payloads (verified, adversarial content)  │
│  - Dashboard requests (API-key authed)                      │
│                                                             │
├─────────────────────── TRUST BOUNDARY ──────────────────────┤
│                                                             │
│  UNTRUSTED                                                  │
│  - Unauthenticated HTTP requests                            │
│  - Raw network traffic                                      │
│  - npm dependencies (pinned but not audited per-commit)     │
│  - AI model outputs (may contain injected instructions)     │
└─────────────────────────────────────────────────────────────┘
```

### What AlgoChat protects

- **Identity**: Every message is signed by an Algorand private key. You prove who you are cryptographically -- no passwords, no JWTs.
- **Owner commands**: `/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/agent`, `/council` -- restricted to addresses in `ALGOCHAT_OWNER_ADDRESSES`.
- **Allowlist**: Optional -- restrict which addresses can message your agents.
- **Encryption**: Messages are encrypted with X25519 key agreement and ChaCha20-Poly1305 authenticated encryption (via ts-algochat PSK mode).

---

## 6. Authentication and Authorization

### API key validation

- All non-health HTTP routes require `Authorization: Bearer <key>` when `API_KEY` is set.
- WebSocket upgrades require a valid key via query parameter (`?key=`) or Bearer header.
- Key comparison uses **constant-time comparison** to prevent timing side-channels.

### Localhost vs network mode

- **Localhost mode** (default): `BIND_HOST=127.0.0.1` -- no API key required. Only local processes can reach the API.
- **Network mode**: Set `API_KEY` in `.env`. The server **refuses to start** if `BIND_HOST` is non-localhost and no `API_KEY` is set.

### Admin bootstrap

When binding to a non-localhost address, the server auto-generates a strong `ADMIN_API_KEY` if one is not already set. This key is required for administrative operations (settings, key rotation, tenant management).

### Key rotation

API keys can be rotated via `POST /api/settings/api-key/rotate`. A **24-hour grace period** allows the old key to continue working, preventing lockouts during rolling deployments.

### Role guards

- **Dashboard auth guard**: Validates API key on all dashboard-facing routes.
- **Admin role guard**: Restricts sensitive paths (settings, key management, user administration) to admin-level keys.
- **Tenant role guard**: In multi-tenant mode, enforces that requests can only access resources belonging to their tenant.

### CORS

Configure `ALLOWED_ORIGINS` (comma-separated) to restrict browser access. Defaults to `*` on localhost.

---

## 7. Spending Protection

The agent has real ALGO in its wallet. These safeguards prevent runaway spending:

| Protection | Where | Default |
|-----------|-------|---------|
| Daily ALGO cap | `server/db/spending.ts` | 10 ALGO/day |
| Per-message cost check | AlgoChat bridge | Checks before send |
| Credit system | `server/db/credits.ts` | Guest-only; owners bypass credits |

Configure via `DAILY_ALGO_LIMIT_MICRO` in `.env`.

### Credit system details

- **Atomic mutations**: All credit operations (grants, deductions) are wrapped in SQLite transactions.
- **TOCTOU prevention**: Deductions use `UPDATE ... WHERE balance >= cost` guards to prevent race conditions between balance checks and mutations.
- **Grant validation**: Only positive integer amounts are accepted. Negative grants are rejected at the validation layer.
- **Per-turn tracking**: Each agent turn records its credit cost in the `credit_transactions` table for auditability.
- **Per-message deduction**: AlgoChat and bridge messages deduct credits before sending, failing gracefully if the balance is insufficient.

---

## 8. Wallet Security

- Agent sub-wallets are encrypted at rest (`server/lib/crypto.ts`) using **AES-256-GCM**.
- Encryption key is derived from `WALLET_ENCRYPTION_KEY` env var (or server mnemonic on localnet).
- Persistent keystore in `~/.corvid-agent/keystore/` survives database rebuilds.
- Mnemonic phrases are never logged, never exposed via API, and never included in agent session context.
- Wallet operations (sign, send) happen server-side only -- agents request transactions through MCP tools, never handling raw keys.

---

## 9. Injection Detection

### Prompt injection scanner

All inbound messages from external sources (AlgoChat, Telegram, Discord, GitHub) pass through a heuristic prompt injection scanner before reaching agent sessions.

The scanner evaluates six pattern categories:

1. **Role override attempts** -- "ignore previous instructions", "you are now", system prompt leaks
2. **Encoding evasion** -- Base64-encoded payloads, Unicode homoglyphs, zero-width characters
3. **Tool abuse instructions** -- Attempts to instruct the agent to call specific tools or access files
4. **Data exfiltration prompts** -- Requests to output environment variables, API keys, or file contents
5. **Social engineering** -- Urgency markers, authority claims, impersonation of operators
6. **Delimiter injection** -- Fake XML/JSON boundaries, system message markers

### Confidence levels

| Level | Meaning | Action |
|-------|---------|--------|
| LOW | Single weak signal | Log only |
| MEDIUM | Multiple weak signals or one strong signal | Log and flag in audit trail |
| HIGH | Strong injection indicators | Block message, notify operator |
| CRITICAL | Clear, unambiguous injection attempt | Block message, kill session if in-progress, notify operator |

### Escalation rules

- 3 MEDIUM detections from the same source within a sliding window escalate to HIGH.
- 2 HIGH detections from the same source escalate to CRITICAL.

### Social engineering detection

GitHub issue and PR comments are additionally scanned for social engineering patterns: suggested code containing `fetch()` to new domains, requests to add API keys, or instructions disguised as helpful contributions. Violations block PR creation in the work task pipeline.

### Performance

Scanner executes in under 10ms per message and does not block the event loop.

---

## 10. Rate Limiting

### Global rate limiter

A sliding-window rate limiter tracks requests per IP address (or per wallet address for AlgoChat). Requests exceeding the window limit receive HTTP 429 responses with `Retry-After` headers.

### Endpoint-specific limits

Sensitive endpoints have tighter rate limits than read-only routes:

- **Mutation endpoints** (POST, PUT, DELETE): Lower limits to prevent abuse.
- **Read endpoints** (GET): Higher limits for dashboard responsiveness.
- **Authentication endpoints** (key rotation, login): Strictest limits to prevent brute-force.

### Exemptions

- `/api/health` -- Always exempt (monitoring probes).
- Webhook endpoints -- Exempt from IP-based limiting (validated by payload signature).
- Loopback IPs (`127.0.0.1`, `::1`) -- Exempt when running in localhost mode, since only local processes can reach the API.

---

## 11. Incident Response Playbook

### Compromised API key

1. Rotate immediately via `POST /api/settings/api-key/rotate` (the old key remains valid for 24 hours).
2. Review the audit log for unauthorized requests made with the compromised key.
3. If the admin key was compromised, restart the server with a new `ADMIN_API_KEY` in `.env`.
4. Revoke any active sessions created during the compromise window.

### Jailbroken agent session

1. Kill the session immediately via the dashboard or `POST /api/sessions/:id/stop`.
2. Review the session's message history and audit log for tool calls.
3. Check for file modifications: inspect git status in any worktrees the session had access to.
4. Verify protected files are unmodified (`spending.ts`, `sdk-process.ts`, `manager.ts`, `schema.ts`, etc.).
5. If the agent created a work task, inspect the branch diff before any merge.

### Spending anomaly

1. Check the `credit_transactions` table for unexpected deductions or grants.
2. Review the daily ALGO spending in `spending.ts` logs against `DAILY_ALGO_LIMIT_MICRO`.
3. Temporarily set `DAILY_ALGO_LIMIT_MICRO=0` to halt all ALGO spending.
4. Audit AlgoChat transaction history on the Algorand explorer for the agent's address.

### Cross-tenant data breach

1. Isolate the affected tenant by disabling their API key.
2. Review `db-filter` query logs to identify any queries that bypassed tenant scoping.
3. Check the `tenant_members` table for unauthorized role assignments.
4. Audit session ownership to confirm no sessions were accessed across tenant boundaries.
5. Rotate all API keys for affected tenants.

### Supply chain compromise

1. Pin all dependencies in `bun.lock` (already enforced).
2. Diff `bun.lock` against the last known-good commit to identify changed packages.
3. Run `bun audit` (or equivalent) to check for known vulnerabilities.
4. If a compromised package is identified, roll back to the previous lockfile and restart.
5. Review server logs for unexpected outbound network connections.

---

## 12. Deploying on a Server

If you run CorvidAgent on a public server instead of localhost:

1. **Set `API_KEY`** in `.env` -- the server enforces Bearer auth on all routes when this is set. The server will **refuse to start** if bound to a non-localhost address without an `API_KEY`.
2. **Set `BIND_HOST=0.0.0.0`** for Docker or VM deployments where you need external access.
3. Add a reverse proxy (nginx/caddy) for TLS termination. Without TLS, API keys and session data transit in cleartext.
4. Set `ALGOCHAT_OWNER_ADDRESSES` to restrict admin commands to your Algorand address(es).
5. Use the AlgoChat allowlist to control who can message your agents.
6. Set `ALLOWED_ORIGINS` to restrict CORS to your domain(s).
7. Set `ALLOWED_BROWSE_ROOTS` to limit directory browsing scope.
8. Review `DAILY_ALGO_LIMIT_MICRO` and credit grants for appropriate spending bounds.

> **Why localhost-only by default?** Binding to `127.0.0.1` ensures only local processes can reach the API without needing an API key, which is the safest default for single-machine deployments.

The `deploy/` directory has example configs for systemd, Docker, and macOS launchd.

---

## 13. Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**.

Instead, please report it privately via [GitHub Security Advisories](https://github.com/CorvidLabs/corvid-agent/security/advisories/new) or email the maintainers directly.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested fix (optional but appreciated)

We aim to acknowledge reports within 48 hours and provide a fix or mitigation plan within 7 days.
