---
module: strip-conversation-history
version: 2
status: active
files:
  - server/lib/strip-conversation-history.ts
db_tables: []
depends_on: []
---

# Strip Conversation History

## Purpose

Utility functions for processing conversation history: removing `<conversation_history>` XML blocks from message content to prevent recursive nesting, and extracting topic summaries from user messages for session completion observations.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `stripConversationHistory` | `(content: string)` | `string` | Remove all `<conversation_history>...</conversation_history>` blocks and trim surrounding whitespace |
| `extractConversationTopics` | `(messages: Array<{ role: string; content: string }>)` | `string[]` | Extract up to 3 topic keywords from user messages (first 2 words of each, min length 4 chars) |

## Invariants

- Plain text without `<conversation_history>` tags passes through unchanged
- Multiple `<conversation_history>` blocks in a single string are all removed
- Other HTML-like tags are preserved
- Result is always trimmed
- `extractConversationTopics` returns at most 3 topics
- `extractConversationTopics` strips conversation history tags before extracting topics
- `extractConversationTopics` deduplicates identical topic prefixes

## Behavioral Examples

- `"<conversation_history>old chat</conversation_history> new question"` → `"new question"`
- `"no tags here"` → `"no tags here"`
- `extractConversationTopics([{ role: 'user', content: 'How does AlgoChat work?' }])` → `['How does']`
- `extractConversationTopics([])` → `[]`

## Error Cases

No error cases — functions always return their expected types. Empty input returns empty string/array.

## Dependencies

None. Pure string utility with no external imports.

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 2 | 2026-04-24 | Add `extractConversationTopics` — topic extraction for session completion observations (#2148) |
| 1 | 2026-04-22 | Initial spec — extracted from `message-router.ts` to shared utility (#2122) |
