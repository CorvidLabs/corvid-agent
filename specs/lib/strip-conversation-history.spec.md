---
module: strip-conversation-history
version: 1
status: active
files:
  - server/lib/strip-conversation-history.ts
db_tables: []
depends_on: []
---

# Strip Conversation History

## Purpose

Utility function that removes `<conversation_history>` XML blocks from message content to prevent recursive nesting when conversation context is injected into prompts. Without stripping, resumed sessions accumulate nested history blocks that waste tokens and confuse agents.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `stripConversationHistory` | `(content: string)` | `string` | Remove all `<conversation_history>...</conversation_history>` blocks and trim surrounding whitespace |

## Invariants

- Plain text without `<conversation_history>` tags passes through unchanged
- Multiple `<conversation_history>` blocks in a single string are all removed
- Other HTML-like tags are preserved
- Result is always trimmed

## Behavioral Examples

- `"<conversation_history>old chat</conversation_history> new question"` → `"new question"`
- `"no tags here"` → `"no tags here"`

## Error Cases

No error cases — the function always returns a string. Empty input returns empty string.

## Dependencies

None. Pure string utility with no imports.

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| 1 | 2026-04-22 | Initial spec — extracted from `message-router.ts` to shared utility (#2122) |
