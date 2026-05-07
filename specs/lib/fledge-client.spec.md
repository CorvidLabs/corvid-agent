---
module: fledge-client
version: 1
status: active
files:
  - server/lib/fledge-client.ts
db_tables: []
depends_on: []
---

# FledgeClient

## Purpose

Thin wrapper around the `fledge` CLI binary for delegating agent operations to fledge plugins. Shells out to `fledge <command> --json` and parses the JSON response. Used by MCP tool handlers to delegate memory, SQL, localnet, and AlgoChat operations to hardened fledge plugins with automatic fallback when fledge is unavailable.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `FledgeResult` | Parsed JSON response from a fledge command. Always has `ok: boolean`, plus arbitrary fields |

### Exported Classes

| Class | Description |
|-------|-------------|
| `FledgeClient` | Spawns `fledge` subprocesses and parses JSON output |
| `FledgeError` | Error thrown on non-zero exit code, includes `exitCode` field |

#### FledgeClient Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `exec` | `(command: string, args?: string[])` | `Promise<FledgeResult>` | Run `fledge <command> [...args] --json` and return parsed output |
| `memory` | `(subcommand: string, flags?: Record<string, string>)` | `Promise<FledgeResult>` | Shorthand for `fledge memory <sub> --key X --value Y --json` |
| `algochat` | `(subcommand: string, args?: string[])` | `Promise<FledgeResult>` | Shorthand for `fledge algochat <sub> --json` |
| `sql` | `(subcommand: string, args?: string[])` | `Promise<FledgeResult>` | Shorthand for `fledge sql <sub> --json` |
| `localnet` | `(subcommand: string, args?: string[])` | `Promise<FledgeResult>` | Shorthand for `fledge localnet <sub> --json` |
| `available` | `()` | `Promise<boolean>` | Check if the `fledge` binary is reachable |

## Invariants

1. **Always appends --json**: Every command gets `--json` appended and `FLEDGE_NON_INTERACTIVE=1` set in env
2. **Timeout enforcement**: Subprocess is killed after configurable timeout (default 30s) to prevent hangs
3. **JSON-first parsing**: Scans stdout line-by-line for the first JSON object; non-JSON output returns `{ ok: true, raw: stdout }`
4. **Error propagation**: Non-zero exit codes throw `FledgeError` with the exit code and parsed error message
5. **No state**: FledgeClient is stateless — each call spawns a fresh subprocess

## Behavioral Examples

### Scenario: Successful fledge command

- **Given** fledge is installed and the memory plugin is available
- **When** `client.memory("identity")` is called
- **Then** returns a `FledgeResult` with `address` field from the JSON output

### Scenario: Fledge not installed

- **Given** the `fledge` binary is not on PATH
- **When** `client.exec("memory", ["identity"])` is called
- **Then** throws `FledgeError`
- **And** `client.available()` returns `false`

### Scenario: Plugin returns error JSON

- **Given** fledge is installed but the command fails with `{"error": "Invalid key"}`
- **When** `client.memory("save", { key: "bad key" })` is called
- **Then** throws `FledgeError` with message "Invalid key"

### Scenario: Command timeout

- **Given** a FledgeClient with `timeout: 5000`
- **When** a fledge command takes longer than 5 seconds
- **Then** the subprocess is killed and `FledgeError` is thrown

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `fledge` binary not found | `Bun.spawn` throws, caught as `FledgeError` |
| Non-zero exit code with JSON error | Parses error field from JSON, throws `FledgeError` |
| Non-zero exit code without JSON | Uses stderr as error message |
| Timeout exceeded | Subprocess killed, throws `FledgeError` |
| Stdout contains no JSON | Returns `{ ok: true, raw: stdout.trim() }` |
| Empty stdout on success | Returns `{ ok: true, raw: "" }` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun` | `Bun.spawn` for subprocess execution |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/mcp/tool-handlers/memory.ts` | `ctx.fledgeClient.memory()` for save/recall/promote/delete delegation |
| `server/algochat/init.ts` | `new FledgeClient()` instantiated and passed to MCP services |
| `server/process/mcp-service-container.ts` | Threaded through `McpServices` → `McpToolContext` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-07 | corvid-agent | Initial spec — fledge plugin delegation layer |
