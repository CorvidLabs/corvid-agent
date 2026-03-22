---
module: variants-db
version: 1
status: draft
files:
  - server/db/variants.ts
db_tables:
  - agent_variants
  - agent_variant_assignments
depends_on:
  - specs/db/personas.spec.md
---

# Variants DB

## Purpose

Data-access layer for agent variant profiles — preset combinations of skill bundles and personas that can be applied to agents. A variant is a reusable template: applying it assigns the variant's personas to the agent, and removing it clears those assignments. Agents can have at most one active variant.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listVariants` | `(db: Database)` | `AgentVariant[]` | List all variants, sorted by name ascending |
| `getVariant` | `(db: Database, id: string)` | `AgentVariant \| null` | Fetch a variant by ID. Returns null if not found |
| `createVariant` | `(db: Database, input: CreateVariantInput)` | `AgentVariant` | Create a variant with a generated UUID |
| `updateVariant` | `(db: Database, id: string, input: UpdateVariantInput)` | `AgentVariant \| null` | Partially update a variant. Returns null if not found |
| `deleteVariant` | `(db: Database, id: string)` | `boolean` | Delete a variant. Returns true if a row was deleted |
| `getAgentVariant` | `(db: Database, agentId: string)` | `AgentVariant \| null` | Get the variant currently applied to an agent |
| `getAgentVariantAssignment` | `(db: Database, agentId: string)` | `AgentVariantAssignment \| null` | Get the raw assignment record for an agent |
| `applyVariant` | `(db: Database, agentId: string, variantId: string)` | `boolean` | Apply a variant: removes existing variant, assigns personas, records assignment. Returns false if variant not found |
| `removeVariant` | `(db: Database, agentId: string)` | `boolean` | Remove variant from agent and clear its persona assignments. Returns false if no variant was assigned |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | Types `AgentVariant`, `CreateVariantInput`, `UpdateVariantInput`, and `AgentVariantAssignment` are imported from `shared/types` |

## Invariants

1. **One-to-one assignment**: An agent can have at most one active variant (agent_id is PRIMARY KEY)
2. **Variant reusability**: A variant can be applied to multiple agents
3. **Persona auto-assignment**: Applying a variant assigns all its personas to the agent with sort_order matching array index
4. **Persona cleanup on remove**: Removing a variant un-assigns the personas that were set by the variant
5. **Replace semantics**: Applying a new variant first removes the old variant and its personas
6. **Partial update**: `updateVariant` only modifies fields present in the input
7. **Insert defaults**: Missing fields default to: description `''`, skillBundleIds `[]`, personaIds `[]`, preset `false`
8. **JSON serialization**: `skill_bundle_ids` and `persona_ids` are stored as JSON arrays
9. **Unique name**: Variant names must be unique (UNIQUE constraint)
10. **Cascade deletion**: Deleting a variant cascades to agent_variant_assignments

## Behavioral Examples

### Scenario: Apply variant to agent

- **Given** variant `v-1` with personaIds `['p-1', 'p-2']` and agent `a-1`
- **When** `applyVariant(db, 'a-1', 'v-1')` is called
- **Then** agent `a-1` has variant `v-1` assigned and personas `p-1`, `p-2` assigned

### Scenario: Replace variant

- **Given** agent `a-1` has variant `v-1` (personaIds: `['p-1']`)
- **When** `applyVariant(db, 'a-1', 'v-2')` where v-2 has personaIds `['p-2']`
- **Then** agent has variant `v-2`, persona `p-1` is removed, persona `p-2` is assigned

### Scenario: Remove variant

- **Given** agent `a-1` has variant `v-1` with persona `p-1`
- **When** `removeVariant(db, 'a-1')` is called
- **Then** variant assignment and persona assignment are both cleared

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getVariant` with non-existent ID | Returns `null` |
| `updateVariant` with non-existent ID | Returns `null` |
| `deleteVariant` with non-existent ID | Returns `false` |
| `applyVariant` with non-existent variant ID | Returns `false` |
| `removeVariant` with no variant assigned | Returns `false` |
| `createVariant` with duplicate name | Throws (UNIQUE constraint) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `AgentVariant`, `CreateVariantInput`, `UpdateVariantInput`, `AgentVariantAssignment` |
| `server/db/personas` | `assignPersona`, `unassignPersona` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/variants.ts` | All CRUD and assignment functions |

## Database Tables

### agent_variants

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| name | TEXT | UNIQUE NOT NULL | Display name for the variant |
| description | TEXT | DEFAULT '' | Description of the variant's purpose |
| skill_bundle_ids | TEXT | NOT NULL DEFAULT '[]' | JSON array of skill bundle IDs |
| persona_ids | TEXT | NOT NULL DEFAULT '[]' | JSON array of persona IDs |
| preset | INTEGER | NOT NULL DEFAULT 0 | 1 if this is a built-in preset variant |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | NOT NULL DEFAULT datetime('now') | Last modification timestamp |

### agent_variant_assignments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| agent_id | TEXT | PRIMARY KEY, FK agents(id) ON DELETE CASCADE | Agent with the variant applied |
| variant_id | TEXT | NOT NULL, FK agent_variants(id) ON DELETE CASCADE | Applied variant |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | When the variant was applied |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-22 | corvid-agent | Initial spec |
