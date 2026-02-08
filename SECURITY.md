# CorvidAgent Security Model

## Architecture

CorvidAgent runs as a **local sandbox** — on your machine, in a VM, or on a private server. It is NOT a public web service. The only external communication channel is **AlgoChat** (Algorand blockchain messaging).

## Trust Boundaries

```
┌──────────────────────────────────────────────┐
│  Your Machine / VM / Sandbox                 │
│                                              │
│  ┌──────────┐    ┌──────────────────────┐    │
│  │ Dashboard │◄──►│    CorvidAgent API   │    │
│  │ (browser) │    │   localhost:3000     │    │
│  └──────────┘    └──────────┬───────────┘    │
│                             │                │
│                             │ AlgoChat       │
└─────────────────────────────┼────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Algorand Network  │
                    │ (on-chain identity)│
                    └────────────────────┘
```

### What's protected by AlgoChat

- **Identity**: Every message is signed by an Algorand private key. You prove who you are cryptographically — no passwords, no JWTs.
- **Owner commands**: `/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/agent`, `/council` — restricted to addresses in `ALGOCHAT_OWNER_ADDRESSES`.
- **Allowlist**: Optional — restrict which addresses can message your agents.
- **Encryption**: Messages are encrypted with X25519 (via ts-algochat PSK mode).

### Dashboard API authentication

- **Localhost mode** (default): `BIND_HOST=127.0.0.1` -- no API key required. Only local processes can reach the API.
- **Network mode**: Set `API_KEY` in `.env`. All HTTP routes require `Authorization: Bearer <key>` and WebSocket upgrades require `?key=<key>` or a Bearer header. The server **refuses to start** if `BIND_HOST` is non-localhost and no `API_KEY` is set.
- **WebSocket auth**: WebSocket upgrades require a valid API key (query param or Bearer header) before the connection is established. Unauthenticated upgrades are rejected with 401.
- **CORS**: Configure `ALLOWED_ORIGINS` (comma-separated) to restrict browser access. Defaults to `*` on localhost.
- **Directory browsing**: The `/api/browse-dirs` endpoint is sandboxed to the user's home directory, registered project working directories, and any paths in `ALLOWED_BROWSE_ROOTS`. Path traversal attempts are blocked.
- **Health endpoint**: `/api/health` is always public for monitoring probes.
- **Timing-safe comparison**: API key validation uses constant-time comparison to prevent timing attacks.
- **Agent sessions**: Run locally with your own AI provider credentials.

## Spending Protection

The agent has real ALGO in its wallet. These safeguards prevent runaway spending:

| Protection | Where | Default |
|-----------|-------|---------|
| Daily ALGO cap | `server/db/spending.ts` | 10 ALGO/day |
| Per-message cost check | AlgoChat bridge | Checks before send |
| Credit system | `server/db/credits.ts` | Guest-only; owners bypass credits |

Configure via `DAILY_ALGO_LIMIT_MICRO` in `.env`.

## Wallet Security

- Agent sub-wallets are encrypted at rest (`server/lib/crypto.ts`) using AES-256-GCM
- Key derived from `WALLET_ENCRYPTION_KEY` env var (or server mnemonic on localnet)
- Persistent keystore in `~/.corvid-agent/keystore/` survives DB rebuilds

## Deploying on a Server

If you run CorvidAgent on a public server instead of localhost:

1. **Set `API_KEY`** in `.env` -- the server enforces Bearer auth on all routes when this is set. The server will **refuse to start** if bound to a non-localhost address without an `API_KEY`.
2. **Set `BIND_HOST=0.0.0.0`** for Docker or VM deployments where you need external access.
3. Optionally add a reverse proxy (nginx/caddy) for TLS termination.
4. Set `ALGOCHAT_OWNER_ADDRESSES` to restrict admin commands.
5. Use the allowlist to control who can message your agents.
6. Set `ALLOWED_ORIGINS` to restrict CORS to your domain(s).

> **Why localhost-only by default?** Binding to `127.0.0.1` ensures only local processes can reach the API without needing an API key, which is the safest default for single-machine deployments.

The `deploy/` directory has example configs for systemd, Docker, and macOS launchd.

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**.

Instead, please report it privately via [GitHub Security Advisories](https://github.com/CorvidLabs/corvid-agent/security/advisories/new) or email the maintainers directly.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested fix (optional but appreciated)

We aim to acknowledge reports within 48 hours and provide a fix or mitigation plan within 7 days.
