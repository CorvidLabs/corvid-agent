---
spec: provider-system.spec.md
---

## User Stories

- As an agent operator, I want the platform to support multiple LLM providers (Anthropic, Ollama, OpenRouter, Cursor) so that I can choose the best model for each task based on cost and capability
- As a team agent, I want my provider to be automatically selected based on my configuration so that I do not need to manually specify which backend to use for each session
- As an agent developer, I want all providers to return a normalized `LlmCompletionResult` so that downstream code does not need provider-specific handling
- As a platform administrator, I want to detect Ollama model capabilities (tool support, vision, context window) automatically so that agents are only assigned models that can handle their workload
- As an agent operator, I want the Cursor provider to enforce concurrency limits via slot-based scheduling so that the system does not spawn too many cursor-agent processes simultaneously
- As a team agent, I want tool-use instructions injected into my system prompt when my model does not natively support tools so that I can still use file I/O and search capabilities

## Acceptance Criteria

- `AnthropicProvider.isAvailable` dynamically imports `@anthropic-ai/sdk` and returns `true` only when an API key is present; returns `false` on any error
- `AnthropicProvider.doComplete` filters out `tool` role messages, passes system prompt via the `system` parameter, defaults `maxTokens` to 1024, and maps usage to normalized `inputTokens`/`outputTokens`
- `OllamaProvider` returns `supportsTools: true` only for models where `ModelCapabilityDetector.canUseTools` confirms tool support
- `ModelCapabilityDetector` caches capabilities per model with a 10-minute TTL and falls back to name-based inference when `/api/show` fails
- `ModelCapabilityDetector.getEffectiveContextLength` returns `floor(contextLength * 0.8)` to provide a safety margin
- Embedding models (matching patterns: `embed`, `nomic`, `mxbai`, `all-minilm`, `snowflake`, `bge`) always have `supportsTools` set to `false`
- `CursorProvider.acquireSlot` queues callers when all slots are occupied (default `CURSOR_MAX_CONCURRENT` = 4) and resolves when a slot opens; abort signals remove waiters from the queue
- `CursorProvider.isAvailable` runs `cursor-agent --version` and returns `true` only on exit code 0
- `OpenRouterProvider` normalizes responses from the OpenAI-compatible API into the platform's `LlmCompletionResult` format
- Tool prompt templates (`getToolInstructionPrompt`, `getCodingToolPrompt`) generate model-family-specific instructions for models without native tool support
- `BaseLlmProvider.complete` throws `ValidationError` when model or messages are missing before delegating to `doComplete`

## Constraints

- Anthropic SDK is lazy-loaded (dynamically imported) only on first use, not at module load time
- Cursor provider has a configurable completion timeout (default 15 minutes via `CURSOR_COMPLETION_TIMEOUT`) and stream idle timeout (default 120s via `CURSOR_STREAM_IDLE_TIMEOUT`)
- Ollama model capability detection queries are cached for 10 minutes to avoid excessive `/api/show` calls
- Provider slot counts for Cursor never go negative (clamped to 0 on release)
- All providers must implement `getInfo`, `isAvailable`, and `doComplete` as defined by the `LlmProvider` interface

## Out of Scope

- Model cost tracking and billing (handled by the credits subsystem and cost-table)
- Session-level provider routing and fallback chains (handled by the process manager and model dispatch)
- Streaming event parsing and session lifecycle (handled by the process module)
- Multi-tenant provider configuration
