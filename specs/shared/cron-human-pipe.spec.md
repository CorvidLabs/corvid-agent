---
module: cron-human-pipe
version: 1
status: active
files:
  - client/src/app/shared/pipes/cron-human.pipe.ts
db_tables: []
depends_on: []
---

# CronHumanPipe

## Purpose

Angular pipe and standalone utility functions for converting 5-field cron expressions to human-readable strings, and validating cron expressions with descriptive error messages.

## Public API

### Exported Classes

| Class | Description |
|-------|-------------|
| `CronHumanPipe` | Angular pipe (`cronHuman`) that transforms a cron expression string into a human-readable description |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `cronToHuman` | `(expr: string \| null \| undefined)` | `string` | Converts a 5-field cron expression to human-readable text |
| `validateCron` | `(expr: string)` | `string \| null` | Validates a 5-field cron expression, returns null if valid or error string |

## Invariants

1. `cronToHuman` always returns empty string for null/undefined input
2. `cronToHuman` returns the raw expression unchanged if it does not contain exactly 5 whitespace-separated fields
3. `validateCron` returns null for any syntactically valid 5-field cron expression
4. `validateCron` returns a human-readable error string (never throws) for invalid input
5. Time is always formatted in 12-hour AM/PM notation when hour and minute are both numeric

## Behavioral Examples

### Scenario: Common cron to human conversion

- **Given** the expression `"0 9 * * 1-5"`
- **When** `cronToHuman` is called
- **Then** it returns `"9:00 AM, Mon-Fri"`

### Scenario: Every-minute expression

- **Given** the expression `"* * * * *"`
- **When** `cronToHuman` is called
- **Then** it returns `"Every minute"`

### Scenario: Invalid cron validation

- **Given** the expression `"0 25 * * *"`
- **When** `validateCron` is called
- **Then** it returns `"Hour: 25 out of range 0-23"`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Null/undefined input to `cronToHuman` | Returns empty string |
| Non-5-field expression to `cronToHuman` | Returns the raw expression unchanged |
| Empty string to `validateCron` | Returns `"Cron expression is required"` |
| Out-of-range field value | Returns descriptive error naming the field and valid range |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@angular/core` | `Pipe`, `PipeTransform` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `CronEditorComponent` | `cronToHuman`, `validateCron` |
| `ScheduleListComponent` | `CronHumanPipe`, `cronToHuman`, `validateCron` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | corvid-agent | Initial spec for issue #1553 |
