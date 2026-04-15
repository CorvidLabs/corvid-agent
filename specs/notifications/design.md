---
spec: service.spec.md
sources:
  - server/notifications/service.ts
  - server/notifications/types.ts
  - server/notifications/question-dispatcher.ts
  - server/notifications/response-poller.ts
  - server/notifications/channels/websocket.ts
  - server/notifications/channels/discord.ts
  - server/notifications/channels/telegram.ts
---

## Module Structure

`server/notifications/` is split into three layers:

**Core service layer:**
- `service.ts` — `NotificationService`: persist-first dispatch, delivery tracking, retry mechanism (60s timer, max 3 attempts)
- `types.ts` — `NotificationPayload`, `ChannelSendResult` shared types
- `question-dispatcher.ts` — `QuestionDispatcher`: sends owner questions to configured channels, records dispatch tracking
- `response-poller.ts` — `ResponsePollingService`: polls GitHub and Telegram every 15s for question responses; AlgoChat uses bridge routing instead

**Channel senders (8 notification channels):**
```
channels/websocket.ts   channels/discord.ts   channels/telegram.ts
channels/github.ts      channels/algochat.ts  channels/whatsapp.ts
channels/signal.ts      channels/slack.ts
```

**Question channels (6 channels — Discord excluded):**
```
channels/algochat-question.ts    channels/github-question.ts
channels/telegram-question.ts   channels/whatsapp-question.ts
channels/signal-question.ts     channels/slack-question.ts
```

## Key Classes and Subsystems

### NotificationService
Constructed with a `Database` handle. Key lifecycle methods: `start()` (starts 60s retry timer, idempotent), `stop()`, `setAgentMessenger()` (AlgoChat dispatch), `setBroadcast()` (WebSocket broadcast).

**Persist-first guarantee**: Every `notify()` call inserts into `owner_notifications` before any dispatch attempt. All channel sends use fire-and-forget `.then()/.catch()` to avoid blocking the response. `notification_deliveries` tracks each channel dispatch with status, attempts, and errors.

**Retry logic**: Failed deliveries (attempts < 3) are retried every 60 seconds by joining `notification_deliveries`, `owner_notifications`, and `notification_channels`.

**WebSocket always dispatched**: If a broadcast function is set, WebSocket is dispatched to every notification regardless of channel configuration.

### QuestionDispatcher
Dispatches `OwnerQuestion` objects to all enabled channels for the agent. Discord is explicitly excluded (webhook-only, cannot receive responses). Creates `owner_question_dispatches` records with status `sent` for each channel.

### ResponsePollingService
Polls every 15 seconds:
- **GitHub**: Scans new comments on tracked issues; extracts answer from comment text
- **Telegram**: `getUpdates` with callback queries (inline keyboard) and reply messages

Both paths use `markDispatchAnswered()` with an atomic `UPDATE ... WHERE status = 'sent'` guard to ensure idempotent first-responder resolution. When resolved, all dispatches for the same question are marked `answered` and external resources are cleaned up (GitHub issue closed, Telegram callback answered).

### Channel Architecture
Each channel file exports a single `send*()` function that:
1. Reads config from the `notification_channels.config` JSON blob
2. Falls back to environment variables if not in config
3. Returns `ChannelSendResult` with `success`, optional `error`, and optional `externalRef`

## Configuration Values and Constants

| Env Var | Default | Description |
|---------|---------|-------------|
| `DISCORD_WEBHOOK_URL` | (optional) | Fallback Discord webhook |
| `TELEGRAM_BOT_TOKEN` | (optional) | Fallback Telegram token |
| `TELEGRAM_CHAT_ID` | (optional) | Fallback Telegram chat ID |
| `NOTIFICATION_GITHUB_REPO` | (optional) | Fallback GitHub repo for notifications |
| `WHATSAPP_ACCESS_TOKEN` | (optional) | Fallback WhatsApp token |
| `SIGNAL_API_URL` | `http://localhost:8080` | Signal REST API endpoint |
| `SIGNAL_SENDER_NUMBER` | (optional) | Fallback Signal sender |
| `SLACK_BOT_TOKEN` | (optional) | Fallback Slack token |
| Retry interval | 60 seconds | Failed delivery retry period |
| Max retry attempts | 3 | After 3 attempts, delivery stops retrying |
| Poll interval | 15 seconds | GitHub and Telegram response polling |

## Related Resources

| Resource | Description |
|----------|-------------|
| `owner_notifications` DB table | Persisted notification records |
| `notification_deliveries` DB table | Per-channel delivery tracking (status, attempts, errors) |
| `notification_channels` DB table | Per-agent channel config (one per type per agent) |
| `owner_question_dispatches` DB table | Question dispatch tracking for first-responder resolution |
| `server/process/owner-question-manager.ts` | `OwnerQuestionManager` — resolves pending questions when responses arrive |
| `server/algochat/agent-messenger.ts` | `AgentMessenger` — used by AlgoChat and AlgoChat-question channels |
| `server/github/operations.ts` | `listIssueComments`, `addIssueComment`, `closeIssue` for GitHub polling |
