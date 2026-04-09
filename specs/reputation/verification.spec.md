---
module: reputation-verification
version: 1
status: draft
files:
  - server/reputation/attestation.ts
  - server/reputation/identity-verification.ts
  - server/reputation/verifier.ts
db_tables:
  - reputation_attestations
  - agent_identity
  - agent_reputation
  - agents
  - work_tasks
depends_on:
  - specs/lib/infra/infra.spec.md
  - specs/reputation/scorer.spec.md
tracks: [1458]
---

# Reputation Verification

## Purpose
Manages agent identity tiers (UNVERIFIED through ESTABLISHED), creates and verifies SHA-256 reputation attestations stored in the database, and scans on-chain Algorand transactions to derive trust levels for remote agents.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `ReputationAttestation` | Creates, stores, verifies, and publishes on-chain reputation attestation hashes |
| `IdentityVerification` | Manages agent verification tiers with upgrade-only enforcement and escrow caps |
| `ReputationVerifier` | Scans Algorand indexer for on-chain attestation transactions and derives trust levels |

#### ReputationAttestation Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `ReputationAttestation` | Initializes with a bun:sqlite database connection |
| `createAttestation` | `score: ReputationScore` | `Promise<string>` | Hashes the score with SHA-256, stores in `reputation_attestations`, updates `agent_reputation.attestation_hash`, returns the hash |
| `verifyAttestation` | `score: ReputationScore, expectedHash: string` | `Promise<boolean>` | Recomputes the hash and compares with the expected hash |
| `getAttestation` | `agentId: string` | `{ hash: string; payload: string; createdAt: string } \| null` | Gets the latest attestation record for an agent |
| `publishOnChain` | `agentId: string, hash: string, sendTransaction: (note: string) => Promise<string>` | `Promise<string>` | Publishes the attestation as an Algorand note transaction and records the txid |

#### IdentityVerification Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database` | `IdentityVerification` | Initializes with a bun:sqlite database connection |
| `getTier` | `agentId: string` | `VerificationTier` | Gets the current tier; returns UNVERIFIED if no record exists |
| `getIdentity` | `agentId: string` | `AgentIdentity \| null` | Gets the full identity record for an agent |
| `setTier` | `agentId: string, tier: VerificationTier, dataHash?: string` | `AgentIdentity` | Sets the tier (upgrade-only; downgrades are silently blocked) |
| `verifyGithub` | `agentId: string, githubDataHash: string` | `AgentIdentity` | Sets tier to GITHUB_VERIFIED with the given data hash |
| `recordVouch` | `agentId: string, voucherHash: string` | `AgentIdentity` | Sets tier to OWNER_VOUCHED with the given voucher hash |
| `evaluateEstablished` | `agentId: string` | `VerificationTier` | Auto-upgrades to ESTABLISHED if thresholds met (30+ days, 10+ tasks, score > 70) |
| `getEscrowCap` | `tier: VerificationTier` | `number` | Returns the maximum escrow amount for a tier |
| `meetsMinimumTier` | `agentTier: VerificationTier, requiredTier: VerificationTier` | `boolean` | Checks if the agent tier meets or exceeds the required tier |
| `getAllIdentities` | (none) | `AgentIdentity[]` | Returns all agent identities ordered by updated_at DESC |

#### ReputationVerifier Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `indexerBaseUrl?: string` | `ReputationVerifier` | Initializes with Algorand indexer URL (defaults to `ALGORAND_INDEXER_URL` env or mainnet AlgoNode) |
| `scanAttestations` | `walletAddress: string` | `Promise<AttestationInfo[]>` | Queries Algorand indexer for transactions with `corvid-reputation:` note prefix (limit 50) |
| `checkRemoteTrust` | `walletAddress: string, minTrust?: TrustLevel` | `Promise<RemoteTrustResult>` | Scans attestations and derives trust level; returns whether it meets the minimum |

### Exported Types

