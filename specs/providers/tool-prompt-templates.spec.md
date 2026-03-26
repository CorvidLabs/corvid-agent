---
module: tool-prompt-templates
version: 1
status: active
files:
  - server/providers/ollama/tool-prompt-templates.ts
db_tables: []
depends_on: []
---

# Tool Prompt Templates

## Purpose

Model-family-specific prompt templates for tool usage and response routing. Different model families have varying tool-calling competence; this module provides tailored system prompt sections that help models understand tool call format, chaining behavior, and response routing rules.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ModelFamily` | Union: `'llama' \| 'qwen2' \| 'qwen3' \| 'mistral' \| 'command-r' \| 'hermes' \| 'nemotron' \| 'phi' \| 'gemma' \| 'deepseek' \| 'minimax' \| 'glm' \| 'kimi' \| 'devstral' \| 'gemini' \| 'unknown'` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `detectModelFamily` | `(modelName: string)` | `ModelFamily` | Identify family from model name |
| `getToolInstructionPrompt` | `(family, toolNames, toolDefs?)` | `string` | Full tool instructions for system prompt |
| `getResponseRoutingPrompt` | `()` | `string` | When to use corvid_send_message vs text |
| `getCodingToolPrompt` | `()` | `string` | File operation guidelines |
| `getCodebaseContextPrompt` | `()` | `string` | Project structure and orientation context for agents |
| `getMessagingSafetyPrompt` | `()` | `string` | Prevent script-based message sending |
| `getWorktreeIsolationPrompt` | `()` | `string` | Git branch isolation rules for worktree sessions |
| `getCompactToolInstructionPrompt` | `(family, toolNames, toolDefs?)` | `string` | Reduced-token tool instructions for cloud-proxied models |
| `getCompactResponseRoutingPrompt` | `()` | `string` | Compact response routing rules for cloud-proxied models |
| `getCompactCodingToolPrompt` | `()` | `string` | Compact coding tool guidelines for cloud-proxied models |

## Invariants

1. **All families get common tool instructions**: Every model, regardless of family, receives the common tool instructions block (available tools list, 8 rules for tool calls)
2. **Text-based families get full schemas in prompt**: Families in `TEXT_BASED_FAMILIES` (currently qwen3, kimi, minimax, gemini, glm, devstral, nemotron) receive formatted parameter schemas so models know exact argument names
3. **Qwen3 gets JSON array format instructions**: Qwen3's family-specific prompt specifies `[{"name":"...","arguments":{...}}]` format, warns against code fences, and instructs one-tool-at-a-time calling
4. **Qwen3 anti-hallucination instructions**: Qwen3 prompt explicitly warns: no code fences around JSON, no prose before tool calls, no inventing tool names, never generate fake tool results
5. **Response routing only when corvid_send_message present**: `getResponseRoutingPrompt()` is only appended when `corvid_send_message` is in the tool names list
6. **Coding guidance only when read_file present**: `getCodingToolPrompt()` and `getCodebaseContextPrompt()` are only appended when `read_file` is in the tool names list
7. **Messaging safety always appended**: `getMessagingSafetyPrompt()` is always appended when tools are available (in `direct-process.ts`) or unconditionally to append content (in `sdk-process.ts`), preventing agents from writing scripts to send messages outside of MCP tools. This is an always-on guard -- unlike response routing (conditional on `corvid_send_message`) or coding guidance (conditional on `read_file`), messaging safety is never gated on specific tool presence
8. **All supported families get guidance**: Every recognized family (llama, qwen2, qwen3, mistral, command-r, hermes, nemotron, phi, gemma, deepseek, minimax, glm, kimi, devstral, gemini) receives family-specific prompt guidance. Only `unknown` returns null
9. **Dynamic few-shot example**: Family-specific prompts for phi, gemma, and deepseek include a few-shot example using the first available tool name from the tool list
10. **Worktree isolation always appended**: `getWorktreeIsolationPrompt()` is unconditionally appended to both SDK and direct process system prompts, instructing the agent to stay on its own branch and not interact with other sessions' branches
11. **Codebase context appended for Ollama agents**: `getCodebaseContextPrompt()` is appended in `direct-process.ts` to give Ollama-backed agents basic orientation about project structure, runtime, and common commands
12. **Cloud models use compact prompts**: Cloud-proxied models (detected by `OllamaProvider.isCloudModel()`) receive compact prompt variants (`getCompactToolInstructionPrompt`, `getCompactResponseRoutingPrompt`, `getCompactCodingToolPrompt`) that preserve essential rules while reducing token count to stay within cloud proxy server-side timeouts (~90s). Messaging safety is folded into compact tool instructions rule #5. `getCodebaseContextPrompt()` is skipped for cloud models

## Behavioral Examples

### Scenario: Qwen3 model gets text-based instructions

- **Given** `family = 'qwen3'` and `toolDefs` has 5 tools
- **When** `getToolInstructionPrompt` is called
- **Then** output includes common instructions, formatted tool schemas, and qwen3-specific JSON array format guidance

### Scenario: Phi model gets basic guidance

- **Given** `family = 'phi'` and `toolNames = ['read_file', 'run_command']`
- **When** `getToolInstructionPrompt` is called
- **Then** output includes common instructions and phi-specific tool guidance with a few-shot example using `read_file`

### Scenario: Unknown model family

- **Given** `family = 'unknown'`
- **When** `getToolInstructionPrompt` is called
- **Then** output includes only common tool instructions (no family-specific section)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty toolNames array | Common instructions show empty tool list |
| Unrecognized model name | `detectModelFamily` returns `'unknown'` |
| No toolDefs provided to text-based family | Schema section is skipped |

## Dependencies

### Consumes

None (standalone module).

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/direct-process.ts` | `getToolInstructionPrompt`, `getCompactToolInstructionPrompt`, `getResponseRoutingPrompt`, `getCompactResponseRoutingPrompt`, `getCodingToolPrompt`, `getCompactCodingToolPrompt`, `getCodebaseContextPrompt`, `getMessagingSafetyPrompt`, `getWorktreeIsolationPrompt`, `detectModelFamily` |
| `server/process/sdk-process.ts` | `getMessagingSafetyPrompt`, `getResponseRoutingPrompt`, `getWorktreeIsolationPrompt` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
