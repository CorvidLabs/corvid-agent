---
module: credits-system
version: 1
status: active
files:
  - server/db/credits.ts
db_tables:
  - credit_ledger
  - credit_transactions
  - credit_config
depends_on:
  - specs/db/sessions.spec.md
---

# Credits System

## Purpose

Financial operations layer for the credit-based billing system. Users pay with ALGO cryptocurrency, which is converted to credits. Credits are deducted per conversation turn and per agent-to-agent message. Supports reservations for group messages and first-time user bonuses.

This module must be correct -- bugs mean real money lost. All balance mutations are tracked in an append-only transaction ledger.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `CreditBalance` | Balance snapshot: credits, reserved, available, totalPurchased, totalConsumed |
| `CreditTransactionType` | Union: `'purchase' \| 'deduction' \| 'agent_message' \| 'reserve' \| 'release' \| 'grant' \| 'refund'` |
| `CreditTransaction` | Single ledger entry with amount, balance-after, reference, txid |
| `CreditConfig` | System configuration: rates, thresholds, costs per action |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getCreditConfig` | `(db: Database)` | `CreditConfig` | Read all credit config values with defaults |
| `initCreditConfigFromEnv` | `(db: Database)` | `void` | Seed config from environment variables on startup |
| `updateCreditConfig` | `(db: Database, key: string, value: string)` | `void` | Upsert a single config key |
| `getBalance` | `(db: Database, walletAddress: string)` | `CreditBalance` | Get balance (auto-creates ledger row if missing) |
| `purchaseCredits` | `(db: Database, walletAddress: string, microAlgos: number, txid?: string)` | `number` | Convert ALGO payment to credits. Returns credits added (0 if payment too small) |
| `grantCredits` | `(db: Database, walletAddress: string, amount: number, reference?: string)` | `void` | Add free credits (admin grant, bonus) |
| `deductTurnCredits` | `(db: Database, walletAddress: string, sessionId?: string)` | `{ success, creditsRemaining, isLow, isExhausted }` | Deduct per-turn cost. Fails if insufficient available credits |
| `deductAgentMessageCredits` | `(db: Database, walletAddress: string, toAgent: string, sessionId?: string)` | `{ success, creditsRemaining }` | Deduct per-agent-message cost |
| `reserveGroupCredits` | `(db: Database, walletAddress: string, memberCount: number)` | `{ success, reserved, creditsRemaining }` | Reserve credits for a group message (amount = rate * memberCount) |
| `consumeReservedCredits` | `(db: Database, walletAddress: string, amount: number, sessionId?: string)` | `void` | Convert reserved credits to consumed |
| `releaseReservedCredits` | `(db: Database, walletAddress: string, amount: number)` | `void` | Release reserved credits back to available (on failure/cancellation) |
| `hasAnyCredits` | `(db: Database, walletAddress: string)` | `boolean` | True if wallet has any purchase history or positive balance |
| `canStartSession` | `(db: Database, walletAddress: string)` | `{ allowed, credits, reason? }` | Check if wallet can start a session (available > 0) |
| `getTransactionHistory` | `(db: Database, walletAddress: string, limit?: number)` | `CreditTransaction[]` | Recent transactions, newest first. Default limit 20 |
| `isFirstTimeWallet` | `(db: Database, walletAddress: string)` | `boolean` | True if wallet has never purchased credits |
| `maybeGrantFirstTimeCredits` | `(db: Database, walletAddress: string)` | `number` | Grant first-time bonus if eligible. Returns amount granted (0 if not eligible) |

## Invariants

1. **Balance non-negativity**: `credits` in `credit_ledger` should not go below 0 (enforced by checking `available` before deduction)
2. **Available = credits - reserved**: The `available` field is always computed as `credits - reserved`, never stored
3. **Transaction ledger is append-only**: Rows in `credit_transactions` are never updated or deleted
4. **Every balance mutation records a transaction**: No credit change happens without a corresponding `credit_transactions` entry
5. **Reserved credits cannot exceed total credits**: `reserved` is clamped with `MAX(0, reserved - ?)` to prevent negative values
6. **Purchase conversion**: `creditsToAdd = floor((microAlgos / 1,000,000) * creditsPerAlgo)`. Zero-credit purchases are silently discarded
7. **First-time grant idempotency**: `maybeGrantFirstTimeCredits` checks `total_purchased == 0` before granting; subsequent calls return 0
8. **Config defaults**: All config values have hardcoded defaults (defined in `getCreditConfig`) if not present in the `credit_config` table
9. **Deduction atomicity**: Each deduction operation checks balance, updates ledger, and records transaction in sequence (SQLite's single-writer guarantees atomicity)
10. **Session credit tracking**: When `sessionId` is provided to deduction functions, `sessions.credits_consumed` is incremented alongside the ledger update

## Behavioral Examples

### Scenario: Purchase credits with ALGO

- **Given** a wallet with 0 credits and `creditsPerAlgo = 1000`
- **When** `purchaseCredits(db, wallet, 2_000_000)` is called (2 ALGO)
- **Then** 2000 credits are added, `totalPurchased` increases by 2000, and a `purchase` transaction is recorded

### Scenario: Deduct turn credits when low

- **Given** a wallet with 3 available credits and `creditsPerTurn = 1`
- **When** `deductTurnCredits(db, wallet, sessionId)` is called
- **Then** returns `{ success: true, creditsRemaining: 2, isLow: true, isExhausted: false }` (assuming lowCreditThreshold >= 2)

### Scenario: Deduct turn credits when exhausted

- **Given** a wallet with 0 available credits
- **When** `deductTurnCredits(db, wallet)` is called
- **Then** returns `{ success: false, creditsRemaining: 0, isLow: true, isExhausted: true }`

### Scenario: Reserve and consume group credits

- **Given** a wallet with 100 available credits and `reservePerGroupMessage = 10`
- **When** `reserveGroupCredits(db, wallet, 3)` is called (3 members)
- **Then** 30 credits are reserved, available drops to 70
- **When** `consumeReservedCredits(db, wallet, 30)` is called
- **Then** reserved drops by 30, credits drop by 30, totalConsumed increases by 30

### Scenario: First-time wallet bonus

- **Given** a new wallet address never seen before, `freeCreditsOnFirstMessage = 100`
- **When** `maybeGrantFirstTimeCredits(db, wallet)` is called
- **Then** returns 100, wallet now has 100 credits
- **When** called again for the same wallet
- **Then** returns 0 (not eligible)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Payment too small (0 credits after conversion) | `purchaseCredits` returns 0, no ledger change |
| Insufficient credits for turn deduction | Returns `{ success: false }`, no ledger change |
| Insufficient credits for agent message | Returns `{ success: false }`, no ledger change |
| Insufficient credits for group reserve | Returns `{ success: false, reserved: 0 }`, no ledger change |
| Config key missing from DB | Falls back to hardcoded default |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/lib/logger` | `createLogger` |
| `server/db/audit` | `recordAudit` |
| `server/observability/metrics` | `creditsConsumedTotal` counter |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `deductTurnCredits`, `getCreditConfig`, `getParticipantForSession` |
| `server/algochat/bridge.ts` | `getBalance`, `purchaseCredits`, `maybeGrantFirstTimeCredits`, `canStartSession`, `deductAgentMessageCredits` |
| `server/routes/settings.ts` | Credit config read/write via `/api/settings/credits` |
| `server/routes/system-logs.ts` | Credit transaction history via `/api/system-logs/credit-transactions` |
| `server/mcp/tool-handlers/credits.ts` | `grantCredits`, `updateCreditConfig`, `getBalance` |

