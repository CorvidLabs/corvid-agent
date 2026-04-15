---
spec: corvid-agent.spec.md
---

## Automated Testing

`server/index.ts` is the entry point and is not directly unit tested. Integration coverage comes from related test files:

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/mcp-http-transport.test.ts` | Integration | MCP HTTP endpoint routing |
| `server/__tests__/sdk-process.test.ts` | Unit | Protected-file enforcement during session startup |
| `server/__tests__/migrate.test.ts` | Integration | Database migration idempotency |

## Manual Testing

- [ ] Start the server with a valid `.env`: confirm "Server ready at http://127.0.0.1:3000" in logs
- [ ] Start the server with `ADMIN_TOKEN` unset: confirm exit code 1 and security error message
- [ ] `GET /api/health` without any auth header: confirm 200 response
- [ ] `GET /api/health` while DB is fully initialized: confirm `"status": "ok"` in response body
- [ ] Send SIGTERM to the process while a WebSocket client is connected: confirm server waits for WS close before exiting
- [ ] Start the server twice on the same port: confirm the second instance fails cleanly with a logged port-in-use error
- [ ] Navigate browser to `http://localhost:3000/` (any unmatched path): confirm Angular SPA is served
- [ ] Request `POST /api/sessions` with no token: confirm 401 returned, not static file fallback

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| `ADMIN_TOKEN` is present but empty string | `validateStartupSecurity` exits with code 1 |
| Port 3000 already in use | `Bun.serve()` throws; error logged with stack trace |
| `DATABASE_PATH` directory does not exist | SQLite creation fails; logged before first DB access |
| AlgoChat init throws (e.g., localnet not running) | Warning logged; server continues; services that need AlgoChat receive `null` |
| `CLIENT_DIST` path does not exist | Static file serving returns 404 for unmatched paths; API routes still work |
| SIGINT received during migration | Migration transaction rolls back; DB left in prior version state |
| Uncaught exception in async route handler | Error logged; process may continue depending on Bun's unhandled-rejection policy |
| WebSocket connections still open at shutdown | Server waits up to 30 seconds for graceful close before force-stopping |
| `initDb()` called concurrently from multiple modules | Idempotent: single cached promise; second await returns same result |
| Pending `restart_pending` sessions at startup | All are marked failed before accepting new connections |
