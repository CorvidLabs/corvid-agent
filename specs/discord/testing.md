---
spec: bridge.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/discord-bridge-mentions.test.ts` | Unit | @mention detection, mention session creation, rate limiting |
| `server/__tests__/discord-bridge-threads.test.ts` | Integration | Thread creation, archiving, stale thread detection |
| `server/__tests__/discord-mention-sessions.test.ts` | Unit | Mention session DB operations |
| `server/__tests__/discord-public-mode.test.ts` | Unit | Public channel mode behavior |
| `server/__tests__/discord-guild-api.test.ts` | Unit | Guild member/role lookup |
| `server/__tests__/discord-embeds-validation.test.ts` | Unit | Embed builder output validation |
| `server/__tests__/discord-agent-config-commands.test.ts` | Unit | /agent-skill and /agent-persona commands |
| `server/__tests__/discord-commands-autocomplete.test.ts` | Unit | Autocomplete handler with TTL cache |
| `server/__tests__/discord-commands-components.test.ts` | Unit | Button interaction handlers |
| `server/__tests__/discord-commands-info.test.ts` | Unit | /status, /agents, /dashboard, /help commands |
| `server/__tests__/discord-commands-moderation.test.ts` | Unit | /mute, /unmute, /council commands |
| `server/__tests__/discord-image-attachments.test.ts` | Unit | Image attachment handling |
| `server/__tests__/discord-tool-handlers.test.ts` | Unit | Discord-specific MCP tool handlers |

## Manual Testing

- [ ] Start bot with valid `DISCORD_BOT_TOKEN`; verify it connects and shows online presence
- [ ] Send a regular channel message (no @mention): verify bot does NOT respond
- [ ] @mention the bot in a channel: verify it creates a thread and starts a session
- [ ] Use `/session` command: verify thread created with selected agent
- [ ] Use `/message` command: verify session starts with read-only tools only
- [ ] Use `/status` command: verify active sessions and uptime shown
- [ ] Use `/agents` command: verify all registered agents listed
- [ ] Mute a user via `/mute`: verify they cannot trigger sessions; verify persists across restart
- [ ] Send a very long response (>2000 chars): verify smart-split at paragraph/code block boundaries
- [ ] Stop gateway WebSocket: verify reconnection with exponential backoff
- [ ] Leave a thread inactive for >stale threshold: verify auto-archival

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Bot receives message from muted user | Message silently ignored |
| User exceeds rate limit tier | Rate limit error message returned; session not started |
| @mention in a thread (not channel) | Handled by thread message handler, not channel mention handler |
| Gateway `INVALID_SESSION` opcode | Reconnect with fresh identify (not resume) |
| Gateway `RECONNECT` opcode | Reconnect and resume with existing session ID + sequence |
| `sendMessage` content > 2000 chars | Smart-split at nearest paragraph/sentence/word boundary |
| `sendMessage` content with unclosed code block | Code block preserved intact in split |
| Slash command registration fails | Logged as error; bridge continues without commands |
| Thread archived mid-session | Session continues; next message unarchives thread |
| `clearAutocompleteCache()` not called between tests | Autocomplete tests may return stale cached results |
| Prompt injection detected in user message | Message blocked before forwarding to agent |
| Discord REST returns 429 (rate limited) | Retry after `retry_after` header; best-effort for reactions |
