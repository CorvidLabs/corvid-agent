---
module: module-name
version: 1
status: draft
files:
  - server/path/to/file.ts
db_tables:
  - table_name
depends_on: []
---

# Module Name

## Purpose

<!-- Plain English: what this module does and why it exists -->

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `example` | `(db: Database, id: string)` | `Thing \| null` | Fetches a thing by ID |

### Exported Types

| Type | Description |
|------|-------------|
| `ExampleType` | Represents a thing |

### Exported Classes

| Class | Description |
|-------|-------------|
| `ExampleService` | Manages things |

#### ExampleService Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `doThing` | `(id: string)` | `Promise<void>` | Does the thing |

## Invariants

<!-- Rules that must ALWAYS hold. Use numbered list. -->

1. Example invariant that must always be true

## Behavioral Examples

### Scenario: Example scenario

- **Given** some precondition
- **When** an action occurs
- **Then** this result is expected

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Thing not found | Returns null |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/other.ts` | `getOther()` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/things.ts` | All exported functions |

## Database Tables

### table_name

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Unique identifier |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `EXAMPLE_VAR` | `100` | Controls example behavior |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| YYYY-MM-DD | name | Initial spec |
