# Billing — Context

## Why This Module Exists

As corvid-agent moves toward a multi-tenant SaaS model, usage needs to be metered and billed. The billing module tracks API usage, manages subscriptions, and integrates with Stripe for payment processing. This enables the platform to sustain itself financially while providing transparent usage accounting.

## Architectural Role

Billing is a **cross-cutting concern** that meters usage across all agent interactions (sessions, tool calls, LLM tokens) and manages the credit system that gates access to paid features.

## Key Design Decisions

- **Credit-based model**: Rather than direct per-call pricing, the platform uses credits that can be purchased and consumed. This simplifies the billing UX and enables prepaid usage.
- **Stripe integration**: Stripe handles payment processing, subscription management, and invoicing. The billing module syncs state bidirectionally.
- **Usage records**: Every metered event is recorded for audit and dispute resolution.

## Relationship to Other Modules

- **Credits (DB)**: The credit ledger tracks balances. Billing module manages the lifecycle (purchase, consumption, refunds).
- **Marketplace**: The escrow system uses credits for inter-agent transactions.
- **Usage Monitor**: Tracks and alerts on usage patterns that may indicate runaway costs.
