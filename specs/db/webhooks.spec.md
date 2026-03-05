---
module: webhooks-db
version: 1
status: draft
files:
  - server/db/webhooks.ts
db_tables:
  - webhook_registrations
  - webhook_deliveries
depends_on:
  - specs/tenant/tenant.spec.md
---

# Webhooks DB

## Purpose
Provides CRUD and query operations for GitHub webhook registrations and their delivery logs, backed by SQLite via `bun:sqlite`. Supports multi-tenant isolation through tenant ID filtering and ownership validation.

## Public API

### Exported Functions
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createWebhookRegistration` | `db: Database, input: CreateWebhookRegistrationInput, tenantId?: string` | `WebhookRegistration` | Inserts a new webhook registration with a generated UUID and returns it |
| `getWebhookRegistration` | `db: Database, id: string, tenantId?: string` | `WebhookRegistration \| null` | Retrieves a single registration by ID with tenant ownership check |
| `listWebhookRegistrations` | `db: Database, agentId?: string, tenantId?: string` | `WebhookRegistration[]` | Lists registrations, optionally filtered by agent ID, ordered by created_at DESC |
| `findRegistrationsForRepo` | `db: Database, repo: string` | `WebhookRegistration[]` | Finds all active registrations matching a given repo (no tenant filter) |
| `updateWebhookRegistration` | `db: Database, id: string, input: UpdateWebhookRegistrationInput, tenantId?: string` | `WebhookRegistration \| null` | Partially updates a registration (events, mentionUsername, projectId, status) |
| `deleteWebhookRegistration` | `db: Database, id: string, tenantId?: string` | `boolean` | Deletes a registration by ID with tenant ownership check; returns true if deleted |
| `incrementTriggerCount` | `db: Database, id: string` | `void` | Atomically increments a registration's trigger_count and updates updated_at |
| `createDelivery` | `db: Database, registrationId: string, event: string, action: string, repo: string, sender: string, body: string, htmlUrl: string` | `WebhookDelivery` | Inserts a new delivery log entry and returns it |
| `getDelivery` | `db: Database, id: string` | `WebhookDelivery \| null` | Retrieves a single delivery by ID |
| `listDeliveries` | `db: Database, registrationId?: string, limit?: number` | `WebhookDelivery[]` | Lists deliveries, optionally filtered by registration ID, ordered by created_at DESC with configurable limit (default 50) |
| `updateDeliveryStatus` | `db: Database, id: string, status: WebhookDelivery['status'], extras?: { result?: string; sessionId?: string; workTaskId?: string }` | `void` | Updates a delivery's status and optionally sets result, sessionId, and workTaskId |

### Exported Types
| Type | Description |
|------|-------------|
| _(none)_ | All types are imported from `shared/types/webhooks` |

## Invariants
1. Every webhook registration has a UUID primary key generated via `crypto.randomUUID()`.
2. `findRegistrationsForRepo` ignores tenant filtering -- it returns all active registrations for a repo regardless of tenant, since incoming webhooks are global.
3. Tenant ownership is validated before read/update/delete operations when tenantId differs from DEFAULT_TENANT_ID.
4. The `events` field is stored as JSON-serialized text in the database and parsed back to `WebhookEventType[]` on read.
5. Delivery status must be one of: `'processing'`, `'completed'`, `'failed'`, `'ignored'`.
6. Registration status must be one of: `'active'`, `'paused'`.
7. `incrementTriggerCount` is atomic (single SQL UPDATE).
8. `updateWebhookRegistration` is a no-op (returns existing) if no fields are provided in the input.

## Behavioral Examples
### Scenario: Creating and retrieving a webhook registration
- **Given** a database with agents and projects tables populated
- **When** `createWebhookRegistration` is called with agentId, repo, events, and mentionUsername
- **Then** a new row is inserted into `webhook_registrations` with a generated UUID, status defaults to `'active'`, trigger_count defaults to 0, and the full record is returned

### Scenario: Processing an incoming webhook
- **Given** active registrations exist for repo `owner/repo`
- **When** `findRegistrationsForRepo(db, 'owner/repo')` is called
- **Then** all registrations with status `'active'` for that repo are returned, ordered by created_at ASC

### Scenario: Logging a webhook delivery
- **Given** a webhook registration exists
- **When** `createDelivery` is called with event details
- **Then** a new delivery row is created with status `'processing'` and no session_id or work_task_id
- **When** processing completes and `updateDeliveryStatus` is called with status `'completed'` and a sessionId
- **Then** the delivery row is updated with the new status and session_id

## Error Cases
| Condition | Behavior |
|-----------|----------|
| `getWebhookRegistration` with non-existent ID | Returns `null` |
| `getWebhookRegistration` with wrong tenant ID | Returns `null` (tenant ownership check fails) |
| `updateWebhookRegistration` with non-existent ID | Returns `null` |
| `deleteWebhookRegistration` with wrong tenant ID | Returns `false` |
| `deleteWebhookRegistration` with non-existent ID | Returns `false` (changes === 0) |

## Dependencies
### Consumes
| Module | What is used |
|--------|-------------|
| `shared/types/webhooks` | `WebhookRegistration`, `WebhookDelivery`, `CreateWebhookRegistrationInput`, `UpdateWebhookRegistrationInput`, `WebhookEventType`, `WebhookRegistrationStatus` |
| `server/tenant/types` | `DEFAULT_TENANT_ID` |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` |

