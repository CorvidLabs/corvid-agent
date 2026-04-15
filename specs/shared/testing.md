---
spec: cron-human-pipe.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `client/src/app/shared/components/route-error.component.spec.ts` | Angular component (Vitest) | Rendering (`role="alert"`, title, ASCII icon, hint); retry button calls `router.navigateByUrl(router.url)`; Go Home link points to `/chat`; aria-labels on both buttons |
| _(no dedicated spec for CronHumanPipe)_ | — | `cronToHuman` / `validateCron` logic is exercised indirectly via CronEditorComponent |
| _(no dedicated spec for CronEditorComponent)_ | — | No Angular component test file found; covered by manual QA |

## Manual Testing

- [ ] Open the schedule create form and type `"0 9 * * 1-5"` — verify preview shows `"9:00 AM, Mon-Fri"`
- [ ] Type `"0 25 * * *"` — verify red border and error `"Hour: 25 out of range 0-23"` appears
- [ ] Click a preset chip — verify input, preview, and `valueChange` event all update
- [ ] Clear the input — verify neither preview nor error is shown
- [ ] Click Save while input is invalid — verify no `save` event fires
- [ ] Resize browser to < 600px — verify preset chip labels are hidden
- [ ] Trigger a chunk load error (e.g. rename a lazy-loaded chunk file) — verify `RouteErrorComponent` is rendered with `role="alert"`
- [ ] Click Retry — verify `router.navigateByUrl` is called with the current URL
- [ ] Click Go Home — verify navigation goes to `/chat`
- [ ] Enable `prefers-reduced-motion: reduce` in browser DevTools — verify animations are disabled on the error page

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `cronToHuman(null)` | Returns `""` |
| `cronToHuman(undefined)` | Returns `""` |
| Expression with 4 fields | `cronToHuman` returns raw expression unchanged |
| Expression with 6 fields | `cronToHuman` returns raw expression unchanged |
| `validateCron("")` | Returns `"Cron expression is required"` |
| `validateCron("0 25 * * *")` | Returns `"Hour: 25 out of range 0-23"` |
| `validateCron("* * * * *")` | Returns `null` (valid) |
| Retry when chunk still missing | Same error page re-renders (no infinite loop) |
| `CronEditorComponent.emitSave()` while invalid | No-op; `save` output not emitted |
| Preset chip sets expression already in input | Input updated, `valueChange` still emits |
