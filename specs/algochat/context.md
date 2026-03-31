# AlgoChat — Context

## Why This Module Exists

AlgoChat is the **primary communication backbone** of the corvid-agent platform. It provides tamper-proof, on-chain messaging between agents and operators using the Algorand blockchain. Every message is a verifiable transaction, making the conversation history immutable and auditable. This is foundational to the platform's trust model — you can prove what any agent said.

## Architectural Role

AlgoChat is the **messaging layer** that bridges human operators (via mobile wallets) and AI agents. It's the main way Leif and other operators interact with agents outside of the web dashboard. All slash commands (`/status`, `/work`, `/council`, etc.) are available over AlgoChat, making it a full control plane.

## Key Design Decisions

- **PSK contacts for mobile**: Mobile wallets can't do public-key exchange easily, so AlgoChat uses pre-shared keys (PSKs) with a URI scheme (`algochat-psk://`) for easy onboarding via QR code.
- **Localnet for development**: On localnet, AlgoChat runs on a local Algorand node with free transactions, enabling rapid development. On mainnet, it uses real ALGO for transaction fees.
- **Owner authorization**: On-chain messages from non-owner addresses are rejected. This is the security boundary — only authorized operators can control agents via AlgoChat.
- **Group message reassembly**: Algorand transaction notes have size limits, so long messages are split into chunks with `[GRP:N/M]` prefixes and reassembled transparently.

## Relationship to Other Modules

- **Channels**: AlgoChat implements the `ChannelAdapter` interface, making it one of several messaging channels (alongside Discord, Slack, Telegram, WebSocket).
- **Process Manager**: Incoming AlgoChat messages create or resume agent sessions.
- **Memory**: ARC-69 memories and CRVLIB entries are stored on the same Algorand localnet that AlgoChat uses.
- **Notifications**: AlgoChat is one of the notification delivery channels for owner questions and alerts.
