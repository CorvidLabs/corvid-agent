---
module: discord-contact-linker
version: 1
status: draft
files:
  - server/discord/contact-linker.ts
depends_on:
  - specs/db/agents/contacts.spec.md
---

# Discord Contact Linker

## Purpose

Auto-links Discord users to cross-platform contacts. On each incoming message, resolves or creates a contact record for the Discord author, linking their Discord ID to the unified contact identity system. Uses an in-memory cache to avoid DB lookups on every message.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveDiscordContact` | `db: Database, authorId: string, username: string` | `string \| null` | Resolves or creates a contact for a Discord user. Returns the contact ID or null on error |

### Exported Constants

| Constant | Type | Value | Description |
|----------|------|-------|-------------|
| `CONTACT_CACHE_TTL` | `number` | `300000` (5 minutes) | Cache TTL in milliseconds |
| `contactCache` | `Map<string, CachedContact>` | (empty map) | In-memory cache of resolved contacts |

## Invariants

1. Cache entries expire after `CONTACT_CACHE_TTL` milliseconds (5 minutes).
2. The function checks cache first, then DB, then creates a new contact if none exists.
3. All contacts are created under the `'default'` tenant ID.
4. When a new contact is created, a platform link for `'discord'` is also added.
5. The cache is populated on every successful resolution (cache hit refreshes are excluded; only cache misses update the cache).
6. The `contactCache` map is exported and can be cleared externally.

## Behavioral Examples

### Scenario: Cached contact

- **Given** `contactCache` has an entry for `authorId = "123"` with `resolvedAt` within TTL
- **When** `resolveDiscordContact(db, "123", "alice")` is called
- **Then** returns the cached contact ID without any DB queries

### Scenario: Existing contact in DB

- **Given** cache has no entry for `authorId = "456"` but a contact with platform link `discord:456` exists in the DB
- **When** `resolveDiscordContact(db, "456", "bob")` is called
- **Then** returns the existing contact ID and populates the cache

### Scenario: New contact creation

- **Given** no cached or DB contact exists for `authorId = "789"`
- **When** `resolveDiscordContact(db, "789", "charlie")` is called
- **Then** creates a new contact with name `"charlie"`, adds a Discord platform link, populates the cache, and returns the new contact ID

### Scenario: Cache expiry

- **Given** cache has an entry for `authorId = "123"` with `resolvedAt` older than `CONTACT_CACHE_TTL`
- **When** `resolveDiscordContact(db, "123", "alice")` is called
- **Then** bypasses the cache and performs a DB lookup

## Error Cases

| Condition | Behavior |
|-----------|----------|
| DB error during contact lookup or creation | Error propagates (no explicit try/catch in this module) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `server/db/contacts` | `findContactByPlatformId`, `createContact`, `addPlatformLink` |
| `server/lib/logger` | `createLogger('DiscordContactLinker')` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/discord/message-handler.ts` | `resolveDiscordContact` for auto-linking Discord users to contacts |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-16 | corvid-agent | Initial spec |
