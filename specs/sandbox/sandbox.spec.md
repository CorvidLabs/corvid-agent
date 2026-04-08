---
module: sandbox
version: 1
status: draft
files:
  - server/sandbox/container.ts
  - server/sandbox/lifecycle-adapter.ts
  - server/sandbox/manager.ts
  - server/sandbox/policy.ts
  - server/sandbox/types.ts
  - server/db/sandbox.ts
db_tables:
  - sandbox_configs
depends_on:
  - specs/lib/infra.spec.md
---

# Sandbox

## Purpose

Manages Docker container lifecycle for sandboxed agent execution, including a warm container pool with automatic assignment and recycling, per-agent resource limit policies backed by the database, and low-level container operations via `docker` CLI.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createContainer` | `config: SandboxConfig`, `limits?: ResourceLimits` | `Promise<string>` | Creates a Docker container with the given config and resource limits; returns the container ID |
| `startContainer` | `containerId: string` | `Promise<void>` | Starts an existing stopped/created container |
| `stopContainer` | `containerId: string`, `timeoutSeconds?: number` | `Promise<void>` | Stops a running container; falls back to `docker kill` if stop fails |
| `removeContainer` | `containerId: string` | `Promise<void>` | Force-removes a container (logs warning on failure, does not throw) |
| `execInContainer` | `containerId: string`, `command: string[]`, `timeoutMs?: number` | `Promise<ExecResult>` | Executes a command inside a running container with configurable timeout |
| `getContainerStatus` | `containerId: string` | `Promise<ContainerInfo \| null>` | Inspects a container and returns structured status info, or `null` if not found |
| `isDockerAvailable` | _(none)_ | `Promise<boolean>` | Checks if Docker daemon is reachable (5s timeout) |
| `listSandboxContainers` | _(none)_ | `Promise<string[]>` | Lists container IDs with the `corvid-sandbox-` name prefix |
| `getAgentPolicy` | `db: Database`, `agentId: string` | `ResourceLimits` | Retrieves agent-specific resource limits from `sandbox_configs`, falling back to defaults |
| `setAgentPolicy` | `db: Database`, `agentId: string`, `limits: Partial<ResourceLimits>` | `void` | Upserts custom resource limits for an agent in `sandbox_configs` |
| `removeAgentPolicy` | `db: Database`, `agentId: string` | `boolean` | Deletes custom policy for an agent; returns `true` if a row was deleted |
| `listAgentPolicies` | `db: Database` | `SandboxConfigRecord[]` | Returns all agent sandbox policy records ordered by `created_at DESC` |

### Exported Functions (db/sandbox.ts)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getSandboxConfig` | `db: Database, agentId: string` | `SandboxConfigRecord \| null` | Retrieve sandbox config for an agent |
| `listSandboxConfigs` | `db: Database` | `SandboxConfigRecord[]` | List all sandbox configs ordered by created_at DESC |
| `deleteSandboxConfig` | `db: Database, agentId: string` | `boolean` | Delete sandbox config for an agent; returns true if deleted |

### Exported Types

| Type | Description |
|------|-------------|
| `SandboxConfig` | Full container configuration: id, agentId, image, cpu/memory limits, networkPolicy, timeoutSeconds, readOnlyMounts, workDir, timestamps |
| `NetworkPolicy` | Union literal: `'none' \| 'host' \| 'restricted'` |
| `ContainerInfo` | Container inspection result: containerId, sessionId, status, image, createdAt, startedAt, pid |
| `ContainerStatus` | Union literal: `'creating' \| 'ready' \| 'running' \| 'stopped' \| 'error'` |
| `PoolConfig` | Pool settings: warmPoolSize, maxContainers, idleTimeoutMs, defaultImage |
| `ResourceLimits` | Resource constraint set: cpuLimit, memoryLimitMb, networkPolicy, timeoutSeconds, pidsLimit, storageLimitMb |
| `SandboxConfigRecord` | Database row shape for the `sandbox_configs` table (snake_case fields) |
| `ExecResult` | Docker command result: exitCode, stdout, stderr |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `DEFAULT_POOL_CONFIG` | `PoolConfig` | Default pool settings: warmPoolSize=2, maxContainers=10, idleTimeoutMs=300000, defaultImage=`corvid-agent-sandbox:latest` |
| `DEFAULT_RESOURCE_LIMITS` | `ResourceLimits` | Default resource limits: cpuLimit=1.0, memoryLimitMb=512, networkPolicy=`restricted`, timeoutSeconds=600, pidsLimit=100, storageLimitMb=1024 |

### Exported Classes

| Class | Description |
|-------|-------------|
| `SandboxManager` | Manages a warm pool of Docker containers, assigns them to sessions, handles lifecycle and maintenance |
| `SandboxLifecycleAdapter` | Subscribes to SessionEventBus lifecycle events to assign/release sandbox containers without modifying ProcessManager |

