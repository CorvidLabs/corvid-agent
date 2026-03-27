---
module: cron-editor
version: 1
status: active
files:
  - client/src/app/shared/components/cron-editor.component.ts
db_tables: []
depends_on:
  - specs/shared/cron-human-pipe.spec.md
---

# CronEditorComponent

## Purpose

Reusable standalone Angular component for editing cron expressions with preset chips, real-time human-readable preview, and inline validation. Used in schedule creation and inline schedule editing.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `CronEditorResult` | `{ expression: string; human: string }` -- Result payload from the save output |

### Exported Classes

| Class | Description |
|-------|-------------|
| `CronEditorComponent` | Standalone component for cron expression editing with presets and validation |

CronEditorComponent accepts inputs `label` (string, default `'Cron Expression'`) and `initialValue` (string). It emits outputs `valueChange` (string), `save` (CronEditorResult), and `cancel` (void). Computed signals: `humanPreview`, `validationError`, `isValid`.

### Component Metadata

| Key | Value |
|-----|-------|
| Selector | `app-cron-editor` |
| Change Detection | `OnPush` |
| Imports | `FormsModule` |

## Invariants

1. Preset chips always set the input to a valid cron expression
2. The human preview is only shown when the expression is valid (no error)
3. The error message is only shown when the expression is non-empty and invalid
4. The input border turns red only when a validation error is present
5. On mobile (< 600px), preset labels are hidden, showing only compact icon text
6. `emitSave` is a no-op when `isValid()` is false

## Behavioral Examples

### Scenario: User selects a preset

- **Given** the editor is displayed with an empty input
- **When** the user clicks the "Weekdays at 9 AM" preset chip
- **Then** the input is populated with `"0 9 * * 1-5"`, the preview shows `"9:00 AM, Mon-Fri"`, and `valueChange` emits `"0 9 * * 1-5"`

### Scenario: User types an invalid expression

- **Given** the editor is displayed
- **When** the user types `"0 25 * * *"`
- **Then** an error message appears: `"Hour: 25 out of range 0-23"` and the input border turns red

### Scenario: User types a valid expression

- **Given** the editor is displayed
- **When** the user types `"*/15 * * * *"`
- **Then** the preview shows `"Every 15 minutes"` in cyan

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty input | No preview or error shown |
| Invalid field range | Red error message naming the offending field |
| Wrong number of fields | Error message showing expected vs actual count |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `@angular/core` | `Component`, signals, `input`, `output`, `effect` |
| `@angular/forms` | `FormsModule` for `ngModel` |
| `cron-human-pipe` | `cronToHuman`, `validateCron` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `ScheduleListComponent` | Used in create form and inline cron editing |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-27 | corvid-agent | Initial spec for issue #1553 |
