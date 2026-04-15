---
spec: sandbox.spec.md
sources:
  - server/sandbox/container.ts
  - server/sandbox/lifecycle-adapter.ts
  - server/sandbox/manager.ts
  - server/sandbox/policy.ts
  - server/sandbox/types.ts
  - server/db/sandbox.ts
---

## Module Structure

Six files under `server/sandbox/`:
- `types.ts` — all types: `SandboxConfig`, `NetworkPolicy`, `ContainerInfo`, `ContainerStatus`, `PoolConfig`, `ResourceLimits`, `SandboxConfigRecord`, `ExecResult`
- `container.ts` — low-level Docker CLI wrappers: `createContainer`, `startContainer`, `stopContainer` (with kill fallback), `removeContainer` (warn-only), `execInContainer`, `getContainerStatus`, `isDockerAvailable`, `listSandboxContainers`
- `policy.ts` — agent-specific resource limit management: `getAgentPolicy`, `setAgentPolicy`, `removeAgentPolicy`, `listAgentPolicies`
- `manager.ts` — `SandboxManager` class: warm pool `Map<sandboxId, PoolEntry>`, maintenance loop, `assignContainer`, `releaseContainer`
- `lifecycle-adapter.ts` — `SandboxLifecycleAdapter`: subscribes to `SessionEventBus` to auto-assign/release containers without modifying `ProcessManager`
- `db/sandbox.ts` — raw DB helpers: `getSandboxConfig`, `listSandboxConfigs`, `deleteSandboxConfig`

## Key Classes and Functions

**`SandboxManager`** — Manages `Map<sandboxId, PoolEntry>` where each entry tracks container ID, status, assigned session, and idle-since timestamp. On `initialize()`: checks Docker availability → cleans stale containers → fills warm pool to `warmPoolSize` → starts 30s maintenance loop.

- `assignContainer()` — picks first unassigned warm entry; if none available and total < `maxContainers`, creates one on demand; starts the container; triggers background pool refill.
- Maintenance (every 30s): recycles containers idle beyond `idleTimeoutMs`, removes dead warm containers, refills pool to `warmPoolSize`.

**`SandboxLifecycleAdapter`** — Subscribes to all session events. On `session_started`: calls `assignContainer(agentId, sessionId, workDir)`. On `session_stopped`/`session_error`/`session_timeout`: calls `releaseContainer(sessionId)`. Decoupled from `ProcessManager` by using the event bus.

**Container naming:** all containers use the pattern `corvid-sandbox-{uuid}` for easy identification and cleanup.

**Path traversal guard in `createContainer()`:** if `workDir` contains `..` segments, throws `AuthorizationError` before any Docker command.

## Configuration Values

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_POOL_CONFIG.warmPoolSize` | `2` | Pre-created warm containers |
| `DEFAULT_POOL_CONFIG.maxContainers` | `10` | Hard cap on total containers |
| `DEFAULT_POOL_CONFIG.idleTimeoutMs` | `300000` (5 min) | Recycle idle containers |
| `DEFAULT_POOL_CONFIG.defaultImage` | `corvid-agent-sandbox:latest` | Default container image |
| `DEFAULT_RESOURCE_LIMITS.memoryLimitMb` | `512` | Default memory cap |
| `DEFAULT_RESOURCE_LIMITS.networkPolicy` | `'restricted'` | Default network isolation |

## Related Resources

**DB table:** `sandbox_configs` — per-agent resource limit overrides.

**Consumed by:** `server/index.ts` (manager lifecycle), `server/routes/sandbox.ts` (pool stats, policy CRUD), `server/db/agents.ts` (cascade delete).
