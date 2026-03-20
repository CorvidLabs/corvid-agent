---
module: ollama-complexity-warning
version: 1
status: draft
files:
  - server/lib/ollama-complexity-warning.ts
db_tables: []
depends_on:
  - specs/providers/provider-system.spec.md
---

# Ollama Complexity Warning

## Purpose

Stateless, deterministic heuristic that emits an advisory warning when a user selects an Ollama (local) model for a task detected as complex or expert-level. The warning is purely advisory — callers must NOT block task execution based on this result. Designed to surface at session creation time so users can reconsider their model choice before work begins.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isOllamaProvider` | `(provider: string \| undefined)` | `boolean` | Returns `true` when the provider string is `"ollama"`. |
| `buildOllamaComplexityWarning` | `(prompt: string, model: string, provider: string \| undefined)` | `string \| null` | Returns an advisory warning string when provider is Ollama and task complexity is `"complex"` or `"expert"`. Returns `null` otherwise. |

## Invariants

1. `buildOllamaComplexityWarning` always returns `null` when `provider` is not `"ollama"`.
2. `buildOllamaComplexityWarning` always returns `null` when `prompt` is empty or whitespace-only.
3. `buildOllamaComplexityWarning` always returns `null` when complexity level is `"simple"` or `"moderate"`.
4. When a warning is returned, it includes the model name, the detected complexity level, and a suggestion to upgrade to a Claude tier.
5. No credentials, mnemonics, API keys, or wallet data are read or stored by any function in this module.
6. Both functions are stateless and produce identical output for identical inputs (deterministic).

## Behavioral Examples

### Scenario: Ollama model with a complex prompt

- **Given** provider is `"ollama"`, model is `"llama3.3"`, prompt contains multiple complexity keywords
- **When** `buildOllamaComplexityWarning` is called
- **Then** a non-null advisory string is returned containing the model name and a Claude upgrade suggestion

### Scenario: Ollama model with a simple prompt

- **Given** provider is `"ollama"`, model is `"llama3.3"`, prompt is `"list files"`
- **When** `buildOllamaComplexityWarning` is called
- **Then** `null` is returned (no warning for simple tasks)

### Scenario: Non-Ollama provider with complex prompt

- **Given** provider is `"anthropic"`, model is `"claude-sonnet-4-6"`, prompt is highly complex
- **When** `buildOllamaComplexityWarning` is called
- **Then** `null` is returned (warning only applies to Ollama)

### Scenario: Ollama model with empty prompt

- **Given** provider is `"ollama"`, model is `"llama3.3"`, prompt is `""`
- **When** `buildOllamaComplexityWarning` is called
- **Then** `null` is returned (no prompt means no complexity signal)

### Scenario: isOllamaProvider with "ollama"

- **Given** provider string is `"ollama"`
- **When** `isOllamaProvider` is called
- **Then** returns `true`

### Scenario: isOllamaProvider with non-Ollama values

- **Given** provider string is `"anthropic"`, `"openai"`, or `undefined`
- **When** `isOllamaProvider` is called
- **Then** returns `false`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `provider` is `undefined` | `isOllamaProvider` returns `false`; `buildOllamaComplexityWarning` returns `null` |
| `prompt` is empty string | Returns `null` |
| `prompt` is whitespace only | Returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/providers/router` | `estimateComplexity`, `ComplexityLevel` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/sessions.ts` | `buildOllamaComplexityWarning` — called at session creation time |

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-03-19 | Initial spec — advisory warning for Ollama + complex task combinations (fixes #1019). |
