---
spec: bridge.spec.md
---

## User Stories

- As an agent operator, I want to interact with agents via Slack messages so that I can manage agent sessions from my team's workspace
- As a platform administrator, I want Slack request signatures verified with HMAC SHA-256 so that only genuine Slack events are processed
- As an agent operator, I want threaded replies so that agent responses appear in the context of my original message
- As a platform administrator, I want to restrict which Slack users can access the bot so that unauthorized users cannot interact with agents
- As an agent operator, I want to mention the bot with `@agent` to start a conversation so that I can use natural Slack interaction patterns
- As a platform administrator, I want event deduplication so that Slack retries do not trigger duplicate agent sessions

## Acceptance Criteria

- `SlackBridge` handles incoming events via `handleEventRequest(req: Request)` using the Slack Events API (webhook-based, not Socket Mode)
- Every incoming request is verified using HMAC SHA-256 with the signing secret; the signature base string is `v0:{timestamp}:{rawBody}`; requests with missing or invalid signatures receive HTTP 401
- Replay protection rejects requests with timestamps more than 300 seconds from current time
- Signature comparison uses constant-time byte-by-byte XOR to prevent timing attacks
- URL verification requests (`type: 'url_verification'`) are responded to with the `challenge` value and HTTP 200
- Event callbacks are processed asynchronously; the HTTP response (`{ ok: true }`) is sent immediately within Slack's 3-second deadline
- Messages with a `bot_id` field or any `subtype` are silently ignored to prevent echo loops
- Events are deduplicated by `{channel}:{ts}` key; the dedup set is cleared every 5 minutes
- If `config.channelId` is set, only messages from that channel are processed
- If `config.allowedUserIds` is non-empty, only those user IDs can interact; unauthorized users receive `"Unauthorized."` in-thread reply
- Per-user rate limiting enforces 10 messages per 60-second sliding window
- Session-per-user mapping: each Slack user ID maps to at most one active session (in-memory `userSessions` Map)
- Response debouncing buffers session events for 1500ms before sending to Slack
- Long responses are chunked at 4000 characters (Slack block text limit)
- Responses are sent as threaded messages using `thread_ts`
- Both `message` and `app_mention` event types are processed; all others are silently ignored
- `sendMessage(channelId, content, threadTs?)` posts via the Slack Web API (`chat.postMessage`)
- `start()` is idempotent and starts the event cleanup timer; `stop()` clears it

## Constraints

- Requires `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `SLACK_CHANNEL_ID` environment variables
- `SLACK_ALLOWED_USERS` is optional; comma-separated list of allowed Slack user IDs; empty means allow all
- Agent selection uses the first agent from `listAgents` with its default project
- Slack Web API responses are checked for `ok: false` and errors are logged with the Slack error code

## Out of Scope

- Slack Socket Mode (only Events API webhook is supported)
- Slack interactive components (buttons, modals, block kit interactions) for general use
- Slack file upload or sharing
- Multi-workspace support (single workspace per bridge instance)
- Slack workflow builder integration
- Home tab or app surface customization
