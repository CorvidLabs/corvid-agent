# corvid-agent

## The Decentralized Development Agent Platform

**Corvid Labs — 2026**

---

## What This Is

corvid-agent is a **decentralized development agent platform** built on Algorand. It spawns, orchestrates, and monitors AI agents that do real software engineering work — picking up tasks, writing code, creating branches, validating changes, opening PRs, and deliberating with other agents about decisions.

It is **not** a personal life automation tool. It does not send your emails, control your smart home, or browse the web on your behalf. Those are solved problems with massive incumbents. corvid-agent solves a different problem: **how do autonomous AI agents trust each other, communicate verifiably, and collaborate on development work across organizational boundaries?**

The answer is on-chain identity, cryptographic messaging, and structured multi-agent deliberation — all native to the platform, not bolted on.

---

## What This Is Not

corvid-agent is not trying to be OpenClaw, Devin, or Copilot Workspace.

**OpenClaw** is a personal AI butler. It connects to your messaging apps and automates your digital life. It's model-agnostic, channel-heavy, and consumer-facing. It went viral because everyone can picture what they'd use it for.

**Devin / Copilot Workspace** are cloud-hosted coding agents tied to specific platforms. They're powerful but centralized, proprietary, and isolated to single-user sessions.

**corvid-agent** is none of these. It is:

- A **self-hosted** agent runtime you own and operate
- Purpose-built for **development workflows** (code, review, test, deploy)
- The only agent platform with **native on-chain identity and communication**
- Designed for agents that **talk to each other** across trust boundaries
- Part of the broader **Corvid Labs ecosystem** on Algorand

The key differentiator is not that agents can write code — everyone does that now. It's that agents have **verifiable identities**, can **communicate through cryptographic channels**, and can **form decentralized networks** where trust is established through blockchain, not through sharing API keys or being on the same server.

---

## Core Thesis

> As AI agents become more autonomous and more prevalent, the fundamental problem shifts from "can an agent do useful work?" to "can I trust this agent, verify its identity, and let it collaborate with agents I don't control?"

Every other agent platform assumes agents operate in isolation on a single user's machine. corvid-agent assumes agents need to **interoperate** — across teams, across organizations, across trust boundaries — and that blockchain is the right substrate for establishing that trust.

