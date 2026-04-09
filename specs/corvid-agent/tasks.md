---
spec: corvid-agent.spec.md
---

## Active Tasks

- [ ] One-command deployment with Docker Compose and systemd LaunchAgent (#1487)
- [ ] Frictionless adoption: reduce setup to under 5 minutes for new operators (#1460)
- [ ] v1.0.0 mainnet launch readiness: audit startup security, graceful shutdown, and health check coverage (#311)
- [ ] Add structured startup diagnostics output (timing breakdown per step) to improve debuggability

## Completed Tasks

- [x] Security validation via `validateStartupSecurity()` with process.exit(1) on failure
- [x] Graceful shutdown on SIGTERM/SIGINT with 30-second WebSocket drain
- [x] MCP HTTP endpoint at `/mcp` with full service injection
- [x] Health check at `/api/health` exempt from auth
- [x] Database migration gate before service construction
