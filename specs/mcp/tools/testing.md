---
spec: tool-handlers.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/coding-tools.test.ts` | Unit | Coding tool handlers: code analysis, symbol search, reference finding |
| `server/__tests__/contacts-tool-handler.test.ts` | Unit | `handleLookupContact` — name lookup, platform+id lookup, not-found case |
| `server/__tests__/check-reputation-tool.test.ts` | Unit | `handleCheckReputation`, `handlePublishAttestation`, `handleVerifyAgentReputation` |
| `server/__tests__/agent-messages.test.ts` | Integration | `handleSendMessage`: delivery, deduplication, depth enforcement |
| `server/__tests__/credits.test.ts` | Unit | `handleCheckCredits`, `handleGrantCredits`, `handleCreditConfig` privilege gating |

Note: most individual handler behaviors are exercised through integration tests in `server/__tests__/api-routes.test.ts` and module-specific tests (e.g., `memory-manager.test.ts` covers memory handler paths end-to-end).

## Manual Testing

- [ ] Send a message from a Discord-session agent to another agent — verify advisory text appears in the tool result and the message is still delivered
- [ ] Send the exact same message twice within 30 seconds — verify second result contains "(duplicate suppressed)"
- [ ] Call `corvid_send_message` with `depth = 3` in context — verify error result "Cannot send message: invocation depth 3 exceeds maximum of 3."
- [ ] Create 100 work tasks in a single day — verify the 101st call returns rate limit error
- [ ] Call `corvid_grant_credits` from an agent without explicit permission — verify the tool is not registered (not visible)
- [ ] Call `corvid_create_work_task` with a session that has no `workTaskService` — verify error result
- [ ] Test `corvid_launch_council` without `processManager` in context — verify error result
- [ ] Create a GitHub PR via `corvid_github_create_pr` — verify agent identity footer is appended to the PR body
- [ ] Restart server via `corvid_restart_server` — verify `server_restart_initiated_at` flag is set in settings; on next call, verify flag is cleared and success is confirmed
- [ ] Call `corvid_web_search` with a valid query — verify Brave API is called and results returned

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `handleSendMessage` from web session source | No cross-channel advisory; no warning logged |
| `handleSendMessage` from Telegram session source | Cross-channel advisory appended; warning logged with sessionSource, sessionId, agentId, targetAgentId |
| `handleSendMessage` duplicate within 30 seconds | Returns success with "(duplicate suppressed)"; dedup key TTL is 30s |
| `handleSendMessage` same message after 30+ seconds | Not deduplicated; delivered as new message |
| `handleCreateWorkTask` with both `project_id` and `project_name` provided | `project_id` takes precedence |
| `handleCreateWorkTask` with no project info and no session | Uses agent's `defaultProjectId` from `WorkTaskService` |
| `handleCreateWorkTask` with `agent_id` provided | Delegates execution and attribution to specified agent |
| `handleSaveMemory` on localnet without mnemonic | Saves without encryption; no error |
| `handleDeleteMemory` with `mode: 'hard'` | Destroys the on-chain ARC-69 ASA; not just soft-archived |
| `handleGitHubCreatePr` with agent that cannot be looked up in DB | Signature footer is empty (fail-open); PR still created |
| `handleCheckWorkStatus` with non-existent task_id | Returns error result with "task not found" message |
| `handleListObservations` with `status: 'pending'` filter | Returns only observations in `pending` status |
| `handleDiscordSendImage` with missing `channel_id` | Returns error result with descriptive message |
| `corvid_restart_server` called twice before actual restart | Second call is idempotent; same flag state |
