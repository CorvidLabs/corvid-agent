---
spec: bridge.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/algochat-bridge.test.ts` | Integration | Bridge construction, message routing, session lifecycle, PSK contact operations |
| `server/__tests__/algochat-init.test.ts` | Integration | `initAlgoChat` and `wirePostInit` wiring, service dependency injection |
| `server/__tests__/algochat-message-router.test.ts` | Unit | Owner vs. agent vs. PSK vs. unknown address routing logic |
| `server/__tests__/algochat-messages.test.ts` | Unit | Group message reassembly, chunk buffering, stale chunk pruning |
| `server/__tests__/algochat-response-formatter.test.ts` | Unit | Response truncation, formatting for on-chain delivery |
| `server/__tests__/algochat-command-handler.test.ts` | Unit | `[CMD]` prefix parsing, command dispatch, work command routing |
| `server/__tests__/algochat-subscription-manager.test.ts` | Unit | Session event subscriptions, on-chain reply forwarding |
| `server/__tests__/algochat-discovery-service.test.ts` | Unit | Agent directory lookup, discovery cache |
| `server/__tests__/algochat-approval-format.test.ts` | Unit | Approval request formatting, YES/NO response parsing |
| `server/__tests__/algochat-config.test.ts` | Unit | Config loading, network selection, owner address parsing |
| `server/__tests__/spec-invariants/algochat.spec-invariants.test.ts` | Spec invariant | Spec-level behavioral invariants for the full bridge module |

## Manual Testing

- [ ] Start `algokit localnet start`, configure `ALGORAND_NETWORK=localnet`, start the server, and verify `getStatus()` returns a connected wallet address
- [ ] Create a PSK contact via the API, scan the QR code with the AlgoChat mobile app, and confirm the discovery poller finds and records the mobile address
- [ ] Send a message from the mobile app to the agent; confirm a session is created and the response arrives on-chain
- [ ] Send a multi-part group message (`[GRP:1/3]`, `[GRP:2/3]`, `[GRP:3/3]`) and confirm it is reassembled before being processed
- [ ] Send a message from an unknown (non-owner) address and confirm the bridge sends an on-chain "owner-only" error reply
- [ ] Send "YES" in response to a pending approval request; confirm the approval is resolved and the blocked tool call proceeds
- [ ] Rename and cancel a PSK contact via the API; confirm the PSKManager for that contact is torn down

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Duplicate transaction ID arrives twice | Second message silently dropped by DedupService |
| Dedup store at 5000 entries | Entries older than 24h are pruned; store size stays bounded |
| Group message chunk arrives after 5-minute stale window | Stale buffer is pruned; the late chunk is treated as a new standalone message |
| Message from a known agent address (in AgentDirectory) | Routed to AgentMessenger, not spawning a new user session |
| PSK contact discovery poller finds no matching transaction | Continues polling at next interval; no error |
| Session start fails for an inbound AlgoChat message | Error sent on-chain to participant; no dangling session |
| `cancelPSKContact` called with unknown ID | Returns `false`; no side effects |
| On-chain response contains prompt injection pattern | Message blocked; audit log entry written; on-chain error reply sent |
| Mobile app sends device name envelope `{m: text, d: device}` | Device name is extracted and passed to the agent as context |
| Localnet wallet has insufficient ALGO for reply transaction | Auto-funding triggered via `agentWalletService` before sending reply |
