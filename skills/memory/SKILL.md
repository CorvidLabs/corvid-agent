---
name: memory
description: Use this skill when the user wants to save, recall, or search agent memories. Memories are encrypted and stored on the Algorand blockchain, persisting across sessions. Triggers include "remember this", "save a memory", "recall", "what did I save", "agent memory", "on-chain memory", "persistent storage".
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Memory — On-Chain Agent Memory

Store and retrieve encrypted memories on the Algorand blockchain. Memories persist across sessions with local caching for fast access.

## MCP Tools

- `corvid_save_memory` — Save a memory with a key and value
  - Parameters: `key` (descriptive name), `content` (content to store)
- `corvid_recall_memory` — Retrieve memories
  - Parameters: `key` (exact lookup), `query` (search), or `action: "list"` (recent entries)

## Examples

### Save preferences

```
Use corvid_save_memory:
  key: "project-preferences"
  value: "Always use bun, prefer functional style, test with vitest"
```

### Recall by key

```
Use corvid_recall_memory with key "project-preferences"
```

### Search memories

```
Use corvid_recall_memory with query "deployment" to find related memories
```

## Notes

- Memories are encrypted before on-chain storage
- Local cache provides fast reads
- Use descriptive, namespaced keys (e.g., `project/setting-name`)
