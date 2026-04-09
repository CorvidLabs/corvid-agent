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

Data-access and prompt-composition layer for composable agent personas. Personas are standalone reusable entities that can be assigned to multiple agents via a many-to-many junction table (`agent_persona_assignments`). An agent can have zero or more personas, which are merged at prompt composition time.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listPersonas` | `(db: Database)` | `Persona[]` | List all personas, sorted by name ascending |
| `getPersona` | `(db: Database, id: string)` | `Persona \| null` | Fetch a persona by its ID. Returns null if not found |
| `createPersona` | `(db: Database, input: CreatePersonaInput)` | `Persona` | Create a standalone persona with a generated UUID |
| `updatePersona` | `(db: Database, id: string, input: UpdatePersonaInput)` | `Persona \| null` | Partially update a persona. Returns null if not found |
| `deletePersona` | `(db: Database, id: string)` | `boolean` | Delete a persona. Returns true if a row was deleted |
| `getAgentPersonas` | `(db: Database, agentId: string)` | `Persona[]` | Get all personas assigned to an agent, ordered by sort_order ASC |
| `assignPersona` | `(db: Database, agentId: string, personaId: string, sortOrder?: number)` | `boolean` | Assign a persona to an agent. Returns false if persona doesn't exist |
| `unassignPersona` | `(db: Database, agentId: string, personaId: string)` | `boolean` | Remove a persona assignment. Returns true if assignment was removed |
| `composePersonaPrompt` | `(personas: Persona \| Persona[] \| null)` | `string` | Compose a system prompt section from one or more personas. Returns empty string if null or empty |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | Types `Persona`, `CreatePersonaInput`, `UpdatePersonaInput`, and `PersonaArchetype` are imported from `shared/types` |

## Invariants

1. **Many-to-many relationship**: An agent can have 0..n personas, and a persona can be assigned to 0..n agents
2. **Persona reusability**: Personas are standalone entities with their own UUIDs, not bound to a single agent
3. **Sort order**: Assigned personas are ordered by `sort_order` ASC when retrieved
4. **Partial update**: `updatePersona` only modifies fields present in the input; omitted fields retain their current values
5. **Insert defaults**: When creating a new persona, missing fields default to: archetype `'custom'`, traits `[]`, voiceGuidelines `''`, background `''`, exampleMessages `[]`
6. **JSON serialization**: `traits` and `exampleMessages` are stored as JSON arrays and parsed on read
7. **Timestamp auto-update**: Every update sets `updated_at = datetime('now')`
8. **Prompt composition — single**: A single persona composes sections in order: archetype (if not custom), traits, background, voice guidelines, example messages
9. **Prompt composition — multiple**: Multiple personas merge: first non-custom archetype, deduplicated traits union, concatenated backgrounds, concatenated voice guidelines, concatenated example messages
10. **Empty prompt**: `composePersonaPrompt(null)` and `composePersonaPrompt([])` return `''`
11. **Custom archetype suppression**: If archetype is `'custom'`, the archetype line is omitted from the composed prompt
12. **Cascade deletion — agent**: Assignments cascade when agent is deleted (persona itself persists)
13. **Cascade deletion — persona**: Assignments cascade when persona is deleted

## Behavioral Examples

### Scenario: Create a standalone persona

- **Given** no personas exist
- **When** `createPersona(db, { name: 'iOS Expert', archetype: 'technical', traits: ['precise'] })` is called
- **Then** a new persona row is inserted with a generated UUID

### Scenario: Assign persona to agent

- **Given** persona `p-1` and agent `a-1` exist
- **When** `assignPersona(db, 'a-1', 'p-1', 0)` is called
- **Then** a junction row is created and `getAgentPersonas(db, 'a-1')` returns `[p-1]`

### Scenario: Multiple personas compose merged prompt

- **Given** agent `a-1` has two personas: p1 (archetype: technical, traits: ['precise']) and p2 (archetype: custom, traits: ['friendly', 'precise'])
- **When** `composePersonaPrompt([p1, p2])` is called
- **Then** returns prompt with archetype `technical`, traits `precise, friendly` (deduplicated)

### Scenario: Reuse persona across agents

- **Given** persona `p-1` exists
- **When** `assignPersona(db, 'a-1', 'p-1')` and `assignPersona(db, 'a-2', 'p-1')` are called
- **Then** both agents list `p-1` in their assigned personas

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getPersona` with non-existent ID | Returns `null` |
| `updatePersona` with non-existent ID | Returns `null` |
| `deletePersona` with non-existent ID | Returns `false` |
| `assignPersona` with non-existent persona ID | Returns `false` |
| `unassignPersona` with non-existent assignment | Returns `false` |
| `composePersonaPrompt(null)` | Returns `''` |
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
| `server/process/session-config-resolver.ts` | `getAgentPersonas`, `composePersonaPrompt` |
| `server/a2a/agent-card.ts` | `getAgentPersonas` |

## Database Tables

### personas

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| name | TEXT | NOT NULL | Display name for the persona |
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
| sort_order | INTEGER | DEFAULT 0 | Order in which personas are composed (lower = first) |
| | | PRIMARY KEY (agent_id, persona_id) | Composite primary key prevents duplicate assignments |

**Indexes:** `idx_agent_persona_assignments_agent` on `agent_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-22 | corvid-agent | v2: Many-to-many composable personas (#987) |
