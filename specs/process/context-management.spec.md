---
module: context-management
version: 1
status: active
files:
  - server/process/context-management.ts
db_tables: []
depends_on: []
---

# Context Management

## Purpose

Context management helpers for direct-process sessions. Handles token estimation, context budget tracking, message trimming, and progressive compression tiers to keep conversations within the context window.

## Public API

### Exported Types

| Type | Description |
|------|-------------|
| `ConversationMessage` | Message shape with `role` (user/assistant/tool), `content`, optional `toolCallId` |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `estimateTokens` | `(text: string)` | `number` | Content-aware token estimation with three classes: structured data (~2.5 ch/tok), code (~3 ch/tok), prose (~4 ch/tok), with blended ratios for mixed content |
| `getContextBudget` | `(model?: string)` | `number` | Get the context window size: checks model pricing table first, falls back to `OLLAMA_NUM_CTX` env var, then DEFAULT_CONTEXT_WINDOW (128000) |
| `isContextOverflowError` | `(errorMsg: string)` | `boolean` | Detect whether an error message indicates a context overflow from any provider (Anthropic, OpenAI, Ollama, OpenRouter) |
| `calculateMaxToolResultChars` | `(messages: Array<{role, content}>, systemPrompt: string)` | `number` | Max tool result size in chars: capped at 30% of context window, scales down under pressure. Min 1000 chars |
| `truncateCouncilContext` | `(messages: ConversationMessage[], systemPrompt: string)` | `void` | Truncate council synthesis messages if they exceed 70% of context window. Keeps first user message + last 4 messages |
| `compressToolResults` | `(messages: ConversationMessage[], maxAge: number, maxChars: number)` | `number` | Compress tool result messages in-place by truncating content older than `maxAge` positions to at most `maxChars`. Returns count of compressed messages |
| `summarizeConversation` | `(messages: Array<{role, content}>)` | `string` | Generate a brief plain-text summary of conversation key points. Used for Tier 4 compression and context reset |
| `truncateOldToolResults` | `(messages: ConversationMessage[], ageThreshold: number, maxChars: number)` | `number` | Post-trim pass that truncates tool results older than `ageThreshold` positions to at most `maxChars`. Returns count of truncated messages |
| `summarizeConsumedToolResults` | `(messages: ConversationMessage[], minSizeChars?: number, recentWindow?: number)` | `number` | Proactively summarize large tool results that have been consumed by a subsequent assistant response. Returns count of summarized messages |
| `trimMessages` | `(messages: ConversationMessage[], systemPrompt?: string, model?: string)` | `void` | Trim conversation history using progressive compression tiers based on context usage and message count |
| `computeContextUsage` | `(msgs: Array<{role, content}>, sysPrompt: string, trimmed: boolean, model?: string)` | `{estimatedTokens, contextWindow, usagePercent, messagesCount, trimmed}` | Compute context usage metrics for the current message state |
| `determineWarningLevel` | `(usagePercent: number)` | `{level, message} \| null` | Determine warning level and message for a given usage percent. Returns null below 50% |

## Invariants

1. **Token estimation heuristic**: Three content classes — structured data (>50% JSON/YAML patterns) at ~2.5 ch/tok, code-heavy (>12% code chars) at ~3 ch/tok, prose at ~4 ch/tok, with blended ratios for mixed content (5-12% code range)
2. **Tool result capped at 30% context**: `calculateMaxToolResultChars()` limits any single tool result to 30% of context window, scaling down further under budget pressure. Minimum 1,000 chars
3. **Progressive compression tiers**: Proactive (60%) summarize consumed tool results, Tier 1 (70%) light tool summarization, Tier 2 (80%) reduce window + summarize discarded, Tier 3 (88%) aggressive 4-exchange keep, Tier 4 (93%) full summary + 2 exchanges
4. **Count-based trim at >40 messages**: `trimMessages()` triggers Tier 2 when message count exceeds `MAX_MESSAGES` (40)
5. **Council context truncation**: `truncateCouncilContext()` triggers at 70% of `OLLAMA_NUM_CTX` (default 16384), keeping first user message + last 4 messages
6. **Warning thresholds**: 50% (info), 70% (warning), 85% (critical)

## Behavioral Examples

### Scenario: Tier 1 light compression

- **Given** context usage is between 70% and 80%
- **When** `trimMessages()` is called
- **Then** tool results older than 5 messages are compressed to 200 chars max

### Scenario: Tier 4 full summary

- **Given** context usage exceeds 93%
- **When** `trimMessages()` is called
- **Then** all messages are replaced with a context summary + last 2 exchanges (4 messages)

### Scenario: Council context truncation

- **Given** a council session with messages exceeding 70% of context budget
- **When** `truncateCouncilContext()` is called
- **Then** messages are reduced to first user message + last 4 messages

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty text to `estimateTokens` | Returns 0 |
| No messages to trim | No-op, returns without modification |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/lib/logger.ts` | `createLogger` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/direct-process.ts` | Re-exports `compressToolResults`, `summarizeConversation`, `truncateOldToolResults`, `computeContextUsage`, `determineWarningLevel`; uses `estimateTokens`, `getContextBudget`, `calculateMaxToolResultChars`, `truncateCouncilContext`, `trimMessages` |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `OLLAMA_NUM_CTX` | `8192` | Context window size for budget calculations (16384 for council truncation) |

Internal constants:

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_MESSAGES` | `40` | Message count trim trigger |
| `KEEP_RECENT` | `30` | Messages to keep after count-based trim |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-21 | corvid-agent | Initial spec — extracted from direct-process |