#### SandboxManager Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database`, `poolConfig?: PoolConfig` | `SandboxManager` | Creates manager with database handle and optional pool configuration |
| `initialize` | _(none)_ | `Promise<boolean>` | Checks Docker availability, cleans stale containers, fills warm pool, starts 30s maintenance loop; returns `false` if Docker unavailable |
| `assignContainer` | `agentId: string`, `sessionId: string`, `workDir?: string \| null` | `Promise<string>` | Assigns an available warm container (or creates one on demand) to a session; starts it and returns container ID |
| `releaseContainer` | `sessionId: string` | `Promise<void>` | Stops and removes the container assigned to a session |
| `getContainerForSession` | `sessionId: string` | `PoolEntry \| null` | Returns pool entry for a session's container, or `null` |
| `getPoolStats` | _(none)_ | `{ total, warm, assigned, maxContainers, enabled }` | Returns current pool statistics |
| `shutdown` | _(none)_ | `Promise<void>` | Stops maintenance timer, stops and removes all containers, clears pool |
| `isEnabled` | _(none)_ | `boolean` | Returns whether sandboxing is enabled (Docker was available at init) |

#### SandboxLifecycleAdapter Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor` | `db: Database`, `sandboxManager: SandboxManager`, `eventBus: EventSubscriber` | `SandboxLifecycleAdapter` | Creates adapter with DB handle, sandbox manager, and event bus |
| `start` | _(none)_ | `void` | Subscribes to all session events on the event bus |
| `stop` | _(none)_ | `void` | Unsubscribes from all session events |
| `getSessionContainer` | `sessionId: string` | `{ containerId, sandboxId } \| null` | Returns container info for a session, or `null` |

## Invariants

1. Container names always follow the pattern `corvid-sandbox-{sandboxId}`.
2. `getAgentPolicy` always returns a complete `ResourceLimits` object, merging agent-specific overrides with `DEFAULT_RESOURCE_LIMITS`.
3. The warm pool never exceeds `poolConfig.maxContainers` total containers.
4. `assignContainer` throws `ValidationError` if sandboxing is not enabled and `ConflictError` if the maximum container limit is reached.
5. `createContainer` throws `AuthorizationError` if `workDir` contains path traversal (`..` segments).
6. `createContainer` throws `ExternalServiceError` if the `docker create` command fails.
7. `stopContainer` escalates to `docker kill` if `docker stop` fails.
8. `removeContainer` logs a warning but does not throw on failure.
9. Maintenance runs every 30 seconds: recycles containers idle beyond `idleTimeoutMs`, removes dead warm containers, and refills the pool.
10. `shutdown` stops all containers and clears the pool regardless of individual stop/remove failures.
11. `setAgentPolicy` performs an upsert: updates if a record exists for the agent, inserts otherwise.

## Behavioral Examples

### Scenario: Assigning a container from the warm pool
- **Given** the sandbox manager is initialized and has warm containers in the pool
- **When** `assignContainer('agent-1', 'session-1')` is called
- **Then** an unassigned container is selected, marked as assigned to `session-1`, started, and its container ID is returned; a background pool refill is triggered

### Scenario: Creating a container on demand when pool is empty
- **Given** the sandbox manager is initialized but all containers are assigned
- **When** `assignContainer('agent-2', 'session-2')` is called and pool size is below `maxContainers`
- **Then** a new container is created with the agent's policy limits, assigned to `session-2`, started, and its container ID is returned

### Scenario: Docker not available at startup
- **Given** Docker daemon is not running or not installed
- **When** `initialize()` is called
- **Then** it returns `false`, sandboxing is disabled, and `assignContainer` throws `ValidationError`

### Scenario: Path traversal in workDir
- **Given** a `SandboxConfig` with `workDir` containing `..` segments
- **When** `createContainer` is called
- **Then** an `AuthorizationError` is thrown before any Docker command runs

### Scenario: Agent policy lookup with no custom config
- **Given** no row exists in `sandbox_configs` for `agent-1`
- **When** `getAgentPolicy(db, 'agent-1')` is called
- **Then** a copy of `DEFAULT_RESOURCE_LIMITS` is returned

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Docker not available | `initialize()` returns `false`; `assignContainer` throws `ValidationError` |
| Max containers reached | `assignContainer` throws `ConflictError` |
| `workDir` path traversal | `createContainer` throws `AuthorizationError` |
| `docker create` fails | `createContainer` throws `ExternalServiceError` |
| `docker start` fails | `startContainer` throws `ExternalServiceError` |
| `docker stop` fails | `stopContainer` escalates to `docker kill` |
| `docker rm` fails | `removeContainer` logs warning, does not throw |
| `docker inspect` returns non-zero or unparseable JSON | `getContainerStatus` returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib` | `createLogger` for structured logging; `AuthorizationError`, `ExternalServiceError`, `ValidationError`, `ConflictError` error classes |
| `bun:sqlite` | `Database` type for policy queries |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `SandboxManager` class (initialization and lifecycle) |
| `routes/sandbox` | `SandboxManager` type for pool stats; `getAgentPolicy`, `setAgentPolicy`, `removeAgentPolicy`, `listAgentPolicies` for policy CRUD |
| `routes/index` | `SandboxManager` type for route handler context |
| `db/sandbox` | `SandboxConfigRecord` type |
| `db/agents` | Cascade-deletes rows from `sandbox_configs` on agent deletion |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
