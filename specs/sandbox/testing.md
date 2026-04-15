---
spec: sandbox.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| `server/__tests__/container.test.ts` | Unit | `createContainer` with valid/invalid workDir, `stopContainer` kill fallback, `removeContainer` warn-on-failure, `getContainerStatus` null on missing container, `isDockerAvailable` timeout |
| `server/__tests__/sandbox-manager.test.ts` | Unit | Warm pool assignment, on-demand creation, Docker-unavailable init, max container limit, pool refill, maintenance recycle |
| `server/__tests__/routes-sandbox.test.ts` | Integration | Pool stats endpoint, `setAgentPolicy`, `getAgentPolicy` default fallback, `removeAgentPolicy` |

## Manual Testing

- [ ] Start the server with Docker running; confirm `GET /api/sandbox/status` shows `enabled: true` and `warm` count equals `warmPoolSize`
- [ ] Start the server without Docker; confirm `GET /api/sandbox/status` shows `enabled: false`
- [ ] Assign a container to a session and confirm `getPoolStats()` shows it as `assigned`
- [ ] Release the container and confirm it is removed and the pool refills
- [ ] Set a custom `memoryLimitMb: 256` for an agent via `POST /api/sandbox/policy/:agentId` and confirm `getAgentPolicy` returns 256
- [ ] Delete the agent and confirm the `sandbox_configs` row is cascade-deleted

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Docker not available at `initialize()` | Returns `false`; `assignContainer` throws `ValidationError` |
| Total containers at `maxContainers` limit | `assignContainer` throws `ConflictError` |
| `workDir` contains `..` segments | `createContainer` throws `AuthorizationError` before any Docker call |
| `docker create` command fails | `createContainer` throws `ExternalServiceError` |
| `docker stop` times out | Escalates to `docker kill` |
| `docker rm` fails | Warning logged; no exception thrown |
| `docker inspect` returns empty/invalid JSON | `getContainerStatus` returns `null` |
| Agent has no row in `sandbox_configs` | `getAgentPolicy` returns a copy of `DEFAULT_RESOURCE_LIMITS` |
| `setAgentPolicy` called for same agent twice | Upserts (updates existing row) |
| Container idle beyond `idleTimeoutMs` | Maintenance loop recycles it; pool refills |
