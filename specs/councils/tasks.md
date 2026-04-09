---
spec: councils.spec.md
---

## Active Tasks

- [ ] Add council audit log — persist stage transitions and votes to a queryable table for post-hoc review
- [ ] Surface reputation-weighted vote breakdown in the synthesis output so operators can see who swayed the decision
- [ ] Chain continuation after council completion: allow operators to ask follow-up questions to the chairman without re-launching (#1458)
- [ ] Expose council status via AlgoChat `/council` command with live stage updates

## Completed Tasks

- [x] Multi-agent council launch with parallel member session spawning
- [x] Stage pipeline: `responding -> discussing -> reviewing -> synthesizing -> complete`
- [x] Reputation-weighted voting via `evaluateWeightedVote` (Layer 0/1/2 governance tiers)
- [x] `abortCouncil` with partial result aggregation
- [x] On-chain attestation (SHA-256 hash of synthesis) when `onChainMode = 'attestation'`
- [x] Auto-advance watcher with heartbeat polling to prevent stuck councils (#1932)
- [x] Per-agent 10-minute round timeout with Ollama scaling
