---
name: search
description: Use this skill when the user wants to search the web, research a topic, or find current information online. Triggers include "search for", "look up", "find out about", "research", "what's the latest on", "web search", or any request requiring up-to-date information beyond your training data.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Search — Web Search & Deep Research

Search the web for current information or conduct multi-angle deep research on complex topics.

## MCP Tools

- `corvid_web_search` — Search the web using Brave Search
  - Parameters: `query` (search terms), `freshness` (optional: "day", "week", "month"), `count` (optional, number of results)
- `corvid_deep_research` — Research a topic in depth via multiple angled web searches
  - Parameters: `query` (research topic), `depth` (optional: "shallow", "medium", "deep")

## Workflow

1. For quick factual lookups, use `corvid_web_search` with a focused query
2. For complex topics requiring multiple perspectives, use `corvid_deep_research`
3. Use `freshness` to filter results by recency when timeliness matters

## Examples

### Quick search

```
Use corvid_web_search:
  query: "Algorand AVM 11 release date"
  freshness: "month"
```

### Deep research

```
Use corvid_deep_research:
  query: "Current state of AI agent frameworks and protocols in 2026"
  depth: "deep"
```

## Notes

- Web search returns snippets and URLs — cite sources when sharing results
- Deep research takes longer but produces more comprehensive analysis
- Use freshness filters to avoid stale results for time-sensitive queries
