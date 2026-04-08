---
module: anthropic-provider
version: 1
status: active
files:
  - server/providers/anthropic/provider.ts
db_tables: []
depends_on:
  - specs/providers/provider-system.spec.md
---

# Anthropic Provider

## Purpose

Concrete LLM provider implementation for the Anthropic Claude API, extending `BaseLlmProvider` to send completion requests via the `@anthropic-ai/sdk` package and return normalized results conforming to the provider system's `LlmCompletionResult` interface.

## Public API

### Exported Functions

(none)

### Exported Types

(none)

### Exported Classes

| Class | Description |
|-------|-------------|
| `AnthropicProvider` | Concrete provider for Anthropic Claude models; extends `BaseLlmProvider` with `type: 'anthropic'` and `executionMode: 'managed'` |

#### AnthropicProvider Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getInfo` | (none) | `LlmProviderInfo` | Returns provider metadata: name `'Anthropic'`, supported models, default model `'claude-sonnet-4-6'`, supportsTools and supportsStreaming both `true` |
| `complete` (inherited) | `params: LlmCompletionParams` | `Promise<LlmCompletionResult>` | Validates params then delegates to `doComplete()` (inherited from `BaseLlmProvider`) |
| `isAvailable` | (none) | `Promise<boolean>` | Dynamically imports `@anthropic-ai/sdk`, instantiates a client, and returns `true` if an API key is present |

#### AnthropicProvider Properties

| Property | Type | Value | Description |
|----------|------|-------|-------------|
| `type` | `LlmProviderType` | `'anthropic'` | Provider type identifier |
| `executionMode` | `ExecutionMode` | `'managed'` | Execution mode (SDK-managed completion) |
| `MODELS` (static, private) | `string[]` | `['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001']` | Supported model identifiers |
| `DEFAULT_MODEL` (static, private) | `string` | `'claude-sonnet-4-6'` | Default model when none specified |

## Invariants

1. The `@anthropic-ai/sdk` package is dynamically imported (lazy-loaded) only when `doComplete()` or `isAvailable()` is called, not at module load time.
2. Only messages with role `'user'` or `'assistant'` are forwarded to the Anthropic API; `'tool'` role messages are filtered out.
3. The system prompt is passed via the `system` parameter, not as a message.
4. `maxTokens` defaults to `1024` when not specified in `LlmCompletionParams`.
5. Response content is extracted by filtering for `text` type blocks and joining their text values.
6. Usage data (input/output tokens) is mapped from Anthropic's `input_tokens`/`output_tokens` to the normalized `inputTokens`/`outputTokens` format.
7. `isAvailable()` catches all errors and returns `false` if the SDK cannot be imported or no API key is configured.
8. The provider does not implement `acquireSlot`/`releaseSlot` (no concurrency gating).

## Behavioral Examples

### Scenario: Successful completion
- **Given** a valid `ANTHROPIC_API_KEY` is set in the environment
- **When** `complete({ model: 'claude-sonnet-4-6', systemPrompt: '...', messages: [{ role: 'user', content: 'Hello' }] })` is called
- **Then** the provider sends a `messages.create` request to Anthropic, extracts text blocks from the response, and returns `{ content, model, usage }` in normalized format

### Scenario: Missing model parameter
- **Given** any state
- **When** `complete({ model: '', systemPrompt: '...', messages: [...] })` is called
- **Then** `BaseLlmProvider.complete()` throws `ValidationError` before reaching `doComplete()`

### Scenario: No API key configured
- **Given** no `ANTHROPIC_API_KEY` in environment and SDK instantiates with `null` apiKey
- **When** `isAvailable()` is called
- **Then** returns `false` because `client.apiKey` is falsy

### Scenario: SDK import fails
- **Given** `@anthropic-ai/sdk` is not installed or cannot be loaded
- **When** `isAvailable()` is called
- **Then** the catch block returns `false`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No model provided | `ValidationError` thrown by inherited `complete()` |
| Empty messages array | `ValidationError` thrown by inherited `complete()` |
| No API key at runtime | Anthropic SDK throws auth error during `messages.create` |
| SDK not importable | `isAvailable()` returns `false`; `doComplete()` throws import error |
| API rate limit or server error | Error propagates to caller (handled by `FallbackManager` at the routing layer) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `provider-system` | `BaseLlmProvider` base class; `LlmProviderType`, `ExecutionMode`, `LlmCompletionParams`, `LlmCompletionResult`, `LlmProviderInfo` types |
| `@anthropic-ai/sdk` | `Anthropic` client (dynamically imported) for `messages.create()` API calls |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | `AnthropicProvider` class is instantiated and registered with `LlmProviderRegistry` |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