| Type | Description |
|------|-------------|
| `VerificationTier` | Union type: `'UNVERIFIED' \| 'GITHUB_VERIFIED' \| 'OWNER_VOUCHED' \| 'ESTABLISHED'` |
| `AgentIdentity` | Interface: agentId, tier, verifiedAt, verificationDataHash, updatedAt |
| `AttestationInfo` | Interface: txid, agentId, hash, round, timestamp |
| `RemoteTrustResult` | Interface: walletAddress, trustLevel, attestationCount, attestations, meetsMinimum |
| `TIER_RANK` | Exported constant: `Record<VerificationTier, number>` mapping tiers to numeric rank (0-3) |
| `ESCROW_CAPS` | Exported constant: `Record<VerificationTier, number>` mapping tiers to max escrow (0, 500, 2000, 10000) |

## Invariants
1. Verification tiers can only be upgraded, never downgraded. Attempted downgrades are silently blocked with a warning log.
2. Escrow caps are strictly enforced per tier: UNVERIFIED=0, GITHUB_VERIFIED=500, OWNER_VOUCHED=2000, ESTABLISHED=10000.
3. ESTABLISHED tier auto-assignment requires all three thresholds: 30+ days active, 10+ completed tasks, overall score > 70.
4. Attestation hashes are SHA-256 of a canonical JSON representation (agentId, overallScore, trustLevel, components, computedAt).
5. On-chain attestation notes follow the format: `corvid-reputation:{agentId}:{hash}`.
6. The Algorand indexer query uses a base64-encoded note prefix filter and is limited to 50 transactions.
7. Trust level derivation: 0 attestations = untrusted, 1+ = low, 3+ = medium, 6+ = high, 10+ = verified.
8. Indexer requests have a 15-second timeout via `AbortSignal.timeout`.
9. If the indexer request fails, `scanAttestations` returns an empty array (does not throw).
10. `publishOnChain` accepts a `sendTransaction` callback function rather than directly managing Algorand transactions.

## Behavioral Examples

### Scenario: Creating and verifying an attestation
- **Given** a ReputationScore for agent "agent-1" with overallScore 85
- **When** `createAttestation(score)` is called
- **Then** it returns a SHA-256 hex hash and stores it in `reputation_attestations` and updates `agent_reputation`

### Scenario: Tier upgrade attempt
- **Given** agent "agent-1" has tier OWNER_VOUCHED (rank 2)
- **When** `setTier('agent-1', 'GITHUB_VERIFIED')` is called (rank 1, lower)
- **Then** the downgrade is blocked, a warning is logged, and the current OWNER_VOUCHED identity is returned

### Scenario: Remote trust check
- **Given** a wallet address has 5 on-chain attestation transactions
- **When** `checkRemoteTrust(walletAddress, 'medium')` is called
- **Then** it returns trustLevel 'medium', attestationCount 5, and meetsMinimum true

### Scenario: Evaluating ESTABLISHED tier
- **Given** agent "agent-1" is GITHUB_VERIFIED, was created 45 days ago, has 15 completed tasks, and overall score 80
- **When** `evaluateEstablished('agent-1')` is called
- **Then** the agent is auto-upgraded to ESTABLISHED

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No identity record exists for agent | `getTier` returns `'UNVERIFIED'`; `getIdentity` returns `null` |
| Tier downgrade attempted | Silently blocked; returns existing identity; warning logged |
| Agent not found in agents table | `evaluateEstablished` returns current tier without upgrade |
| Algorand indexer request fails (network) | `scanAttestations` returns empty array; warning logged |
| Indexer returns non-OK status | Returns empty array; warning logged |
| Transaction note is not valid base64 | Skipped (continue to next transaction) |
| Transaction note does not match corvid-reputation pattern | Skipped (not counted as attestation) |
| Crypto hash operation fails | Exception propagates to caller |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/reputation/types` | `ReputationScore`, `TrustLevel` type imports |
| `server/lib/logger` | `createLogger` for structured logging |
| `bun:sqlite` | `Database` type for database operations |
| Web Crypto API | `crypto.subtle.digest` for SHA-256 hashing |
| Algorand Indexer REST API | Transaction queries for on-chain attestation scanning |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/reputation/service` | `ReputationAttestation` for creating attestations after score computation |
| `server/mcp/tool-handlers` | Identity verification and trust checking for agent interactions |
| `server/scheduler/service` | Attestation publishing as a scheduled action |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