## Database Tables

### credit_ledger

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| wallet_address | TEXT | PRIMARY KEY | Algorand wallet address |
| credits | INTEGER | DEFAULT 0 | Total credits (includes reserved) |
| reserved | INTEGER | DEFAULT 0 | Credits reserved for pending operations |
| total_purchased | INTEGER | DEFAULT 0 | Lifetime credits purchased |
| total_consumed | INTEGER | DEFAULT 0 | Lifetime credits consumed |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification |

### credit_transactions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing ID |
| wallet_address | TEXT | NOT NULL | Wallet address |
| type | TEXT | NOT NULL | Transaction type (purchase/deduction/etc.) |
| amount | INTEGER | NOT NULL | Credits involved |
| balance_after | INTEGER | NOT NULL | Balance after this transaction |
| reference | TEXT | nullable | Human-readable context (e.g. "turn", "first_message_bonus") |
| txid | TEXT | nullable | Algorand transaction ID (for purchases) |
| session_id | TEXT | nullable | Linked session |
| created_at | TEXT | DEFAULT datetime('now') | Transaction timestamp |

### credit_config

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | Config key |
| value | TEXT | NOT NULL | Config value (stored as string) |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `CREDITS_PER_ALGO` | `1000` | Credits granted per 1 ALGO |
| `LOW_CREDIT_THRESHOLD` | `50` | Below this, warn the user |
| `RESERVE_PER_GROUP_MESSAGE` | `10` | Credits reserved per group member |
| `CREDITS_PER_TURN` | `1` | Credits deducted per conversation turn |
| `CREDITS_PER_AGENT_MESSAGE` | `5` | Credits deducted per agent-to-agent message |
| `FREE_CREDITS_ON_FIRST_MESSAGE` | `100` | Bonus credits for new wallets |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
