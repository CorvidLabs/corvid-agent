---
name: contacts
description: Use this skill when you need to look up a contact by name or platform ID to resolve cross-platform identities. Triggers include "who is", "find contact", "look up user", "resolve identity", "Discord ID", "GitHub username", or any request to identify someone across platforms.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Contacts — Cross-Platform Identity Lookup

Look up contacts to resolve identities across platforms (Discord, GitHub, AlgoChat, etc).

## MCP Tools

- `corvid_lookup_contact` — Look up a contact by name or platform ID
  - Parameters: `query` (name, username, or platform ID), `platform` (optional: "discord", "github", "algochat", "telegram")

## Examples

### Look up by name

```
Use corvid_lookup_contact:
  query: "leif"
```

### Look up by Discord ID

```
Use corvid_lookup_contact:
  query: "181969874455756800"
  platform: "discord"
```

## Notes

- Returns all known identities for the matched contact
- Useful for resolving "who said this" across Discord, GitHub, and AlgoChat
- Partial name matches are supported
