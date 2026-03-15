---
module: contacts
version: 1
status: draft
files:
  - server/db/contacts.ts
db_tables:
  - contacts
  - contact_platform_links
depends_on:
  - specs/db/migrations.spec.md
---

# Contacts

## Purpose

Cross-platform contact identity mapping. Provides CRUD operations for unified contact records that link Discord IDs, AlgoChat addresses, and GitHub handles so the agent can resolve identities across platforms. Each contact belongs to a tenant and can have multiple platform links, each optionally verified.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createContact` | `db: Database, tenantId: string, displayName: string, notes?: string \| null` | `Contact` | Creates a new contact with a random UUID and returns it with links |
| `getContact` | `db: Database, tenantId: string, contactId: string` | `Contact \| null` | Retrieves a contact by ID within a tenant, including all platform links |
| `listContacts` | `db: Database, tenantId: string, opts?: { search?, limit?, offset? }` | `{ contacts: Contact[]; total: number }` | Lists contacts with optional name search, pagination (max 500 per page) |
| `updateContact` | `db: Database, tenantId: string, contactId: string, updates: { displayName?, notes? }` | `Contact \| null` | Updates display name and/or notes; returns null if contact not found |
| `deleteContact` | `db: Database, tenantId: string, contactId: string` | `boolean` | Deletes a contact and cascading links; returns true if a row was deleted |
| `addPlatformLink` | `db: Database, tenantId: string, contactId: string, platform: ContactPlatform, platformId: string` | `PlatformLink` | Adds a platform identity link to a contact |
| `removePlatformLink` | `db: Database, tenantId: string, linkId: string` | `boolean` | Removes a platform link by ID; returns true if a row was deleted |
| `verifyPlatformLink` | `db: Database, tenantId: string, linkId: string` | `boolean` | Marks a platform link as verified; returns true if a row was updated |
| `findContactByPlatformId` | `db: Database, tenantId: string, platform: ContactPlatform, platformId: string` | `Contact \| null` | Looks up a contact by platform and platform-specific ID |
| `findContactByName` | `db: Database, tenantId: string, name: string` | `Contact \| null` | Looks up a contact by exact display name (case-insensitive) |

### Exported Types

| Type | Description |
|------|-------------|
| `ContactPlatform` | `'discord' \| 'algochat' \| 'github'` -- supported identity platforms |
| `Contact` | `{ id, tenantId, displayName, notes, createdAt, updatedAt, links? }` -- unified contact record |
| `PlatformLink` | `{ id, tenantId, contactId, platform, platformId, verified, createdAt }` -- platform identity link |

## Invariants

1. All operations are scoped by `tenant_id` -- a contact from tenant A is never visible to tenant B.
2. `listContacts` clamps `limit` to a maximum of 500 regardless of input.
3. `findContactByName` uses `COLLATE NOCASE` for case-insensitive matching.
4. `deleteContact` cascades to `contact_platform_links` via the foreign key `ON DELETE CASCADE`.
5. The `contact_platform_links` table has a unique index on `(tenant_id, platform, platform_id)` preventing duplicate platform mappings.
6. `addPlatformLink` will throw a constraint error if the same platform+platformId combination already exists for the tenant.
7. `updateContact` sets `updated_at` to the current datetime on each update.

## Behavioral Examples

### Scenario: Create a contact and add platform links

- **Given** a tenant with no contacts
- **When** `createContact(db, tenantId, "Alice")` is called, then `addPlatformLink(db, tenantId, contactId, "discord", "123456")` and `addPlatformLink(db, tenantId, contactId, "github", "alice")`
- **Then** the contact has two platform links and can be found via either platform lookup

### Scenario: Cross-platform identity resolution

- **Given** a contact "Bob" with a Discord link `platform_id = "789"` and an AlgoChat link `platform_id = "ALGO_ADDR"`
- **When** `findContactByPlatformId(db, tenantId, "discord", "789")` is called
- **Then** it returns Bob's full contact record including all links

### Scenario: Name-based lookup is case-insensitive

- **Given** a contact with `display_name = "Alice"`
- **When** `findContactByName(db, tenantId, "alice")` is called
- **Then** the contact is returned

### Scenario: Delete cascades to links

- **Given** a contact with 3 platform links
- **When** `deleteContact(db, tenantId, contactId)` is called
- **Then** the contact and all its platform links are removed

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getContact` with non-existent ID | Returns `null` |
| `updateContact` with non-existent ID | Returns `null` |
| `deleteContact` with non-existent ID | Returns `false` |
| `removePlatformLink` with non-existent ID | Returns `false` |
| `verifyPlatformLink` with non-existent ID | Returns `false` |
| `addPlatformLink` with duplicate platform+platformId | Throws SQLite constraint error |
| `findContactByPlatformId` with no match | Returns `null` |
| `findContactByName` with no match | Returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type for all DB operations |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/contacts.ts` | Route handlers call all exported CRUD and lookup functions |
| `server/mcp/sdk-tools.ts` | `corvid_lookup_contact` MCP tool uses `findContactByPlatformId` and `findContactByName` |

## Database Tables

### contacts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID identifier |
| `tenant_id` | TEXT | NOT NULL, DEFAULT '' | Tenant scope |
| `display_name` | TEXT | NOT NULL | Human-readable contact name |
| `notes` | TEXT | DEFAULT NULL | Optional notes about the contact |
| `created_at` | TEXT | DEFAULT datetime('now') | Creation timestamp |
| `updated_at` | TEXT | DEFAULT datetime('now') | Last update timestamp |

### contact_platform_links

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID identifier |
| `tenant_id` | TEXT | NOT NULL, DEFAULT '' | Tenant scope |
| `contact_id` | TEXT | NOT NULL, FK contacts(id) ON DELETE CASCADE | Parent contact |
| `platform` | TEXT | NOT NULL | Platform name (discord, algochat, github) |
| `platform_id` | TEXT | NOT NULL | Platform-specific identifier |
| `verified` | INTEGER | NOT NULL, DEFAULT 0 | Whether the link has been verified |
| `created_at` | TEXT | DEFAULT datetime('now') | Creation timestamp |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-15 | corvid-agent | Initial spec |
