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
| `ModelFamily` | Union: `'llama' \| 'qwen2' \| 'qwen3' \| 'mistral' \| 'command-r' \| 'hermes' \| 'nemotron' \| 'phi' \| 'gemma' \| 'deepseek' \| 'unknown'` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `detectModelFamily` | `(modelName: string)` | `ModelFamily` | Identify family from model name |
| `getToolInstructionPrompt` | `(family, toolNames, toolDefs?)` | `string` | Full tool instructions for system prompt |
| `getResponseRoutingPrompt` | `()` | `string` | When to use corvid_send_message vs text |
| `getCodingToolPrompt` | `()` | `string` | File operation guidelines |

## Invariants

1. **All families get common tool instructions**: Every model, regardless of family, receives the common tool instructions block (available tools list, 5 rules for tool calls)
2. **Text-based families get full schemas in prompt**: Families in `TEXT_BASED_FAMILIES` (currently qwen3) receive formatted parameter schemas so models know exact argument names
3. **Qwen3 gets JSON array format instructions**: Qwen3's family-specific prompt specifies `[{"name":"...","arguments":{...}}]` format, warns against code fences, and instructs one-tool-at-a-time calling
4. **Qwen3 anti-hallucination instructions**: Qwen3 prompt explicitly warns: no code fences around JSON, no prose before tool calls, no inventing tool names, never generate fake tool results
5. **Response routing only when corvid_send_message present**: `getResponseRoutingPrompt()` is only appended when `corvid_send_message` is in the tool names list
6. **Coding guidance only when read_file present**: `getCodingToolPrompt()` is only appended when `read_file` is in the tool names list
7. **All supported families get guidance**: Every recognized family (llama, qwen2, qwen3, mistral, command-r, hermes, nemotron, phi, gemma, deepseek) receives family-specific prompt guidance. Only `unknown` returns null
8. **Dynamic few-shot example**: Family-specific prompts for phi, gemma, and deepseek include a few-shot example using the first available tool name from the tool list

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
| `server/process/direct-process.ts` | `getToolInstructionPrompt`, `getResponseRoutingPrompt`, `getCodingToolPrompt`, `detectModelFamily` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-20 | corvid-agent | Initial spec |
