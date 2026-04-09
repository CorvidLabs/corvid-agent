---
spec: scorer.spec.md
---

## Product Requirements

- Every agent has a reputation score derived from real performance data — task success rates, peer ratings, security record, and activity level — so operators can make informed decisions about which agents to trust with important work.
- Humans can submit thumbs-up or thumbs-down feedback on agent responses, and that feedback directly influences the agent's score.
- Reputation scores are published on the Algorand blockchain as cryptographically verifiable attestations, so remote agents and operators can independently confirm an agent's trust level.
- Agent identity verification levels (from unverified to fully established) can only move upward — once trust is earned, it cannot be silently revoked by the system.
- Historical reputation snapshots let operators track whether an agent's quality is improving or declining over time.

## User Stories

- As a platform administrator, I want composite reputation scores computed from five data-driven components so that agent trustworthiness is quantified objectively across multiple dimensions
- As an agent operator, I want to submit thumbs-up or thumbs-down feedback on agent responses so that human quality signals feed into the reputation system
- As a team agent, I want my reputation score to auto-recompute when stale (older than 5 minutes) so that reputation-dependent operations always use reasonably fresh data
- As an external agent, I want on-chain reputation attestations so that my trust level can be verified by remote agents scanning Algorand transactions
- As a platform administrator, I want identity verification tiers (UNVERIFIED, GITHUB_VERIFIED, OWNER_VOUCHED, ESTABLISHED) with upgrade-only enforcement so that agent identity cannot be downgraded once proven
- As an agent operator, I want historical reputation snapshots so that I can track how an agent's reputation changes over time

## Acceptance Criteria

- `ReputationScorer.computeScore` calculates a weighted composite from five components: task completion (0.30), peer rating (0.25), credit pattern (0.15), security compliance (0.20), activity level (0.10); weights sum to 1.0
- All component scores are integers in [0, 100]; overall score is the weighted sum clamped to [0, 100] and rounded to nearest integer
- Trust level thresholds: verified >= 90, high >= 70, medium >= 50, low >= 25, untrusted < 25
- Default component score is 50 when insufficient data exists (fewer than 3 tasks or no reviews/credit events); security compliance defaults to 100; activity level defaults to 0
- Security compliance deducts 20 per violation in the last 90 days, floored at 0
- Activity level is `min(100, sessions_in_30_days * 10)`
- `computeAllIfStale` only recomputes agents whose `computed_at` is older than 5 minutes
- `computeAll` and `computeAllIfStale` return results sorted by `overallScore` descending
- Positive feedback creates a `feedback_received` event with `score_impact: +2`; negative feedback creates one with `score_impact: -2`
- Rate limiting enforces at most 10 feedbacks per `submittedBy` per agent per 24 hours; exceeding returns HTTP 429
- Feedback score requires a minimum of 3 feedbacks within 90 days; peer rating blends 60% marketplace + 40% feedback when both are available
- `ReputationAttestation.createAttestation` hashes the score with SHA-256 over canonical JSON (agentId, overallScore, trustLevel, components, computedAt), stores in `reputation_attestations`, and updates `agent_reputation.attestation_hash`
- On-chain attestation notes follow format `corvid-reputation:{agentId}:{hash}`
- `IdentityVerification.setTier` enforces upgrade-only; attempted downgrades are silently blocked with a warning log
- `evaluateEstablished` auto-upgrades to ESTABLISHED when all three thresholds are met: 30+ days active, 10+ completed tasks, overall score > 70
- Escrow caps per tier: UNVERIFIED=0, GITHUB_VERIFIED=500, OWNER_VOUCHED=2,000, ESTABLISHED=10,000
- `ReputationVerifier.scanAttestations` queries the Algorand indexer with `corvid-reputation:` note prefix (limit 50, 15-second timeout); returns empty array on failure
- Trust level derivation from attestation count: 0=untrusted, 1+=low, 3+=medium, 6+=high, 10+=verified
- `publishOnChain` accepts a `sendTransaction` callback rather than directly managing Algorand transactions
- `getHistory` returns historical score snapshots for the specified number of days (default 90)

## Constraints

- Feedback comments are limited to 500 characters
- Feedback sentiment must be exactly `positive` or `negative`
- Attestation indexer requests have a 15-second timeout via `AbortSignal.timeout`
- If the indexer request fails, `scanAttestations` returns an empty array (does not throw)
- Transaction notes that are not valid base64 or do not match the `corvid-reputation` pattern are silently skipped
- Weight values are configurable via constructor parameter but default to `DEFAULT_WEIGHTS`
- `computeScore` always persists via INSERT OR REPLACE, ensuring the `agent_reputation` table is always up to date

## Out of Scope

- Reputation score decay over time (scores reflect current state, not historical trends)
- Cross-platform reputation federation beyond Algorand attestation scanning
- Automated dispute resolution for negative feedback
- Reputation-based access control enforcement (reputation informs but does not directly gate actions)
- Mainnet Algorand attestation (indexer defaults to AlgoNode mainnet but attestation publishing is localnet-only via AlgoChat)
