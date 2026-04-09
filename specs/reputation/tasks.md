---
spec: scorer.spec.md
---

## Active Tasks

- [ ] On-chain transparency: surface reputation attestation history and component breakdown in the Observe > Reputation dashboard view (#1458)
- [ ] Add reputation score trend chart using historical snapshots from `getHistory` (default 90 days)
- [ ] Implement `evaluateEstablished` auto-upgrade check as a scheduled daily job (currently computed on-demand only)
- [ ] Grow the flock: publish attestations to testnet/mainnet for agents participating in cross-instance collaboration (#1459)

## Completed Tasks

- [x] `ReputationScorer.computeScore` with 5-component weighted formula (task 30%, peer 25%, credit 15%, security 20%, activity 10%)
- [x] Trust level thresholds: untrusted / low / medium / high / verified
- [x] Human feedback (+2/-2 score impact) with 10-per-day rate limiting
- [x] `ReputationAttestation.createAttestation` with SHA-256 canonical JSON hash
- [x] On-chain note format `corvid-reputation:{agentId}:{hash}` via `sendTransaction` callback
- [x] `IdentityVerification.setTier` upgrade-only enforcement (silent downgrade block)
- [x] `computeAllIfStale` 5-minute staleness window
