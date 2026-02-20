---
module: direct-process
version: 1
status: active
files:
  - server/process/direct-process.ts
db_tables: []
depends_on:
  - specs/providers/ollama-provider.spec.md
  - specs/providers/tool-prompt-templates.spec.md
---

# Direct Process

## Purpose

Direct execution engine for non-SDK providers (e.g., Ollama). Implements the same `SdkProcess` interface so the ProcessManager and WebSocket clients are unaware of the difference between SDK and direct mode. Manages the full agentic loop: slot acquisition, tool execution, context management, repeat detection, hallucination detection, nudging, and summary epilogue.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `DirectProcessOptions` | Full configuration: session, project, agent, prompt, provider, callbacks, MCP context, persona/skill prompts, model override, external MCP configs, tool allow list |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `startDirectProcess` | `(options: DirectProcessOptions)` | `SdkProcess` | Start a direct process, returns handle with pid/sendMessage/kill |

## Invariants

1. **Slot acquired before loop, released in finally**: The inference slot is acquired before the agentic loop begins and released in a `finally` block, guaranteeing release even on abort or error
2. **Max 25 tool iterations**: The agentic loop runs at most `MAX_TOOL_ITERATIONS` (25) turns. If exceeded, sets `needsSummary = true`
3. **Repeat detection (same tool+args 3x)**: If the same tool call (normalized: sorted keys, trimmed whitespace) repeats 3 times consecutively, the loop breaks with `needsSummary = true`
4. **Same tool name detection (5x)**: If the same tool name is called 5 times consecutively (even with different args), the loop breaks
5. **Context trim at >40 messages or >70% budget**: `trimMessages()` triggers when message count exceeds 40 or estimated tokens exceed 70% of context window. Keeps first message (original prompt) and most recent messages
6. **Tool result capped at 30% context**: `calculateMaxToolResultChars()` limits any single tool result to 30% of context window, scaling down further under budget pressure. Minimum 1,000 chars
7. **Max 2 initial nudges / 2 mid-chain nudges**: Standard nudges (promisedAction, tooShort, wroteButDidntAct, askedInsteadOfActing) limited to 2. Mid-chain nudges (hallucinated tool results) also limited to 2
8. **Hallucination detection**: If model generates `[Tool Result]`, `<<tool_output>>`, or `<</tool_output>>` in its output after tools have been called, the content is stripped and a mid-chain nudge is injected
9. **Summary epilogue on abnormal break**: When the loop breaks due to repeat detection, same-tool detection, or max iterations, a final tools-disabled inference call produces a summary
10. **Council sessions get no tools**: Deliberation sessions (member, discusser, reviewer) disable all tools and get reasoning-only system prompts
11. **Token estimation**: Uses content-aware estimation: ~0.33 tokens/char for code-heavy content, ~0.25 tokens/char for prose
12. **Smart trimming with summaries**: When trimming messages, discarded tool results are replaced with one-line summaries instead of being dropped entirely

## Behavioral Examples

### Scenario: Normal tool loop completion

- **Given** a user prompt requiring 3 tool calls
- **When** the model makes 3 tool calls and then responds with text
- **Then** the loop exits after the text response
- **And** the slot is released

### Scenario: Repeat detection breaks loop

- **Given** a model stuck calling `read_file("index.ts")` repeatedly
- **When** the same normalized call appears 3 times consecutively
- **Then** the loop breaks
- **And** a summary epilogue is generated with tools disabled

### Scenario: Hallucination mid-chain nudge

- **Given** the model has called tools successfully
- **When** the model generates fake `<<tool_output>>` tags in its text
- **Then** the hallucinated content is NOT added to messages
- **And** a nudge message instructs the model to call tools properly

### Scenario: Council deliberation (no tools)

- **Given** a session with `councilRole = 'member'`
- **When** `startDirectProcess` is called
- **Then** `directTools` is empty
- **And** the system prompt uses reasoning-only instructions

### Scenario: Abort during slot wait

- **Given** an agent waiting for a slot
- **When** `kill()` is called
- **Then** `aborted = true` and `abortController.abort()` fires
- **And** if slot was never acquired, no `releaseSlot` is called
- **And** if slot was acquired before abort, `releaseSlot` is called in finally

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Provider error mid-loop | Error event emitted, `onExit(1)` called. Slot released via finally |
| Abort during slot wait | Process exits cleanly, slot released only if acquired |
| Tool execution timeout | Error text added to messages, loop continues |
| Tool unsupported by model | Tools disabled for session, retry without tools |
| Unknown tool name | Error text `Unknown tool: <name>` added to messages |
| Permission denied | Denied text added to messages, loop continues |
| External MCP connection failure | Logged, process continues without external tools |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/providers/types.ts` | `LlmProvider`, `LlmToolCall` |
| `server/providers/ollama/tool-prompt-templates.ts` | `getToolInstructionPrompt`, `getResponseRoutingPrompt`, `getCodingToolPrompt`, `detectModelFamily` |
| `server/mcp/direct-tools.ts` | `buildDirectTools`, `toProviderTools`, `DirectToolDefinition` |
| `server/mcp/coding-tools.ts` | `CodingToolContext`, `buildSafeEnvForCoding` |
| `server/mcp/external-client.ts` | `ExternalMcpClientManager` |
| `server/process/approval-manager.ts` | `ApprovalManager` |
| `server/process/approval-types.ts` | `ApprovalRequest`, `ApprovalRequestWire`, `formatToolDescription` |
| `server/process/types.ts` | `ClaudeStreamEvent` |
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `startDirectProcess` — called for all direct-mode provider sessions |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OLLAMA_NUM_CTX` | `8192` | Context window size for budget calculations |

Internal constants:

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_TOOL_ITERATIONS` | `25` | Maximum agentic loop iterations |
| `MAX_MESSAGES` | `40` | Message count trim trigger |
| `KEEP_RECENT` | `30` | Messages to keep after count-based trim |
| `MAX_REPEATS` | `2` | Break after same call repeated 3x (0-indexed) |
| `MAX_SAME_TOOL` | `4` | Break after same tool name 5x (0-indexed) |
| `MAX_NUDGES` | `2` | Max initial nudge attempts |
| `MAX_MID_CHAIN_NUDGES` | `2` | Max hallucination nudge attempts |
| `nextPseudoPid` | `800000` | Starting pseudo-PID counter |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
