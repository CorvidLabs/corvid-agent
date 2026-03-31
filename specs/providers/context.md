# Providers — Context

## Why This Module Exists

corvid-agent supports multiple LLM providers — Anthropic (Claude), OpenAI, Ollama, and others. The provider system normalizes their APIs behind a common interface so the rest of the system can request completions without knowing which provider is being used.

## Architectural Role

Providers is the **LLM abstraction layer** — it sits between agent sessions and AI APIs, normalizing requests and responses.

## Key Design Decisions

- **Claude-first**: Anthropic Claude is the primary provider. Opus for councils/synthesis, Sonnet for execution, Haiku for routing and triage.
- **BaseLlmProvider pattern**: All providers extend a base class that handles common concerns (retry, rate limiting, token counting), with provider-specific subclasses for API differences.
- **Normalized results**: All providers return `LlmCompletionResult` regardless of their native response format.
- **Model dispatch**: The model dispatch system routes requests to the right provider based on the requested model.

## Relationship to Other Modules

- **Process Manager**: Agent sessions use providers for LLM completions.
- **Councils**: Different council stages use different model tiers.
- **Health**: Provider availability is part of health monitoring.
- **Agent Tiers (Lib)**: Tier definitions map to specific models and providers.
