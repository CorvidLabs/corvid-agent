# Sandbox — Context

## Why This Module Exists

Running untrusted code (from agents or plugins) on the host system is dangerous. The sandbox module provides container-based isolation — executing code in controlled environments with resource limits, network restrictions, and filesystem constraints.

## Architectural Role

Sandbox is a **security infrastructure** — it wraps command execution in containers with configurable policies. It's used when agents need to run code they've written or when plugins execute untrusted logic.

## Key Design Decisions

- **Container-based**: Uses Docker/Podman containers for strong isolation rather than lighter mechanisms (chroot, seccomp). This provides filesystem, network, and process isolation.
- **Policy-driven**: Each sandbox has a policy defining resource limits (CPU, memory, time), allowed network access, and filesystem mounts.
- **Lifecycle adapter**: The sandbox integrates with the process manager via a lifecycle adapter, so sandboxed processes are managed like regular processes.

## Relationship to Other Modules

- **Process Manager**: Sandboxed processes use the lifecycle adapter for management.
- **Work Tasks**: Work task execution can use sandboxed environments for safety.
- **Plugins**: Plugin execution can be sandboxed.