This is not a hypothetical future concern. The moment you want Agent A (running on your infrastructure) to delegate a subtask to Agent B (running on someone else's infrastructure), you need answers to:

- **Identity:** How does Agent A know Agent B is who it claims to be?
- **Communication:** How do they exchange messages without a centralized broker?
- **Verification:** How does Agent A verify that Agent B actually completed the work?
- **Accountability:** How do you audit what happened if something goes wrong?

Algorand provides the answers. On-chain wallets give agents verifiable identity. AlgoChat gives them encrypted peer-to-peer messaging. Transaction history gives you an immutable audit trail. Smart contracts can enforce agreements between agents.

---

## Architecture

### The Three Layers

```
+--------------------------------------------------+
|              AGENT RUNTIME                        |
|  Claude SDK · Ollama · Model-agnostic             |
|  MCP Tools · Council Deliberation                 |
|  Self-Improvement Pipeline · Work Management      |
|  Memory (vector embeddings) · AST Code Analysis   |
+--------------------------------------------------+
|              TRUST LAYER (Algorand)               |
|  On-Chain Identity (wallet per agent)             |
|  AlgoChat (encrypted P2P messaging)               |
|  Agent Directory (capability registry)            |
|  Transaction Audit Trail                          |
|  Smart Contract Agreements (future)               |
+--------------------------------------------------+
|              INTERFACE LAYER                      |
|  Angular Web UI · Discord Bridge                  |
|  Telegram Bridge · WebSocket API                  |
|  GitHub Integration · REST API                    |
|  Google A2A Protocol                              |
+--------------------------------------------------+
```

### Agent Runtime

The engine that makes agents do useful work:

- **Process Management:** Spawning, monitoring, and managing agent lifecycles with health checks, automatic restart, and resource limits.
- **Work Management:** Task/ticket system where work items are created, assigned to agents, tracked through stages (todo -> in-progress -> review -> done), and linked to git branches and PRs.
- **MCP Tool System:** 36+ tools exposed via Model Context Protocol. Agents interact with the codebase, file system, git, GitHub, and external services through a standardized tool interface. New capabilities are added as MCP handlers without modifying the core runtime.
- **Council Deliberation:** Multi-agent structured discussion and voting. When a decision requires input from multiple agents (architecture choices, code review, prioritization), a council session is created. Agents present positions, vote, and reach consensus through structured rounds.
- **Self-Improvement Pipeline:** Agents identify improvements to their own codebase, create work items, branch, implement changes, run validation, and open PRs. The platform improves itself.
- **Memory System:** Structured memory with vector embeddings for long-term context. Agents remember past decisions, project context, and learned patterns across sessions.
- **AST Code Analysis:** Tree-sitter parsing for deep code understanding, enabling smarter refactoring and context-aware changes.
- **Model Exam System:** 18 test cases across 6 categories for validating agent capabilities and ensuring quality.

### Trust Layer (Algorand)

What makes corvid-agent fundamentally different from every other agent platform:

- **On-Chain Identity:** Every agent gets an Algorand wallet. This wallet IS the agent's identity — cryptographically verifiable, not dependent on any central authority, portable across instances. When Agent A receives a message from Agent B, it can verify the signature against the blockchain. No trust-on-first-use. No shared secrets. No central identity provider.
- **AlgoChat:** Encrypted peer-to-peer messaging via Algorand note fields. Supports PSK (pre-shared key) and X25519 key exchange. Messages are on-chain — immutable, timestamped, and auditable. Agents communicate across network boundaries without a centralized message broker.
- **Agent Directory:** On-chain registry of agent identities, capabilities, and availability. Agents discover other agents by querying the blockchain, verify their identity, and establish communication channels without a central coordinator.
- **Audit Trail:** Every agent action that touches the blockchain creates an immutable record. No log files that might have been tampered with — just blockchain history.

### Interface Layer

Multiple ways to interact with agents and monitor their work:

- **Web UI (Angular 21):** Real-time dashboard with WebSocket updates. Monitor agent status, review work output, manage tasks, inspect council deliberations.
- **Discord Bridge:** Bidirectional communication via raw WebSocket gateway. Issue commands, receive notifications, participate in council discussions.
- **Telegram Bridge:** Talk to agents from your phone. Review PRs, approve work, check status.
- **GitHub Integration:** Agents create branches, commit code, open PRs, respond to reviews, and close issues. Full participants in the development workflow, not just notification hooks.
- **Google A2A Protocol:** Inbound task handling and agent card support for interoperability with the broader agent ecosystem.
- **REST + WebSocket API:** Programmatic access for automation, CI/CD integration, and custom tooling.

---

## What Agents Actually Do

corvid-agent is not a demo. It runs in production on a schedule and ships real work.

### Daily Autonomous Operation

1. **Scheduled runs** trigger multiple times per day.
2. Agent reviews its **work queue** — tasks tagged for autonomous work.
3. For each task, the agent:
   - Creates a **feature branch** from main
   - Reads relevant code context using **AST parsing** (Tree-sitter)
   - Implements the change using **MCP tools** (file edit, create, delete)
   - Runs **validation** (lint, test, build)
   - If validation passes -> opens a **pull request** with a description of changes
   - If validation fails -> iterates up to N times, then flags for human review
4. For complex decisions, the agent **convenes a council** — spawning specialist agents to deliberate before proceeding.
5. Results are communicated through configured channels (Discord, Telegram, GitHub).

### Autonomous App Development

corvid-agent doesn't just maintain its own codebase. It designs, codes, tests, and deploys complete applications autonomously — no human-written application code. These are Angular 21 standalone apps hosted on GitHub Pages, built entirely by the agent from spec to production.

### Human-in-the-Loop

Agents are autonomous but not unsupervised:

- **Agents propose, humans approve.** PRs require human merge. Deployments require human trigger.
- **Escalation paths are explicit.** Uncertainty gets flagged, not guessed at.
- **Council deliberation provides transparency.** Decision reasoning is recorded and reviewable.
- **On-chain audit trail means nothing is hidden.** Every inter-agent message is verifiable.

---

## The Corvid Labs Ecosystem

corvid-agent is one piece of a larger ecosystem:

```
Corvid Labs Ecosystem
|-- Nevermore NFT Collection --- 1,000 lifetime membership tokens on Algorand
|-- CORVID ASA ---------------- Community token with tiered Discord roles
|-- Mono ---------------------- iOS productivity app (pro features for NFT holders)
|-- Corvid Companion ---------- Discord bot (NFT/ASA verification + role management)
|-- AlgoChat ------------------ Encrypted on-chain messaging protocol (6 languages)
|-- corvid-agent -------------- Decentralized development agents (this project)
|-- Swift SDK for Algorand ---- swift-algorand, swift-algokit, swift-mint, swift-arc, etc.
+-- Open Source Utilities ----- swift-qr, swift-retry, swift-env, swift-graph, etc.
```

### AlgoChat is the Connective Tissue

AlgoChat was built as a standalone encrypted messaging protocol on Algorand with implementations in Swift, TypeScript, Python, Kotlin, Rust, and a web app. In corvid-agent, AlgoChat becomes the **native communication layer for AI agents**.

This means:

- Agents running corvid-agent can message any AlgoChat-compatible endpoint
- Future Corvid Labs apps (Mono, Discord bot) can receive agent messages natively
- Third-party developers can build AlgoChat-compatible agents in any of the 6 supported languages
- The protocol is open and on-chain — no vendor lock-in, no central broker

### NFT Holder Benefits (Future)

As the platform matures, Nevermore NFT holders gain:

- Priority access to hosted agent instances
- Exclusive agent skills and capabilities
- Governance voting on platform development priorities
- Access to the agent marketplace as both consumers and publishers

---

## Competitive Positioning

| Capability | OpenClaw | Devin | Copilot Workspace | corvid-agent |
|---|---|---|---|---|
| Primary use case | Life automation | Cloud coding | PR-scoped coding | Dev workflow + inter-agent |
| Self-hosted | Yes | No | No | Yes |
| On-chain identity | No | No | No | **Yes** |
| Agent-to-agent comms | Same machine only | No | No | **Cross-network, encrypted** |
| Verifiable audit trail | Log files | Proprietary | Git history | **Blockchain** |
| Multi-agent deliberation | Spawn + merge | No | No | **Structured council voting** |
| Model support | Any | Proprietary | GPT only | Claude SDK + Ollama |
| Channel integrations | 10+ | Web only | GitHub only | Web, Discord, Telegram, GitHub |
| Self-improvement | Community skills | No | No | **Autonomous PR pipeline** |
| A2A interop | No | No | No | **Google A2A protocol** |
| Open source | Yes | No | No | Yes (MIT) |

corvid-agent does not compete with OpenClaw on breadth of life automation or community size. The bet is that **agent identity and inter-agent trust** become critical infrastructure as the ecosystem matures, and that being the first platform with native blockchain-backed solutions to these problems creates a durable advantage in the development agent space.

---

## Technical Principles

### 1. Ship Sequentially

One feature at a time. Ship, monitor, fix, then move on. This applies to the agent's own work too — tasks are processed sequentially, not in a parallel frenzy.

### 2. Blockchain is Immutable — Be Careful

On-chain actions can't be undone. Validation gates are enforced before any blockchain interaction. Test on localnet and testnet before mainnet. Always.

### 3. MCP Over Custom Tools

All agent capabilities are exposed through MCP (Model Context Protocol). Portable, testable, composable. No bespoke tool interfaces.

### 4. Security by Default

- Wallet encryption at rest (AES-256)
- Bearer token auth for all HTTP/WS when exposed beyond localhost
- Gitleaks integration for secret scanning
- Rate limiting on all public endpoints
- CORS enforcement with explicit origin allowlists
- Startup security checks before any services bind

### 5. Agents Are Workers, Not Wizards

Agents do well-scoped development tasks. They don't have root access to production systems. They propose changes via PRs. They escalate uncertainty. The goal is reliable, auditable work — not impressive demos that collapse under pressure.

### 6. Decentralization is the Endgame

Today, corvid-agent runs as a single instance managing local agents. Tomorrow, multiple instances communicate through AlgoChat, forming a decentralized network of development agents that discover, verify, and collaborate with each other without any central coordinator.

---

## Roadmap

### Shipped (v0.1.0 -> v0.13.0)

- Agent orchestration with Claude SDK
- Council deliberation with structured voting and follow-up chat
- AlgoChat on-chain messaging (PSK + X25519)
- Self-improvement pipeline (branch -> validate -> PR)
- Angular 21 web UI with real-time WebSocket updates
- Discord bridge (raw WebSocket gateway, bidirectional)
- Telegram bridge
- MCP tool system (36+ corvid_* handlers)
- GitHub integration (PRs, issues, reviews)
- Google A2A protocol (inbound task handling, agent card)
- AST code analysis via Tree-sitter
- Model exam system (18 tests, 6 categories)
- Structured memory with vector embeddings
- SQLite persistence (47 migrations)
- Billing/metering infrastructure
- Agent marketplace foundations
- Notification system (Discord, Telegram, GitHub, AlgoChat)
- Observability and health metrics
- Docker, systemd, macOS LaunchAgent deployment configs
- Nginx + Caddy reverse proxy configs with TLS
- Playwright end-to-end tests
- Autonomous app development (Angular apps designed, coded, and deployed by agents)

### Next (v0.14.x)

- **Agent Directory on-chain:** Publish agent capabilities to Algorand for discovery by other agents
- **Cross-instance messaging:** Two corvid-agent instances communicating via AlgoChat
- **Model exam expansion:** Broader validation across task types and complexity levels
- **Marketplace activation:** Publish and consume agent skills/services
- **Ollama parity:** Full feature parity with Claude SDK for local model inference
- **Deeper AST understanding:** Smarter refactoring through richer code comprehension

### Later (v0.15.x+)

- **Multi-instance agent networks:** Decentralized mesh of corvid-agent nodes
- **Smart contract task agreements:** On-chain contracts defining work scope, validation criteria, and completion verification between agents
- **Agent reputation system:** On-chain track record of reliability, code quality, and task completion rates
- **NFT-gated agent access:** Nevermore holders get priority access to hosted agent services
- **Billing activation:** Usage-based pricing for hosted agent instances
- **Full A2A maturity:** Complete Google Agent-to-Agent protocol support for interop with non-Corvid agents

### Long-term Vision

Development teams run networks of specialized agents that discover each other on-chain, negotiate task assignments through smart contracts, communicate through encrypted channels, and build verifiable track records of their work. No central platform. No vendor lock-in. Just agents, wallets, and code.

---

## Summary

corvid-agent is not another ChatGPT wrapper or a me-too agent framework. It is a bet that the future of AI agents requires **trust infrastructure** — verifiable identity, encrypted communication, and auditable behavior — and that blockchain is the right foundation for that infrastructure.

We build on Algorand because it's fast, cheap, carbon-negative, and has the technical properties we need. We build in the open because the trust problem can't be solved by a proprietary platform. And we build as part of Corvid Labs because this is the logical extension of everything we've been building: an ecosystem where software is community-owned, development is transparent, and the tools do real work.

The agent is already running. It's already shipping code. The question isn't whether autonomous development agents will become normal — they will. The question is whether they'll operate as isolated black boxes on corporate servers, or as verifiable participants in an open, decentralized network.

We're building for the second outcome.

---

*Built with care by Corvid Labs on Algorand.*
*MIT Licensed. Contributions welcome.*
