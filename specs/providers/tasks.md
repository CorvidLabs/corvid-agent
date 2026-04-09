---
spec: provider-system.spec.md
---

## Active Tasks

- [ ] Investigate and fix Ollama/Cursor quality regression: improve tool-prompt template accuracy for non-native-tool models (#1500)
- [ ] Add OpenRouter model capability detection (tool support, vision, context window) analogous to `ModelCapabilityDetector` for Ollama
- [ ] Self-service provider configuration: allow operators to set Ollama URL, OpenRouter key, and Cursor concurrency via the dashboard (#1490)
- [ ] Expose provider health status (available/unavailable) in the `/api/health` response

## Completed Tasks

- [x] `AnthropicProvider` with lazy SDK import and normalized `LlmCompletionResult`
- [x] `OllamaProvider` with `ModelCapabilityDetector` (10-minute TTL cache, embedding model exclusion)
- [x] `CursorProvider` with slot-based concurrency (`CURSOR_MAX_CONCURRENT` = 4) and stream idle timeout
- [x] `OpenRouterProvider` normalizing OpenAI-compatible API responses
- [x] Tool prompt templates (`getToolInstructionPrompt`, `getCodingToolPrompt`) for models without native tool support
- [x] `getEffectiveContextLength` with 80% safety margin
