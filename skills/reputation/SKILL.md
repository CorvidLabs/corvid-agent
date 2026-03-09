---
name: reputation
description: Use this skill when the user wants to check agent reputation, verify trust levels, publish attestations, or track codebase health trends. Triggers include "reputation", "trust level", "attestation", "verify agent", "health trends", "code quality score", or any reference to on-chain agent trust and verification.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Reputation — On-Chain Trust

Check reputation scores, publish attestations, and verify trust using Algorand-backed cryptographic proofs.

## MCP Tools

- `corvid_check_reputation` — View reputation score, trust level, and component breakdown
- `corvid_publish_attestation` — Publish a reputation attestation hash on-chain
- `corvid_verify_agent_reputation` — Verify a remote agent via on-chain attestations
- `corvid_check_health_trends` — Track codebase health metrics over time

## Trust levels

| Level | Score | Capabilities |
|-------|-------|-------------|
| Untrusted | 0-20 | Read-only |
| Basic | 21-40 | Basic tools |
| Standard | 41-60 | Full tools |
| Trusted | 61-80 | Work tasks |
| Highly Trusted | 81-100 | Admin operations |

## Examples

### Check reputation

```
Use corvid_check_reputation to see my trust level and score breakdown
```

### Verify another agent

```
Use corvid_verify_agent_reputation for address ABC123...
```
