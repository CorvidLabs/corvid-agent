---
module: discord-agent-config-commands
version: 1
status: draft
files:
  - server/discord/command-handlers/agent-config-commands.ts
depends_on:
  - specs/discord/bridge.spec.md
  - specs/db/migrations.spec.md
---

# Discord Agent Config Commands

## Purpose

Handles the Discord `/agent-skill` and `/agent-persona` slash commands, which
allow operators and owners to hot-swap skill bundles and personas assigned to
agents. Changes take effect on the agent's **next session** — existing sessions
are unaffected.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleAgentSkillCommand` | `(ctx: InteractionContext, interaction: ChatInputCommandInteraction, permLevel: number)` | `Promise<void>` | Handles `/agent-skill add\|remove\|list` — assigns, unassigns, or lists skill bundles for an agent |
| `handleAgentPersonaCommand` | `(ctx: InteractionContext, interaction: ChatInputCommandInteraction, permLevel: number)` | `Promise<void>` | Handles `/agent-persona add\|remove\|list` — assigns, unassigns, or lists personas for an agent |

## Invariants

1. Both commands require `PermissionLevel.ADMIN` — enforced by the `COMMAND_HANDLERS` dispatcher middleware via `minPermission: PermissionLevel.ADMIN` before the handler runs. Handlers do not repeat this check.
2. Agent name matching is case-insensitive and strips model suffixes like ` (claude-opus-4-6)`.
3. Skill bundle name matching strips autocomplete suffixes (` — description`) and is case-insensitive.
4. Persona name matching strips archetype suffixes (` (archetype)`) and is case-insensitive.
5. On successful add/remove, the response embed shows the agent's complete updated configuration.
6. The `list` subcommand is available to any admin — it does not mutate state.
7. Changes are persisted immediately to the database; the running agent process is not restarted.

## Behavioral Examples

### Scenario: Add a skill bundle

- **Given** an admin runs `/agent-skill add agent:CorvidAgent skill:WebSearch`
- **When** `handleAgentSkillCommand` is called
- **Then** assigns the bundle, responds with a green embed showing the agent's updated skill list and "Changes take effect on next session" footer

### Scenario: Remove a skill bundle not assigned

- **Given** the bundle exists but is not assigned to the agent
- **When** `/agent-skill remove` is called
- **Then** responds with plain text: "Skill bundle \"{name}\" was not assigned to {agent}."

### Scenario: List personas — none assigned

- **Given** no personas are assigned to the agent
- **When** `/agent-persona list` is called
- **Then** responds with a yellow embed: "No personas assigned."

### Scenario: Insufficient permissions

- **Given** a user with permission level below ADMIN
- **When** either command is called via the dispatcher
- **Then** the `handleInteraction` middleware rejects with "You do not have permission to use this command." before the handler runs.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `permLevel < ADMIN` | Rejected by dispatcher middleware before handler runs |
| Missing `agent` option | Responds with "Please specify an agent." |
| No agents configured | Responds with "No agents configured." |
| Agent name not found | Lists available agent names |
| Missing `skill`/`persona` option on add/remove | Responds with "Please specify a skill bundle/persona." |
| Skill bundle not found | Lists available bundle names |
| Persona not found | Lists available persona names |
| `assignBundle` returns false | Responds with failure message |
| `assignPersona` returns false | Responds with failure message |
| Bundle not assigned on remove | Responds with not-assigned message |
| Persona not assigned on remove | Responds with not-assigned message |
| Unknown subcommand | Responds with "Unknown subcommand: {name}" |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/discord/commands` | `InteractionContext` type |
| `server/discord/types` | `PermissionLevel` |
| `server/db/agents` | `listAgents` |
| `server/db/skill-bundles` | `listBundles`, `getAgentBundles`, `assignBundle`, `unassignBundle` |
| `server/db/personas` | `listPersonas`, `getAgentPersonas`, `assignPersona`, `unassignPersona` |
| `server/discord/embeds` | `respondToInteraction`, `respondToInteractionEmbed` |
| `server/lib/logger` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/commands.ts` | Command dispatch routing for `/agent-skill` and `/agent-persona` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec — closes #989 |
| 2026-04-03 | corvid-agent | v2: Permission check moved to dispatcher middleware (minPermission on COMMAND_HANDLERS). Handlers no longer check permLevel at entry. Closes #1581 |
