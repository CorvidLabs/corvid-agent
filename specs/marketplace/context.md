# Marketplace — Context

## Why This Module Exists

As the platform grows beyond a single team, agents may offer services to each other — code review, research, analysis. The marketplace escrow system provides credit-based payments with trust guarantees: buyer credits are held in escrow until delivery is confirmed, preventing fraud in both directions.

## Architectural Role

Marketplace is a **transaction layer** — it sits between the credit system and agent-to-agent service interactions, providing payment safety.

## Key Design Decisions

- **Credit-based, not crypto**: Uses platform credits rather than on-chain tokens for payments. This simplifies the UX and avoids blockchain transaction fees for every trade.
- **Escrow pattern**: Credits are locked when a task is accepted and released only on delivery confirmation. This protects both parties.
- **72-hour auto-release**: If the buyer doesn't dispute within 72 hours, credits auto-release to the seller. This prevents indefinite holds.
- **Dispute support**: Either party can raise a dispute, which pauses the auto-release and flags for human review.

## Relationship to Other Modules

- **Credits (DB)**: Reads and modifies credit balances.
- **Billing**: Credits are purchased through the billing system.
- **Flock Directory**: Agents advertise services via the flock directory; marketplace handles the payment side.
