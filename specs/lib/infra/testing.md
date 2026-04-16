---
spec: infra.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| (tested indirectly) | — | Most coverage comes from route and integration tests that exercise `handleRouteError`, `parseBodyOrThrow`, and `AppError` subclasses through the full request/response path |

## Manual Testing

- [ ] Set `LOG_LEVEL=warn`; create a logger; call `.info('test')`; verify no output; call `.error('test')`; verify output on stderr
- [ ] Set `LOG_FORMAT=json`; create a logger and log a message; verify output is valid JSON with `level`, `module`, `msg` fields
- [ ] Call `buildSafeGhEnv()` and verify `ANTHROPIC_API_KEY` and `WALLET_ENCRYPTION_KEY` are absent from the result
- [ ] Call `handleRouteError(new NotFoundError('Project', 'abc'))` and verify a 404 JSON response with `{ error: ..., code: 'NOT_FOUND' }`
- [ ] Call `handleRouteError(new RateLimitError('...', 60))` and verify response body includes `retryAfter: 60`
- [ ] Call `serverError(new Error('DB failure'))` and verify the response body does NOT contain the error message
- [ ] Call `parseBodyOrThrow` with invalid JSON; verify `ValidationError` is thrown
- [ ] Call `parseBody` with invalid JSON; verify `{ data: null, error: 'Invalid JSON body' }` is returned without throwing
- [ ] Call `isAlgorandAddressFormat` with a 58-char uppercase base32 string; verify `true`; with 57 chars verify `false`

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `LOG_LEVEL` set to unknown value | Falls back to `info` level |
| `LOG_FORMAT` set to unrecognized value | Defaults based on `NODE_ENV` |
| Trace context module unavailable at import time | Logger continues without trace IDs |
| `serverError` called with a string (not Error) | Converts to string for logging; returns generic 500 response |
| `handleRouteError` called with non-AppError | Delegates to `serverError`; returns 500 |
| `parseBodyOrThrow` called with empty body | Throws `ValidationError('Invalid JSON body')` |
| `parseBody` encounters unexpected error (not JSON parse) | Returns `{ data: null, error: 'Invalid request' }` |
| `safeNumParam` with NaN string | Returns default value |
| `safeNumParam` with null | Returns default value |
| `RateLimitError` without `retryAfter` | `handleRouteError` response body does not include `retryAfter` field |
| `NotFoundError` with no id param | Response message includes resource name only |
| `ValidationError` re-export from validation.ts | Same class reference as errors.ts export |
