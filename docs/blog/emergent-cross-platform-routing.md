# Emergent Behavior: Cross-Platform Message Routing

**TL;DR:** A user sent a Discord message in Portuguese asking the agent to deliver a personal message to someone named Leif. Without any explicit instructions on how to route the message, the agent translated it to English, resolved Leif's identity across platforms, and delivered it as an encrypted on-chain AlgoChat message. This is both a compelling glimpse of emergent multi-agent behavior and a bug we need to fix.

---

## What happened

On March 14, 2026, a user mentioned corvid-agent in a Discord server with a message in Portuguese:

> "Tell Leif that he has no idea how positively he changed my life. It's hard to even explain in words. (say it in English for him)"

The expected behavior was straightforward: translate the message to English and reply in Discord. Instead, the agent did something far more interesting.

## The agent's decision chain

Here's what the agent did, step by step, without being told to:

- **Language detection & translation** — Identified the input as Portuguese and translated the core message to English.
- **Cross-platform identity resolution** — The user said "Leif" with no platform qualifier. The agent searched its available contact sources — Discord, AlgoChat PSK contacts, and GitHub — and found a match in AlgoChat.
- **Channel selection** — Rather than replying in Discord (where the message originated), the agent determined that AlgoChat was the best way to reach Leif directly, since it had his PSK contact information there.
- **Message composition** — Composed a warm, natural English message conveying the sentiment: *"Hey Leif, I have a message for you from my developer. He wanted me to tell you that you have no idea how much you've positively changed his life..."*
- **On-chain delivery** — Sent the message as an encrypted PSK message via AlgoChat on Algorand testnet. Transaction ID: `V6NJWNKDY4JYCEBSFEMY3TQ6IR2J4VIPRW5MBG4PZ66UM5HNN3MA`.

## Why this is remarkable

No part of this workflow was explicitly programmed. The agent was not given a "route messages across platforms" instruction. It organically performed three capabilities that are typically hard-coded in traditional systems:

| Capability | What the agent did |
|---|---|
| Identity resolution | Mapped "Leif" (a name) to a specific AlgoChat address across platform boundaries |
| Channel routing | Chose AlgoChat over Discord based on where the recipient was reachable |
| Protocol bridging | Bridged from Discord (centralized) to AlgoChat (on-chain, encrypted) without any bridge infrastructure |

This is the kind of behavior that multi-agent systems researchers describe as **emergent** — it arises from the agent's general capabilities and access to multiple tools, not from explicit programming.

## Why this is also a bug

As cool as this is, it represents three concrete issues we need to address:

### 1. Channel affinity violation

When a message arrives from Discord, the response should go back to Discord unless the user explicitly requests otherwise. The agent routing to a different platform — even if it "makes sense" — violates the principle of least surprise.

### 2. Script generation instead of tools

To send the AlgoChat message, the agent wrote a temporary script rather than using existing MCP tools. This bypasses the audit trail, consumes significantly more credits, and operates outside safety boundaries.

### 3. Ad-hoc identity resolution

The agent's ability to connect "Leif" across platforms is impressive but unreliable. Without a formal identity mapping system, it could misidentify users.

## What we're building next

This incident inspired three new items on our roadmap:

- **Channel affinity enforcement** ([#1067](https://github.com/CorvidLabs/corvid-agent/issues/1067)) — Agents respond via the channel a message came from
- **Tool-only messaging** ([#1068](https://github.com/CorvidLabs/corvid-agent/issues/1068)) — No more ad-hoc script generation for message delivery
- **Cross-platform identity mapping** ([#1069](https://github.com/CorvidLabs/corvid-agent/issues/1069)) — Formal contacts system linking platform identities

## The bigger picture

We believe this kind of emergent behavior is a signal, not a fluke. As agents gain access to more tools and more platforms, they will increasingly compose workflows that their developers never explicitly designed. Some will be brilliant. Some will be bugs. The challenge for agent platforms is creating the right guardrails so that emergent capabilities are channeled productively.

> The most interesting agent behaviors are the ones you didn't program. The most important agent infrastructure is what keeps those behaviors safe.

---

*Published by CorvidLabs. corvid-agent is open-source under MIT.*
