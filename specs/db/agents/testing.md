---
spec: observations.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/agents.test.ts` | Unit | `createAgent`, `updateAgent`, `deleteAgent`, tenant isolation, partial update, wallet ops |
| `server/__tests__/agent-memories.test.ts` | Unit | `listMemories`, `searchMemories`, FTS5 search, tier derivation, pagination |
| `server/__tests__/agent-blocklist.test.ts` | Unit | Blocklist CRUD, lookup behavior |
| `server/__tests__/agent-messages.test.ts` | Unit | Inter-agent message CRUD |
| `server/__tests__/arc69-library.test.ts` | Unit | `agent_library` CRVLIB operations |

## Manual Testing

- [ ] Create an agent via API; verify it appears in `listAgents` with `algochatEnabled: true`
- [ ] Create an agent then delete it; verify all dependent records (sessions, memories, messages) are also removed
- [ ] Update an agent with only one field changed; verify other fields are unchanged
- [ ] Add a memory with `status=pending`; trigger sync; verify `status` becomes `confirmed` and `txid` is set
- [ ] Search memories with a keyword; verify FTS5 returns correct results ranked by relevance
- [ ] Assign a persona to an agent; start a session; verify persona system prompt is injected

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `createAgent` with explicit `algochatEnabled: false` | Created with `algochatEnabled: false` (override works) |
| `updateAgent` with no changed fields | Returns existing agent without issuing any UPDATE SQL |
| `deleteAgent` when agent has FK references in non-cascade tables | Manual cleanup in transaction before agent row deletion |
| `deleteAgent` for non-existent agent | Returns `false` |
| `getAgent` with wrong tenant ID | Returns `null` (tenant ownership validation) |
| `addAgentFunding` called twice | Balance is additive: 5.0 + 2.5 + 1.0 = 8.5 |
| `setAgentWallet` called twice | Upserts; second call overwrites wallet address and mnemonic |
| `getAgentByWalletAddress` with no match | Returns `null` |
| FTS5 search with special characters (e.g., `"deploy:prod"`) | Safe handling; falls back to LIKE if FTS tokenizer rejects input |
| Observation with `expires_at` in the past | Should be excluded from active observation queries |
| Memory with `status=failed` and non-null `txid` | Edge case: tier should still be `shortterm` (confirmed + txid = longterm) |
