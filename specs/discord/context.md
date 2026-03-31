# Discord — Context

## Why This Module Exists

Discord is the primary team communication channel for CorvidLabs. The Discord bridge enables agents to participate in Discord conversations — responding to mentions, managing threads, and executing operator commands. The agent config commands specifically allow hot-swapping agent skills and personas without restarting.

## Architectural Role

Discord is a **channel bridge** — it implements the `ChannelAdapter` interface and translates between Discord's API (slash commands, mentions, threads) and corvid-agent's session model.

## Key Design Decisions

- **Slash commands for config**: `/agent-skill` and `/agent-persona` use Discord's native slash command system for discoverability and validation.
- **Next-session activation**: Config changes take effect on the agent's next session, not the current one. This prevents mid-conversation personality shifts.
- **Thread-based sessions**: Each Discord thread maps to an agent session, keeping conversations isolated.

## Relationship to Other Modules

- **Channels**: Implements `ChannelAdapter`.
- **Process Manager**: Creates agent sessions for Discord interactions.
- **Notifications**: Discord is a notification delivery channel.
- **AlgoChat**: Messages can bridge between Discord and AlgoChat (the two main operator channels).
