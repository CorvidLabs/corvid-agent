---
spec: cron-human-pipe.spec.md
sources:
  - client/src/app/shared/pipes/cron-human.pipe.ts
  - client/src/app/shared/components/cron-editor.component.ts
  - client/src/app/shared/components/route-error.component.ts
---

## Layout

The `shared/` directory groups reusable Angular utilities: standalone pipes, standalone components, and helper functions. No routing is involved; all items are imported by feature modules.

```
client/src/app/shared/
  pipes/
    cron-human.pipe.ts          — CronHumanPipe + cronToHuman + validateCron
  components/
    cron-editor.component.ts    — CronEditorComponent (preset chips, preview, validation)
    route-error.component.ts    — RouteErrorComponent (chunk-load error page)
```

## Components

### `CronHumanPipe` / `cronToHuman` / `validateCron`
Pure utility layer — no DOM, no state. Three exports from a single file:

- `cronToHuman(expr)` — maps a 5-field cron expression to English (`"0 9 * * 1-5"` → `"9:00 AM, Mon-Fri"`). Returns `""` for null/undefined; returns raw expression if field count ≠ 5.
- `validateCron(expr)` — returns `null` for valid expressions, or a descriptive error string (e.g. `"Hour: 25 out of range 0-23"`).
- `CronHumanPipe` — Angular pipe (`| cronHuman`) wrapping `cronToHuman`.

### `CronEditorComponent`
Standalone component (`app-cron-editor`), OnPush. Key design decisions:
- **Inputs**: `label` (default `'Cron Expression'`), `initialValue`
- **Outputs**: `valueChange` (string), `save` (CronEditorResult), `cancel` (void)
- **Computed signals**: `humanPreview` (shown only when valid), `validationError` (shown only when non-empty and invalid), `isValid`
- **Presets**: Chips that populate the input with well-known expressions
- **Mobile**: Preset labels hidden below 600px; only compact icon text shown
- `emitSave()` is a no-op guard when `isValid()` is false

### `RouteErrorComponent`
Standalone error page (`app-route-error`), OnPush. Rendered as the `errorElement` of lazy-loaded routes when a chunk fails to load.
- `asciiIcon` readonly property — multi-line ASCII art
- `retry()` method — calls `router.navigateByUrl(router.url)` to reattempt current route
- "Go Home" link hardcoded to `/chat`
- Uses `role="alert"` + `aria-live="assertive"` for screen reader accessibility
- CSS `@media (prefers-reduced-motion: reduce)` disables animations

## Tokens

| Value | Notes |
|-------|-------|
| Cron chunk limit (5 fields) | `cronToHuman` returns raw expression if count ≠ 5 |
| Mobile breakpoint | `< 600px` — preset labels hidden in `CronEditorComponent` |
| `RouteErrorComponent` home route | `/chat` — hardcoded in "Go Home" link |

## Assets

### Angular Dependencies
- `@angular/core` — signals, `input()`, `output()`, `effect()`, `OnPush`
- `@angular/forms` — `FormsModule` (`ngModel`) for cron input
- `@angular/router` — `Router`, `RouterLink`

### Consumers
- `ScheduleListComponent` — uses `CronEditorComponent` and `CronHumanPipe`
- App routing config — registers `RouteErrorComponent` as route `errorElement`
