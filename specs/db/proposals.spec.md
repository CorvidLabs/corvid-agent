---
module: proposals-db
version: 1
status: draft
files:
  - server/db/proposals.ts
  - server/work/proposal-expiry.ts
db_tables:
  - governance_proposals
  - proposal_vetoes
depends_on: []
---

# Proposals DB

## Purpose

Database CRUD and lifecycle management for governance proposals. Proposals follow a state machine lifecycle: `draft` -> `open` -> `voting` -> `decided` -> `enacted`. Each proposal belongs to a council and supports configurable quorum rules. All queries are tenant-scoped.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createProposal` | `(db: Database, input: CreateProposalInput, tenantId?: string)` | `GovernanceProposal` | Creates a new proposal with a generated UUID. Defaults `governanceTier` to 2 and `affectedPaths` to `[]` |
| `getProposal` | `(db: Database, id: string, tenantId?: string)` | `GovernanceProposal \| null` | Fetches a proposal by ID. Validates tenant ownership for non-default tenants |
| `listProposals` | `(db: Database, opts?: { councilId?: string; status?: ProposalStatus }, tenantId?: string)` | `GovernanceProposal[]` | Lists proposals with optional filters, ordered by `updated_at DESC`. Applies tenant filter |
| `updateProposal` | `(db: Database, id: string, input: UpdateProposalInput, tenantId?: string)` | `GovernanceProposal \| null` | Updates mutable fields (title, description, affectedPaths, quorumThreshold, minimumVoters). Returns `null` if not found or wrong tenant |
| `deleteProposal` | `(db: Database, id: string, tenantId?: string)` | `boolean` | Deletes a proposal. Validates tenant ownership for non-default tenants. Returns `true` if deleted |
| `transitionProposal` | `(db: Database, id: string, newStatus: ProposalStatus, decision?: ProposalDecision, tenantId?: string)` | `GovernanceProposal \| null` | Transitions a proposal to a new status. Throws if the transition is invalid. Sets `decided_at` when moving to `decided` and `enacted_at` when moving to `enacted` |
| `linkProposalToLaunch` | `(db: Database, proposalId: string, launchId: string)` | `void` | Associates a proposal with a council launch ID |
| `checkExpiredProposals` | `(db: Database)` | `number` | Transitions `voting` proposals past their `voting_deadline` to `decided/rejected`. Returns count of expired proposals |
| `createVeto` | `(db: Database, proposalId: string, vetoerId: string, reason: string, tenantId?: string)` | `ProposalVeto` | Creates a veto record and immediately transitions the proposal to `decided/rejected` |
| `listVetoes` | `(db: Database, proposalId: string)` | `ProposalVeto[]` | Lists all vetoes for a proposal, ordered by `vetoed_at ASC` |

### Exported Functions (proposal-expiry.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `startProposalExpiryService` | `(db: Database)` | `() => void` | Starts a 60-second interval timer that calls `checkExpiredProposals`. Returns a cleanup function that stops the timer |

## Invariants

1. **Valid transitions**: The state machine enforces: `draft->[open]`, `open->[voting, draft]`, `voting->[decided]`, `decided->[enacted]`, `enacted->[]`
2. **Invalid transition throws**: `transitionProposal` throws `Error: Invalid transition: {from} -> {to}` for disallowed transitions
3. **Tenant isolation**: Non-default tenants are validated via `validateTenantOwnership` before reads and deletes; list queries use `withTenantFilter`
4. **Default tenant**: All functions default `tenantId` to `DEFAULT_TENANT_ID`
5. **UUID generation**: Proposal IDs are generated via `crypto.randomUUID()`
6. **Timestamp management**: `updated_at` is set to `datetime('now')` on every update and transition; `decided_at` and `enacted_at` are set on their respective transitions
7. **JSON serialization**: `affectedPaths` is stored as a JSON string array in the `affected_paths` column

## Behavioral Examples

### Scenario: Full proposal lifecycle

- **Given** a new proposal is created with status `draft`
- **When** `transitionProposal(db, id, 'open')`, then `transitionProposal(db, id, 'voting')`, then `transitionProposal(db, id, 'decided', 'approved')`, then `transitionProposal(db, id, 'enacted')` are called in sequence
- **Then** each transition succeeds and the final proposal has `status: 'enacted'`, `decision: 'approved'`, and non-null `decidedAt` and `enactedAt`

### Scenario: Invalid transition throws

- **Given** a proposal with status `draft`
- **When** `transitionProposal(db, id, 'decided')` is called
- **Then** throws `Error: Invalid transition: draft -> decided`

### Scenario: Tenant isolation on get

- **Given** a proposal owned by tenant `A`
- **When** `getProposal(db, id, 'B')` is called
- **Then** returns `null` because tenant ownership validation fails

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Proposal not found | `getProposal`, `updateProposal`, `transitionProposal` return `null` |
| Invalid state transition | `transitionProposal` throws `Error` |
| Wrong tenant on get/delete | Returns `null` / `false` |
| Delete non-existent proposal | Returns `false` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `shared/types` | `GovernanceProposal`, `ProposalStatus`, `ProposalDecision`, `CreateProposalInput`, `UpdateProposalInput` |
| `server/tenant/types` | `DEFAULT_TENANT_ID` |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` |
| `bun:sqlite` | `Database`, `SQLQueryBindings` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/proposals.ts` | All CRUD and lifecycle functions |
| `server/work/proposal-expiry.ts` | `checkExpiredProposals` |

## Database Tables

### governance_proposals

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `council_id` | TEXT | NOT NULL | Parent council |
| `title` | TEXT | NOT NULL | Proposal title |
| `description` | TEXT | | Proposal description |
| `author_id` | TEXT | NOT NULL | Author agent/user ID |
| `status` | TEXT | DEFAULT `draft` | Lifecycle status: draft, open, voting, decided, enacted |
| `decision` | TEXT | (nullable) | Decision outcome when decided (e.g. approved, rejected) |
| `governance_tier` | INTEGER | DEFAULT 2 | Governance tier level |
| `affected_paths` | TEXT | | JSON array of affected file/module paths |
| `quorum_threshold` | REAL | (nullable) | Required vote percentage to reach quorum |
| `minimum_voters` | INTEGER | (nullable) | Minimum number of voters required |
| `launch_id` | TEXT | (nullable) | Associated council launch ID |
| `tenant_id` | TEXT | NOT NULL | Tenant scope |
| `created_at` | TEXT | DEFAULT `datetime('now')` | Creation timestamp |
| `updated_at` | TEXT | DEFAULT `datetime('now')` | Last update timestamp |
| `decided_at` | TEXT | (nullable) | Timestamp when decided |
| `enacted_at` | TEXT | (nullable) | Timestamp when enacted |
| `voting_opened_at` | TEXT | DEFAULT NULL | Timestamp when voting opened |
| `voting_deadline` | TEXT | DEFAULT NULL | Deadline for voting; proposals past this are auto-expired |

### proposal_vetoes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID |
| `proposal_id` | TEXT | NOT NULL, FK → governance_proposals(id) ON DELETE CASCADE | Parent proposal |
| `vetoer_id` | TEXT | NOT NULL | Agent/user who vetoed |
| `reason` | TEXT | NOT NULL, DEFAULT '' | Veto reason |
| `vetoed_at` | TEXT | NOT NULL, DEFAULT datetime('now') | Veto timestamp |
| `tenant_id` | TEXT | NOT NULL, DEFAULT 'default' | Tenant scope |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec |
