---
spec: sandbox.spec.md
---

## User Stories

- As a platform administrator, I want agent sessions to run inside Docker containers so that untrusted code execution is isolated from the host system.
- As an agent operator, I want per-agent resource limit policies (CPU, memory, network, PIDs, storage) so that individual agents cannot consume excessive resources.
- As a platform administrator, I want a warm container pool with automatic assignment and recycling so that session startup latency is minimized.
- As an agent developer, I want the sandbox to integrate with the session event bus so that containers are automatically assigned on session start and released on session end without modifying `ProcessManager`.
- As a platform administrator, I want the system to degrade gracefully when Docker is unavailable so that the server still runs without sandboxing rather than crashing.

## Acceptance Criteria

- `createContainer` builds a Docker container with the specified `SandboxConfig` and `ResourceLimits`; container names follow the pattern `corvid-sandbox-{sandboxId}`.
- `createContainer` throws `AuthorizationError` if `workDir` contains path traversal (`..` segments) before executing any Docker command.
- `createContainer` throws `ExternalServiceError` if the `docker create` command fails.
- `stopContainer` falls back to `docker kill` if `docker stop` fails.
- `removeContainer` logs a warning but does not throw on failure.
- `isDockerAvailable` checks Docker daemon reachability with a 5-second timeout.
- `getAgentPolicy` returns a complete `ResourceLimits` object, merging agent-specific overrides from `sandbox_configs` with `DEFAULT_RESOURCE_LIMITS` (cpuLimit=1.0, memoryLimitMb=512, networkPolicy=restricted, timeoutSeconds=600, pidsLimit=100, storageLimitMb=1024).
- `setAgentPolicy` performs an upsert: updates if a record exists for the agent, inserts otherwise.
- `SandboxManager.initialize` returns `false` if Docker is unavailable; subsequent `assignContainer` calls throw `ValidationError`.
- `SandboxManager.assignContainer` selects an unassigned warm container (or creates one on demand if below `maxContainers`), starts it, and returns the container ID.
- `SandboxManager.assignContainer` throws `ConflictError` if the maximum container limit (default 10) is reached.
- The warm pool never exceeds `poolConfig.maxContainers` total containers.
- Maintenance runs every 30 seconds: recycles containers idle beyond `idleTimeoutMs` (default 300s), removes dead warm containers, and refills the pool.
- `SandboxManager.shutdown` stops all containers and clears the pool regardless of individual stop/remove failures.
- `SandboxLifecycleAdapter.start` subscribes to session events on the event bus; `stop` unsubscribes.

## Constraints

- All container operations are performed via the `docker` CLI and `Bun.spawn`, not the Docker API directly.
- Default pool configuration: `warmPoolSize=2`, `maxContainers=10`, `idleTimeoutMs=300000`, `defaultImage=corvid-agent-sandbox:latest`.
- Network policy options are `none`, `host`, or `restricted`; the default is `restricted`.
- The sandbox module depends on Docker being installed on the host; it has no fallback to other container runtimes.
- Container cleanup on shutdown is best-effort; individual stop/remove failures are logged but do not block the shutdown sequence.

## Out of Scope

- Building or managing the `corvid-agent-sandbox` Docker image (assumed to be pre-built).
- Container networking configuration beyond the three policy modes (none/host/restricted).
- GPU passthrough or hardware resource allocation.
- Container image registry management or image pulling.
- Multi-host container orchestration (Kubernetes, Docker Swarm).
- Persistent volumes or stateful container storage beyond the session lifetime.
