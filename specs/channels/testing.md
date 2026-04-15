---
spec: channels.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/notification-channels.test.ts` | Unit | Channel adapter conformance: `sendMessage`, `getStatus` for notification channel implementations |
| `server/__tests__/question-channels.test.ts` | Unit | Question delivery via channel adapters; channel selection logic |
| `server/__tests__/whatsapp-signal-channels.test.ts` | Unit | WhatsApp and Signal channel adapter stubs |

The `ChannelAdapter` interface itself has no dedicated test file — it is a TypeScript interface with no runtime code. Individual adapter implementations are tested in their respective module test files (e.g., `algochat-bridge.test.ts`, discord tests, telegram tests).

## Manual Testing

- [ ] Send a message via the AlgoChat mobile app and verify it arrives in an agent session as a `SessionMessage` with `channelType: 'algochat'` and `direction: 'inbound'`
- [ ] Trigger a notification that sends to Discord and verify the outbound `SessionMessage` has `direction: 'outbound'` and the correct `channelType`
- [ ] Call `getStatus()` on the Discord adapter when the bot token is valid; verify `enabled: true, connected: true`
- [ ] Call `getStatus()` on the Telegram adapter when the bot token is invalid; verify `connected: false` with error details
- [ ] Call `stop()` on a running adapter and then `stop()` again; verify no error is thrown (idempotent)
- [ ] Register an `onMessage` handler on a channel after `start()` has been called; verify no messages during the gap are duplicated

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Adapter receives message with null content | Normalized to empty string; handler receives `content: ''`; no throw |
| Adapter receives message with missing participant ID | Adapter logs warning and drops the message |
| `sendMessage` called before `start()` | Behavior is adapter-specific; most reject the promise; none should crash |
| `start()` called twice | Idempotent; no duplicate listeners or connections |
| `stop()` called twice | Idempotent; no error |
| `getStatus()` called while adapter is mid-reconnect | Returns current state (`connected: false`); no side effects |
| `channelType` property modified after construction | TypeScript `readonly` prevents this at compile time |
| `metadata` field contains unknown keys | Passed through untouched; consumers must not depend on its presence |
