---
module: marketplace-escrow
version: 1
status: active
files:
  - server/marketplace/escrow.ts
db_tables:
  - escrow_transactions
  - credit_ledger
  - credit_transactions
depends_on:
  - specs/db/credits.spec.md
---

# Marketplace Escrow

## Purpose

Credit-based escrow service for marketplace transactions. Holds buyer credits in escrow until delivery is confirmed, then transfers to seller. Supports disputes and auto-release after 72 hours.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `EscrowState` | Union: `'FUNDED' \| 'DELIVERED' \| 'RELEASED' \| 'DISPUTED' \| 'RESOLVED' \| 'REFUNDED'` |
| `EscrowTransaction` | Transaction record: id, listingId, buyerTenantId, sellerTenantId, amountCredits, state, timestamps |
| `AUTO_RELEASE_HOURS` | Constant: 72 hours |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `EscrowService` | class | — | Escrow service managing credit-based marketplace transactions |

### `EscrowService` Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `fund` | `(listingId, buyerTenantId, sellerTenantId, amountCredits)` | `EscrowTransaction \| null` | Create escrow, debit buyer. Returns null if insufficient funds. |
| `markDelivered` | `(escrowId, sellerTenantId)` | `EscrowTransaction \| null` | Seller marks delivery complete. Verifies seller ownership. |
| `release` | `(escrowId)` | `EscrowTransaction \| null` | Transfer credits to seller. Only from DELIVERED state. |
| `dispute` | `(escrowId, buyerTenantId)` | `EscrowTransaction \| null` | Buyer disputes. Only from FUNDED or DELIVERED state. |
| `resolveForSeller` | `(escrowId)` | `EscrowTransaction \| null` | Resolve dispute, credit seller. Only from DISPUTED state. |
| `refund` | `(escrowId)` | `EscrowTransaction \| null` | Refund buyer. Only from DISPUTED state. |
| `processAutoReleases` | `()` | `EscrowTransaction[]` | Release all DELIVERED escrows past 72h window. |
| `getTransaction` | `(id)` | `EscrowTransaction \| null` | Get single escrow by ID. |
| `getByBuyer` | `(buyerTenantId)` | `EscrowTransaction[]` | All escrows for a buyer, newest first. |
| `getBySeller` | `(sellerTenantId)` | `EscrowTransaction[]` | All escrows for a seller, newest first. |

## State Machine

```
FUNDED → DELIVERED → RELEASED
                   ↘ (auto-release after 72h)
FUNDED → DISPUTED → RESOLVED (credits to seller)
                   → REFUNDED (credits to buyer)
DELIVERED → DISPUTED → RESOLVED | REFUNDED
```

## Invariants

1. **Atomic fund**: `fund()` uses `db.transaction()` with atomic `WHERE (credits - reserved) >= ?` guard — prevents TOCTOU double-funding.
2. **State guards**: `release()` requires DELIVERED state. `dispute()` requires FUNDED or DELIVERED. `resolveForSeller()` and `refund()` require DISPUTED.
3. **Seller ownership**: `markDelivered()` verifies `sellerTenantId` matches the escrow record before transitioning.
4. **Buyer ownership**: `dispute()` verifies `buyerTenantId` matches before allowing dispute.
5. **Audit trail**: All credit mutations (fund, release, resolve, refund) write to `credit_transactions` and `recordAudit`.
6. **Auto-release**: `processAutoReleases()` selects DELIVERED escrows where `delivered_at + 72h <= now` and releases them.
7. **Seller ledger creation**: `release()` and `resolveForSeller()` use `INSERT OR IGNORE` to ensure seller has a `credit_ledger` row before crediting.

## Behavioral Examples

### Successful escrow flow
```
Given: buyer has 100 credits, 0 reserved
When: fund("listing-1", "buyer", "seller", 50)
Then: buyer balance is 50, escrow state is FUNDED
When: markDelivered(escrowId, "seller")
Then: state is DELIVERED
When: release(escrowId)
Then: state is RELEASED, seller balance increased by 50
```

### Insufficient funds
```
Given: buyer has 30 credits, 0 reserved
When: fund("listing-1", "buyer", "seller", 50)
Then: returns null, buyer balance unchanged
```

### Dispute and refund
```
Given: escrow is in FUNDED state
When: dispute(escrowId, "buyer")
Then: state is DISPUTED
When: refund(escrowId)
Then: state is REFUNDED, buyer credits restored
```

## Error Cases

| Scenario | Behavior |
|----------|----------|
| Buyer has insufficient credits | `fund()` returns `null`, no escrow created, balance unchanged |
| Wrong seller calls `markDelivered` | Returns `null`, no state change |
| Wrong buyer calls `dispute` | Returns `null`, no state change |
| `release()` on non-DELIVERED escrow | Returns `null` |
| `refund()` / `resolveForSeller()` on non-DISPUTED escrow | Returns `null` |
| Escrow ID not found | All methods return `null` |

## Dependencies

| Dependency | Usage |
|------------|-------|
| `server/db/credits.ts` | `getBalance()` for post-mutation balance snapshots |
| `server/db/audit.ts` | `recordAudit()` for audit trail |

## Change Log

- v1 (2026-03-06): Initial spec created during documentation audit.
