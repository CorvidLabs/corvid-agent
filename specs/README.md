# Module Specifications

Structured markdown specs are the **source of truth** for what each module in corvid-agent should do. They exist so that:

1. **The owner** can define and review module behavior without reading TypeScript
2. **Agents** can validate their changes against a formal contract
3. **Correctness** can be checked automatically via `bun run spec:check`

## Reading a Spec

Each `.spec.md` file has two parts:

### YAML Frontmatter

```yaml
---
module: module-name
version: 1
status: draft | active | deprecated
files:
  - server/path/to/file.ts
db_tables:
  - table_name
depends_on:
  - specs/other/module.spec.md
---
```

- **module**: Human-readable identifier
- **version**: Increment when the spec changes materially
- **status**: `draft` (untested), `active` (validated), `deprecated` (superseded)
- **files**: Source files this spec covers
- **db_tables**: Database tables this module reads/writes
- **depends_on**: Other specs this module requires

### Markdown Sections

| Section | What it contains |
|---------|-----------------|
| **Purpose** | Plain English: what this module does and why it exists |
| **Public API** | Tables of exported functions, classes, types with signatures |
| **Invariants** | Rules that must ALWAYS hold (state machines, ordering, uniqueness) |
| **Behavioral Examples** | Given/When/Then scenarios |
| **Error Cases** | Table of error conditions and expected behavior |
| **Dependencies** | What this module consumes and what consumes it |
| **Database Tables** | Column/type/constraint tables |
| **Configuration** | Environment variables with defaults |
| **Change Log** | Date/author/change history |

## Creating a New Spec

1. Copy `_template.spec.md` to the appropriate subdirectory
2. Fill in the YAML frontmatter with the correct files and tables
3. Write each required section
4. Run `bun run spec:check` to validate structure and API coverage
5. Set status to `active` once validated

## How Agents Use Specs

Before modifying any file listed in a spec's `files:` frontmatter:
1. Read the corresponding spec
2. Understand its invariants
3. After modifying, run `bun run spec:check`
4. If your change violates a spec invariant, update the spec first (add a Change Log entry)

**Specs take precedence over code comments.** If code contradicts the spec, the code is the bug.

## Validation

```bash
bun run spec:check
```

The validator checks three levels:

1. **Structural** — Frontmatter fields, file existence, table existence, required sections
2. **API Surface** — Exported symbols in source match the spec's Public API tables
3. **Dependencies** — All referenced specs and consumed-by files exist

Warnings (undocumented exports) don't fail. Errors (missing files, broken refs, spec describes nonexistent code) cause exit code 1.

## Directory Layout

```
specs/
  README.md                           — This file
  _template.spec.md                   — Copy-paste template
  db/
    sessions.spec.md                  — Session CRUD + messages + conversations
    credits.spec.md                   — Credit ledger and transaction system
  process/
    process-manager.spec.md           — Session lifecycle orchestration
  scheduler/
    scheduler-service.spec.md         — Cron/interval automation engine
  work/
    work-task-service.spec.md         — Git worktree work task lifecycle
```
