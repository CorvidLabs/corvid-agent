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

- **Dashboard API** (`localhost:3000`): Open on localhost. Only you have access to your machine. If deploying on a shared server, add a reverse proxy with auth.
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

1. Put a reverse proxy (nginx/caddy) in front with authentication
2. Set `ALGOCHAT_OWNER_ADDRESSES` to restrict admin commands
3. Use the allowlist to control who can message your agents
4. The API itself has no auth — the proxy handles that

The `deploy/` directory has example configs for systemd, Docker, and macOS launchd.
