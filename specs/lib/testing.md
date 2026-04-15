---
spec: communication-tiers.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| (no dedicated test file identified) | — | Logic is exercised indirectly through messaging and process tests |

## Manual Testing

- [ ] Call `checkCommunicationTier('corvidagent', 'magpie')`; verify `null` is returned (top → bottom allowed)
- [ ] Call `checkCommunicationTier('magpie', 'corvidagent')`; verify a descriptive error string is returned (bottom → top blocked)
- [ ] Call `getCommunicationTier('unknown-agent-xyz')`; verify `'bottom'` is returned (conservative default)
- [ ] Call `getCommunicationTier('ROOK')` (uppercase); verify tier is found via case-insensitive lookup
- [ ] Call `getTierMessageLimits('top')`; verify limits are higher than `getTierMessageLimits('bottom')`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Unknown agent on both sides | Both default to `'bottom'`; same-tier messaging allowed; `checkCommunicationTier` returns `null` |
| Agent name with mixed casing | Matched case-insensitively; tier correctly resolved |
| Top-tier agent messaging top-tier agent | Allowed (same tier is always allowed at any level) |
| Mid-tier agent messaging top-tier agent | Blocked; error string includes both names and tiers |
| Bottom-tier agent messaging mid-tier agent | Blocked; error string includes both names and tiers |
| `getTierMessageLimits('bottom')` vs `('mid')` vs `('top')` | Limits increase monotonically with tier rank |