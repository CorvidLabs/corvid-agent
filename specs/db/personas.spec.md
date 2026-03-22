---
module: personas-db
version: 2
status: draft
files:
  - server/db/personas.ts
db_tables:
  - personas
  - agent_persona_assignments
depends_on: []
---

# Personas DB

## Purpose

Data-access and prompt-composition layer for composable agent personas. Provides CRUD operations on the standalone `personas` table, many-to-many assignment via `agent_persona_assignments`, and a function to compile multiple persona fields into a merged system prompt section.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listPersonas` | `(db: Database)` | `Persona[]` | List all personas ordered by name |
| `getPersona` | `(db: Database, personaId: string)` | `Persona \| null` | Fetch a persona by its own ID. Returns null if not found |
| `createPersona` | `(db: Database, input: CreatePersonaInput)` | `Persona` | Create a standalone persona with a generated UUID |
| `updatePersona` | `(db: Database, personaId: string, input: UpdatePersonaInput)` | `Persona \| null` | Update a persona. Only provided fields are changed. Returns null if not found |
| `deletePersona` | `(db: Database, personaId: string)` | `boolean` | Delete a persona. Returns true if a row was deleted |
| `getAgentPersonas` | `(db: Database, agentId: string)` | `Persona[]` | Get all personas assigned to an agent, ordered by sort_order |
| `assignPersona` | `(db: Database, agentId: string, personaId: string, sortOrder?: number)` | `boolean` | Assign a persona to an agent. Returns false if persona not found |
| `unassignPersona` | `(db: Database, agentId: string, personaId: string)` | `boolean` | Remove a persona assignment. Returns true if assignment was removed |
| `composePersonaPrompt` | `(personas: Persona[])` | `string` | Compose a merged system prompt from multiple personas. Returns empty string for empty array |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | Types `Persona`, `CreatePersonaInput`, `UpdatePersonaInput`, and `PersonaArchetype` are imported from `shared/types` |

## Invariants

1. **Standalone personas**: Personas exist independently of agents and can be shared (many-to-many)
2. **Partial update**: `updatePersona` only modifies fields present in the input; omitted fields retain their current values
3. **Insert defaults**: When creating a persona, missing fields default to: archetype `'custom'`, traits `[]`, voiceGuidelines `''`, background `''`, exampleMessages `[]`
4. **JSON serialization**: `traits` and `exampleMessages` are stored as JSON arrays and parsed on read
5. **Timestamp auto-update**: Every update sets `updated_at = datetime('now')`
6. **Prompt merge order**: When composing from multiple personas: traits are unioned (deduplicated), voice guidelines concatenated, backgrounds concatenated, example messages concatenated
7. **Archetype selection**: Uses the first non-custom archetype found (by sort_order)
8. **Empty prompt for empty array**: `composePersonaPrompt([])` returns `''`
9. **Custom archetype suppression**: If all personas have archetype `'custom'`, the archetype line is omitted
10. **Cascade deletion**: Foreign keys ensure assignments are deleted when either agent or persona is deleted

## Behavioral Examples

### Scenario: Create and assign a persona

- **Given** a persona `p1` with archetype `friendly` and traits `['helpful']`
- **When** `assignPersona(db, agentId, p1.id)` is called
- **Then** the agent has one assigned persona accessible via `getAgentPersonas`

### Scenario: Merge multiple personas

- **Given** agent has personas P1 (archetype: custom, traits: [precise]) and P2 (archetype: technical, traits: [precise, creative])
- **When** `composePersonaPrompt([p1, p2])` is called
- **Then** traits are `precise, creative` (deduplicated), archetype is `technical` (first non-custom)

### Scenario: Delete a persona

- **Given** persona `p1` is assigned to agents A1 and A2
- **When** `deletePersona(db, p1.id)` is called
- **Then** persona is deleted and assignments cascade-delete from both agents

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getPersona` with non-existent ID | Returns `null` |
| `updatePersona` with non-existent ID | Returns `null` |
| `deletePersona` with non-existent ID | Returns `false` |
| `assignPersona` with non-existent persona | Returns `false` |
| `unassignPersona` with no matching assignment | Returns `false` |
| `composePersonaPrompt([])` | Returns `''` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `Persona`, `CreatePersonaInput`, `UpdatePersonaInput`, `PersonaArchetype` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/personas.ts` | `listPersonas`, `getPersona`, `createPersona`, `updatePersona`, `deletePersona`, `getAgentPersonas`, `assignPersona`, `unassignPersona` |
| `server/process/session-config-resolver.ts` | `getAgentPersonas`, `composePersonaPrompt` (for system prompt injection) |
| `server/a2a/agent-card.ts` | `getAgentPersonas` (for agent card metadata) |

## Database Tables

### personas

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique persona identifier (UUID) |
| name | TEXT | NOT NULL | Human-readable persona name |
| archetype | TEXT | DEFAULT 'custom' | Persona archetype: custom, professional, friendly, technical, creative, formal |
| traits | TEXT | NOT NULL DEFAULT '[]' | JSON array of personality trait strings |
| voice_guidelines | TEXT | DEFAULT '' | Free-text guidelines for communication style |
| background | TEXT | DEFAULT '' | Free-text persona background/context |
| example_messages | TEXT | DEFAULT '[]' | JSON array of example message strings to match tone |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

### agent_persona_assignments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Owning agent |
| persona_id | TEXT | NOT NULL, FK personas(id) ON DELETE CASCADE | Assigned persona |
| sort_order | INTEGER | DEFAULT 0 | Order for persona stacking (lower = higher priority) |
| | | PRIMARY KEY (agent_id, persona_id) | Composite primary key |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-22 | corvid-agent | v2: Composable personas (many-to-many, stackable) — #987 |
