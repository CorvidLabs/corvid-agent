# Bridge — Context

## Why this module exists

Agents run inside a server process with no direct access to a developer's local filesystem or shell. The bridge module solves this by allowing a developer to run the `fledge-plugin-bridge` Kotlin plugin locally, which connects outbound to corvid-agent. Once connected, agents can read files, write files, list directories, and execute commands on the developer's machine — all without the developer needing to open any inbound ports.

## Design decisions

**Outbound-only connection**: The developer's machine always initiates the connection, making the bridge work behind NAT and firewalls.

**Capability intersection**: The server defines maximum allowed capabilities via env vars (`BRIDGE_ALLOW_*`). Clients can request a subset but cannot exceed the server ceiling. This means `BRIDGE_ALLOW_EXEC=false` is an absolute safety net regardless of what the client requests.

**Read enabled by default**: File reads are the most common and least dangerous operation. Setting `BRIDGE_ALLOW_READ=false` allows fully restricting even reads.

**Reject-on-validation**: All path traversal, null byte, shell metacharacter, and dangerous-command checks happen on the server before any message is sent to the client. The client is never asked to enforce safety.

**Rate limiting is per-session**: Independent sessions are independently limited (120 req/60 s each), so one misbehaving agent cannot starve others.

**Idle reaping**: Sessions idle for 30+ minutes are closed automatically to prevent resource leaks from abandoned connections.

## Security model

The bridge is guarded by the same API key used for HTTP/WS auth. Token comparison uses `timingSafeEqual` to prevent timing attacks. Authentication must complete within a short timeout window (configurable in `handler.ts`) to prevent half-open connections from consuming resources.

## Relationship to `fledge-plugin-bridge`

The Kotlin plugin (`CorvidLabs/fledge-plugin-bridge`) implements the client side of this protocol. The plugin reads/writes/executes locally and relays results back. This spec defines the server contract the plugin must satisfy.
