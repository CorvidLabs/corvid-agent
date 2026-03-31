---
spec: service.spec.md
---

## User Stories

- As an agent operator, I want notifications dispatched to multiple channels (Discord, Telegram, Slack, GitHub, AlgoChat, WhatsApp, Signal, WebSocket) so that I am alerted wherever I am
- As a platform administrator, I want per-agent notification channel configuration so that each agent can have independently configured alert destinations
- As an agent operator, I want failed notification deliveries retried automatically so that transient channel outages do not cause missed alerts
- As a team agent, I want to dispatch owner questions to configured channels and receive responses so that I can get human input when I need approval or clarification
- As an agent operator, I want the first response to a question (from any channel) to resolve it so that I do not need to answer on every channel
- As a platform administrator, I want delivery tracking with status (pending, sent, failed), attempt counts, and external references so that I can audit notification reliability

## Acceptance Criteria

- `NotificationService.notify()` persists the notification to `owner_notifications` before any dispatch attempt (persist-first guarantee)
- If a WebSocket broadcast function is set via `setBroadcast()`, every notification is sent via WebSocket regardless of channel configuration
- Only enabled channels for the agent (from `notification_channels`) are dispatched to; per-agent channel config is independent
- Each channel dispatch creates a `notification_deliveries` record tracking status, attempts, errors, and external references
- Channel dispatches are fire-and-forget (async) to avoid blocking the notification creation response
- Failed deliveries are retried every 60 seconds, up to 3 attempts maximum; the retry query joins deliveries, notifications, and channels to reconstruct context
- `start()` is idempotent; calling it when the retry timer is already running is a no-op
- `QuestionDispatcher.dispatch()` sends questions to all enabled channels for the agent and creates `owner_question_dispatches` records for each
- Discord is excluded from question dispatch because webhook-only channels cannot receive responses
- `ResponsePollingService` polls GitHub (issue comments) and Telegram (callback queries and replies) every 15 seconds; AlgoChat responses are handled by bridge inbound routing
- First-responder wins: `markDispatchAnswered` uses atomic `UPDATE ... WHERE status = 'sent'` so only the first handler processes a response
- When a GitHub question response is received, the issue is closed after resolving the question
- Channel-specific configuration is read from `notification_channels.config` JSON with fallback to environment variables
- `sendDiscord` sends via webhook URL, `sendTelegram` via bot API, `sendGitHub` via issue/comment, `sendSlack` via bot API, `sendAlgoChat` via agent messenger, `sendWhatsApp` via Business API, `sendSignal` via REST API

## Constraints

- Each agent can have at most one channel per type (enforced by `UNIQUE(agent_id, channel_type)` constraint)
- Notification levels are `info`, `warn`, `error`, `success`
- Environment variable fallbacks: `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTIFICATION_GITHUB_REPO`, `WHATSAPP_ACCESS_TOKEN`, `SIGNAL_API_URL` (default `http://localhost:8080`), `SIGNAL_SENDER_NUMBER`, `SLACK_BOT_TOKEN`
- Missing channel credentials cause delivery failure with a descriptive error, not a crash
- The `AlgoChat` notification channel requires `setAgentMessenger()` to be called before dispatch

## Out of Scope

- Email notifications
- SMS notifications (WhatsApp and Signal cover mobile messaging)
- Notification preferences UI (managed via API/database directly)
- Notification batching or digest mode
- Push notifications to native mobile apps
- Notification templates or rich formatting beyond plain text
