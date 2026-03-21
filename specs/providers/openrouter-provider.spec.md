---
module: openrouter-provider
version: 1
status: draft
files:
  - server/providers/openrouter/provider.ts
db_tables: []
depends_on:
  - specs/providers/provider-system.spec.md
---

# OpenRouter Provider

## Purpose

Concrete LLM provider implementation for the OpenRouter API, extending `BaseLlmProvider` to route completion requests through OpenRouter's OpenAI-compatible chat completions endpoint. Supports both streaming and non-streaming completions, tool calling, and model discovery across multiple upstream providers (OpenAI, Google, DeepSeek, Mistral, Cohere, Qwen).

## Public API

### Exported Functions

(none)

### Exported Types

(none)

### Exported Classes

| Class | Description |
|-------|-------------|
| `OpenRouterProvider` | Concrete provider for OpenRouter models; extends `BaseLlmProvider` with `type: 'openrouter'` and `executionMode: 'direct'` |

#### OpenRouterProvider Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getInfo` | (none) | `LlmProviderInfo` | Returns provider metadata: name `'OpenRouter'`, 11 supported models, default model `'openai/gpt-4o'`, supportsTools and supportsStreaming both `true` |
| `complete` (inherited) | `params: LlmCompletionParams` | `Promise<LlmCompletionResult>` | Validates params then delegates to `doComplete()` (inherited from `BaseLlmProvider`) |
| `isAvailable` | (none) | `Promise<boolean>` | Returns `true` if `OPENROUTER_API_KEY` environment variable is set |
| `listModels` | (none) | `Promise<Array<{ id, name, pricing, context_length }>>` | Proxies OpenRouter's `/api/v1/models` endpoint for dashboard model discovery; returns empty array on error |

#### OpenRouterProvider Properties

| Property | Type | Value | Description |
|----------|------|-------|-------------|
| `type` | `LlmProviderType` | `'openrouter'` | Provider type identifier |
| `executionMode` | `ExecutionMode` | `'direct'` | Execution mode (direct HTTP fetch, no SDK) |

## Invariants

1. All requests include `HTTP-Referer: https://corvidlabs.com` and `X-Title: CorvidAgent` headers as required by OpenRouter's terms.
2. System prompt is sent as a message with `role: 'system'` (first message), not as a separate parameter.
3. Tool role messages include `tool_call_id` for proper function result routing.
4. `maxTokens` defaults to `1024` when not specified in `LlmCompletionParams`.
5. Streaming uses SSE (`data: ` prefix lines) with `[DONE]` sentinel; tool call fragments are accumulated by index and parsed on completion.
6. `isAvailable()` is a synchronous check of the environment variable (no network call).
7. `listModels()` uses a 10-second timeout and returns empty array on any error.
8. The provider does not implement `acquireSlot`/`releaseSlot` (no concurrency gating).

## Behavioral Examples

### Scenario: Successful non-streaming completion
- **Given** `OPENROUTER_API_KEY` is set
- **When** `complete({ model: 'openai/gpt-4o', systemPrompt: '...', messages: [{ role: 'user', content: 'Hello' }] })` is called
- **Then** sends POST to `https://openrouter.ai/api/v1/chat/completions`, parses the first choice, and returns `{ content, model, usage }` in normalized format

### Scenario: Streaming completion with tool calls
- **Given** `OPENROUTER_API_KEY` is set and `onStream` callback provided
- **When** `complete(...)` is called with tools defined
- **Then** streams SSE chunks, accumulates tool call fragments by index, invokes `onStream` for content deltas, and returns assembled tool calls in the result

### Scenario: No API key configured
- **Given** no `OPENROUTER_API_KEY` in environment
- **When** `doComplete()` is called
- **Then** throws `Error('OPENROUTER_API_KEY is not configured')`

### Scenario: Model discovery
- **Given** `OPENROUTER_API_KEY` is set
- **When** `listModels()` is called
- **Then** fetches from `https://openrouter.ai/api/v1/models` and returns array of model objects with id, name, pricing, and context_length

## Error Cases

| Condition | Behavior |
|-----------|----------|
| No model provided | `ValidationError` thrown by inherited `complete()` |
| Empty messages array | `ValidationError` thrown by inherited `complete()` |
| No API key at runtime | `Error` thrown in `doComplete()`: "OPENROUTER_API_KEY is not configured" |
| API returns non-OK status | `Error` thrown with status code and response body |
| API returns no choices | `Error` thrown: "OpenRouter returned no choices" |
| No streaming body | `Error` thrown: "OpenRouter returned no streaming body" |
| Malformed SSE line | Silently skipped (caught in stream parser) |
| Malformed tool call arguments | Warning logged, tool call omitted from result |
| `listModels()` network error | Warning logged, returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `provider-system` | `BaseLlmProvider` base class; `LlmProviderType`, `ExecutionMode`, `LlmCompletionParams`, `LlmCompletionResult`, `LlmProviderInfo`, `LlmToolDefinition`, `LlmToolCall` types |
| `lib/logger` | `createLogger` for warning-level logs |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/bootstrap.ts` | `OpenRouterProvider` class is instantiated and registered with `LlmProviderRegistry` |
| `server/routes/openrouter.ts` | `OpenRouterProvider` cast from registry for `listModels()` calls |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | corvid-agent | Initial spec |
