---
module: personas-db
version: 1
status: draft
files:
  - server/db/personas.ts
db_tables:
  - agent_personas
depends_on: []
---

# Personas DB

## Purpose

Data-access and prompt-composition layer for agent personas. Provides CRUD operations on the `agent_personas` table and a function to compile persona fields into a system prompt section that shapes the agent's communication style and personality.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getPersona` | `(db: Database, agentId: string)` | `AgentPersona \| null` | Fetch the persona for an agent. Returns null if no persona is configured |
| `upsertPersona` | `(db: Database, agentId: string, input: UpsertPersonaInput)` | `AgentPersona` | Insert or update a persona. On update, only provided fields are changed. On insert, missing fields get defaults |
| `deletePersona` | `(db: Database, agentId: string)` | `boolean` | Delete an agent's persona. Returns true if a row was deleted |
| `composePersonaPrompt` | `(persona: AgentPersona \| null)` | `string` | Compose a system prompt section from persona fields. Returns empty string if persona is null |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | No types exported from this module. Types `AgentPersona`, `UpsertPersonaInput`, and `PersonaArchetype` are imported from `shared/types` |

## Invariants

1. **One persona per agent**: The `agent_id` column is the primary key; each agent has at most one persona
2. **Partial update**: `upsertPersona` only modifies fields present in the input; omitted fields retain their current values
3. **Insert defaults**: When inserting a new persona, missing fields default to: archetype `'custom'`, traits `[]`, voiceGuidelines `''`, background `''`, exampleMessages `[]`
4. **JSON serialization**: `traits` and `exampleMessages` are stored as JSON arrays and parsed on read
5. **Timestamp auto-update**: Every update sets `updated_at = datetime('now')`
6. **Prompt composition order**: The composed prompt includes sections in order: archetype (if not custom), traits, background, voice guidelines, example messages
7. **Empty prompt for null persona**: `composePersonaPrompt(null)` returns `''`
8. **Custom archetype suppression**: If archetype is `'custom'`, the archetype line is omitted from the composed prompt
9. **Cascade deletion**: The foreign key `REFERENCES agents(id) ON DELETE CASCADE` ensures persona is deleted when the agent is deleted

## Behavioral Examples

### Scenario: Create a new persona

- **Given** agent `agent-1` has no persona
- **When** `upsertPersona(db, 'agent-1', { archetype: 'friendly', traits: ['helpful', 'witty'] })` is called
- **Then** a new row is inserted with archetype `friendly`, traits `["helpful","witty"]`, and defaults for other fields

### Scenario: Partial update of existing persona

- **Given** agent `agent-1` has a persona with archetype `friendly` and background `''`
- **When** `upsertPersona(db, 'agent-1', { background: 'Expert in distributed systems' })` is called
- **Then** only `background` and `updated_at` are updated; archetype remains `friendly`

### Scenario: Compose prompt with full persona

- **Given** a persona with archetype `technical`, traits `['precise', 'thorough']`, background `'Senior engineer'`, voiceGuidelines `'Use clear language'`, exampleMessages `['Let me analyze that.']`
- **When** `composePersonaPrompt(persona)` is called
- **Then** returns a multi-line string with sections: `## Persona`, `Archetype: technical`, `Personality traits: precise, thorough`, `Background: Senior engineer`, `Communication style: Use clear language`, `Example messages...`

### Scenario: Compose prompt for custom archetype

- **Given** a persona with archetype `custom` and traits `['calm']`
- **When** `composePersonaPrompt(persona)` is called
- **Then** the archetype line is omitted; output includes `## Persona` and `Personality traits: calm`

### Scenario: Delete a persona

- **Given** agent `agent-1` has a persona
- **When** `deletePersona(db, 'agent-1')` is called
- **Then** the persona row is deleted and `true` is returned

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getPersona` with no persona set | Returns `null` |
| `deletePersona` with no persona set | Returns `false` |
| `upsertPersona` with empty input on existing persona | No fields updated (no-op except `updated_at` is not changed since `fields.length` is 0) |
| `composePersonaPrompt(null)` | Returns `''` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `AgentPersona`, `UpsertPersonaInput`, `PersonaArchetype` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/personas.ts` | `getPersona`, `upsertPersona`, `deletePersona` |
| `server/process/manager.ts` | `getPersona`, `composePersonaPrompt` (for system prompt injection) |
| `server/a2a/agent-card.ts` | `getPersona` (for agent card metadata) |

## Database Tables

### agent_personas

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| agent_id | TEXT | PRIMARY KEY, FK agents(id) ON DELETE CASCADE | Owning agent (one persona per agent) |
| archetype | TEXT | DEFAULT 'custom' | Persona archetype: custom, professional, friendly, technical, creative, formal |
| traits | TEXT | NOT NULL DEFAULT '[]' | JSON array of personality trait strings |
| voice_guidelines | TEXT | DEFAULT '' | Free-text guidelines for communication style |
| background | TEXT | DEFAULT '' | Free-text persona background/context |
| example_messages | TEXT | DEFAULT '[]' | JSON array of example message strings to match tone |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
