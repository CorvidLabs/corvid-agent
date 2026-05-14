# Bridge — Tasks

## Completed

- [x] Initial implementation — BridgeService, HTTP routes, WebSocket upgrade, MCP tools (PR #2287)
- [x] Module spec written (this spec)
- [x] Bridge session disconnect endpoint (`DELETE /api/bridge/sessions/:id`) for manual eviction

## Potential future work

- [ ] Dashboard UI panel showing active bridge sessions
- [ ] Project-scoped session isolation (agents can only use sessions matching their project)
- [ ] Configurable auth timeout (currently hardcoded in `handler.ts`)
- [ ] Structured exec output (stdout/stderr/exit-code as separate fields rather than concatenated string)
