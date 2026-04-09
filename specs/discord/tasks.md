---
spec: bridge.spec.md
---

## Active Tasks

- [ ] Dual-mode view for Discord comms in the dashboard: feed vs. network graph of message flow (#1623)
- [ ] Add image attachment support for agent responses posted to Discord threads
- [ ] Expose `/agent-config` slash command for self-service operator configuration (#1490)
- [ ] Improve thread recovery after bot restart — validate recovered thread IDs against Discord API before resuming

## Completed Tasks

- [x] Raw WebSocket Discord gateway connection (no discord.js dependency)
- [x] Thread-based session lifecycle with `ThreadSessionMap` persistence across restarts
- [x] Slash commands: `/message`, `/session`, `/agent-skill`, `/agent-persona`
- [x] Permission system: OWNER > ADMIN > MEMBER with per-interaction resolution
- [x] Long response chunking at Discord embed 4096-character limit
- [x] Buddy session rounds posted as colored Discord embeds
- [x] ContactLinker mapping Discord user IDs to agent contact records
