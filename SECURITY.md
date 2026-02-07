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

### What's NOT protected (by design)

- **Dashboard API** (`localhost:3000`): Binds to `127.0.0.1` by default, so only local processes can reach it. If deploying on a shared server, add a reverse proxy with auth (see [Deploying on a Server](#deploying-on-a-server)).
- **Agent sessions**: Run locally with your own AI provider credentials.

## Spending Protection

The agent has real ALGO in its wallet. These safeguards prevent runaway spending:

| Protection | Where | Default |
|-----------|-------|---------|
| Daily ALGO cap | `server/db/spending.ts` | 10 ALGO/day |
| Per-message cost check | AlgoChat bridge | Checks before send |
| Credit system | `server/db/credits.ts` | Tracks per-wallet usage |

Configure via `DAILY_ALGO_LIMIT_MICRO` in `.env`.

## Wallet Security

- Agent sub-wallets are encrypted at rest (`server/lib/crypto.ts`) using AES-256-GCM
- Key derived from `WALLET_ENCRYPTION_KEY` env var (or server mnemonic on localnet)
- Persistent keystore in `~/.corvid-agent/keystore/` survives DB rebuilds

## Deploying on a Server

If you run CorvidAgent on a public server instead of localhost:

1. **Set `BIND_HOST`**: The server binds to `127.0.0.1` (localhost only) by default. For Docker or VM deployments where you need external access, set `BIND_HOST=0.0.0.0` in your `.env` — but **always** put a reverse proxy with authentication in front.
2. Put a reverse proxy (nginx/caddy) in front with authentication
3. Set `ALGOCHAT_OWNER_ADDRESSES` to restrict admin commands
4. Use the allowlist to control who can message your agents
5. The API itself has no auth — the proxy handles that

> **Why localhost-only by default?** The dashboard API has no built-in authentication. Binding to `127.0.0.1` ensures only local processes can reach it, which is the primary access-control mechanism for single-machine deployments.

The `deploy/` directory has example configs for systemd, Docker, and macOS launchd.

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**.

Instead, please report it privately via [GitHub Security Advisories](https://github.com/CorvidLabs/corvid-agent/security/advisories/new) or email the maintainers directly.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested fix (optional but appreciated)

We aim to acknowledge reports within 48 hours and provide a fix or mitigation plan within 7 days.