### Consumed By
| Module | What is used |
|--------|-------------|
| `server/webhooks/service.ts` | Registration CRUD, delivery CRUD, `findRegistrationsForRepo`, `incrementTriggerCount` |
| `server/routes/webhooks.ts` | Registration CRUD, delivery listing |

## Database Tables
### webhook_registrations
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Owning agent |
| repo | TEXT | NOT NULL | GitHub repository in `owner/repo` format |
| events | TEXT | NOT NULL, DEFAULT '[]' | JSON array of WebhookEventType values |
| mention_username | TEXT | NOT NULL | GitHub username to filter mentions |
| project_id | TEXT | NOT NULL, FK projects(id) | Associated project for sessions |
| status | TEXT | DEFAULT 'active' | 'active' or 'paused' |
| trigger_count | INTEGER | DEFAULT 0 | Number of times this registration has been triggered |
| tenant_id | TEXT | NOT NULL, DEFAULT 'default' | Multi-tenant isolation key |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | ISO 8601 last-update timestamp |

**Indexes:** `idx_webhook_registrations_repo(repo)`, `idx_webhook_registrations_status(status)`, `idx_webhook_registrations_agent(agent_id)`

### webhook_deliveries
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| registration_id | TEXT | NOT NULL, FK webhook_registrations(id) ON DELETE CASCADE | Parent registration |
| event | TEXT | NOT NULL | GitHub event type (e.g. 'issue_comment') |
| action | TEXT | NOT NULL, DEFAULT '' | GitHub event action (e.g. 'created') |
| repo | TEXT | NOT NULL | Repository the event came from |
| sender | TEXT | NOT NULL | GitHub username of the event sender |
| body | TEXT | DEFAULT '' | Comment/issue body text |
| html_url | TEXT | DEFAULT '' | URL to the GitHub resource |
| session_id | TEXT | DEFAULT NULL | Associated agent session ID, if any |
| work_task_id | TEXT | DEFAULT NULL | Associated work task ID, if any |
| status | TEXT | DEFAULT 'processing' | 'processing', 'completed', 'failed', or 'ignored' |
| result | TEXT | DEFAULT NULL | Summary of processing result |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 creation timestamp |

**Indexes:** `idx_webhook_deliveries_registration(registration_id)`, `idx_webhook_deliveries_status(status)`

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
