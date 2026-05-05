---
module: pr-body
version: 1
status: active
files:
  - server/github/pr-body.ts
db_tables: []
depends_on: []
tracks: [2272]
---

# PR Body Template

## Purpose

Standardized PR body formatting for work task pull requests. Provides a consistent template with Summary, Changes, and Test Plan sections.

## Public API

### Exported Types

| Type | Kind | Description |
|------|------|-------------|
| `PrBodyOptions` | interface | Options for `formatPrBody` — `summary` (required), `changes` and `testPlan` (optional) |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `formatPrBody` | `(opts: PrBodyOptions)` | `string` | Formats a PR body with Summary, Changes, and Test Plan sections |

## Invariants

- `formatPrBody` MUST include a `## Summary` section when `summary` array is non-empty
- `formatPrBody` MUST omit `## Changes` section when `changes` is undefined or empty
- `formatPrBody` MUST omit `## Test Plan` section when `testPlan` is undefined or empty
- Test plan items MUST render as unchecked checkboxes (`- [ ]`)
- The agent signature footer is NOT included by `formatPrBody` — it is appended separately by the caller

## Behavioral Examples

- `formatPrBody({ summary: ['Added login'] })` produces `## Summary\n- Added login`
- `formatPrBody({ summary: ['Fix'], changes: ['Updated X'], testPlan: ['Verify Y'] })` produces all three sections separated by blank lines

## Error Cases

No runtime errors — `formatPrBody` is a pure formatter. Empty `summary` array produces an empty string.

## Dependencies

None. Pure utility with no imports.

## Change Log

- v1: Initial spec for #2272
