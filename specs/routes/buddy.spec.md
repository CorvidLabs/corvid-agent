---
module: routes-buddy
version: 1
status: draft
files:
  - server/routes/buddy.ts
db_tables: []
depends_on:
  - specs/db/buddy.spec.md
  - specs/middleware/auth.spec.md
---

# Buddy Routes

## Purpose

REST API routes for managing buddy pairings (which agents can pair for collaborative review) and buddy sessions (active/completed buddy conversations). Provides CRUD endpoints for pairings scoped per-agent and read-only endpoints for sessions and messages.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `handleBuddyRoutes` | `(req: Request, url: URL, db: Database, context?: RequestContext)` | `Response \| Promise<Response> \| null` | Route handler that matches buddy API paths; returns null if no match |

### Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents/:id/buddy-pairings` | any | List all buddy pairings for an agent |
| POST | `/api/agents/:id/buddy-pairings` | operator/owner | Create a new buddy pairing for an agent |
| GET | `/api/buddy-pairings/:id` | any | Get a single buddy pairing by ID |
| PUT | `/api/buddy-pairings/:id` | operator/owner | Update a buddy pairing (enabled, maxRounds, buddyRole) |
| DELETE | `/api/buddy-pairings/:id` | operator/owner | Delete a buddy pairing |
| GET | `/api/buddy-sessions` | any | List buddy sessions with optional filters (leadAgentId, buddyAgentId, workTaskId, status, limit) |
| GET | `/api/buddy-sessions/:id` | any | Get a single buddy session by ID |
| GET | `/api/buddy-sessions/:id/messages` | any | List all messages in a buddy session |

## Invariants

1. **Tenant scoping**: Agent lookups use `tenantId` from request context (defaults to `'default'`)
2. **Role guards on mutations**: POST, PUT, DELETE on pairings require `operator` or `owner` role via `tenantRoleGuard`
3. **Self-pairing prevention**: Creating a pairing where `agentId === buddyAgentId` returns 400
4. **Valid buddy roles**: Only `'reviewer'`, `'collaborator'`, `'validator'` are accepted; others return 400
5. **maxRounds range**: Must be between 1 and 10 (inclusive); out-of-range returns 400
6. **Duplicate pairing**: If the UNIQUE constraint fires, returns 409 Conflict
7. **Null return**: Returns `null` when the URL does not match any buddy route pattern

## Behavioral Examples

### Scenario: List pairings for an agent
- **Given** agent "abc" has 2 buddy pairings
- **When** GET `/api/agents/abc/buddy-pairings`
- **Then** returns 200 with JSON array of 2 pairing objects

### Scenario: Create pairing with invalid role
- **Given** a POST to `/api/agents/abc/buddy-pairings` with `buddyRole: "invalid"`
- **When** the route handler processes the request
- **Then** returns 400 with error message listing valid roles

### Scenario: Get non-existent session
- **Given** no buddy session with ID "xyz"
- **When** GET `/api/buddy-sessions/xyz`
- **Then** returns 404 with `{ error: 'Not found' }`

### Scenario: Self-pairing attempt
- **Given** agent "abc" tries to create a pairing with buddyAgentId="abc"
- **When** POST `/api/agents/abc/buddy-pairings` with `{ buddyAgentId: "abc" }`
- **Then** returns 400 with `{ error: 'An agent cannot be its own buddy' }`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Agent not found (pairing list/create) | 404 `{ error: 'Agent not found' }` |
| Buddy agent not found | 404 `{ error: 'Buddy agent not found' }` |
| Missing buddyAgentId in POST body | 400 `{ error: 'buddyAgentId is required' }` |
| Invalid JSON body | 400 `{ error: 'Invalid JSON body' }` |
| Invalid buddyRole | 400 with valid roles listed |
| maxRounds out of range | 400 `{ error: 'maxRounds must be between 1 and 10' }` |
| Self-pairing | 400 `{ error: 'An agent cannot be its own buddy' }` |
| Duplicate pairing | 409 `{ error: 'Pairing already exists' }` |
| Pairing not found (GET/PUT/DELETE) | 404 `{ error: 'Not found' }` |
| Session not found (messages endpoint) | 404 `{ error: 'Session not found' }` |
| Insufficient role for mutation | 403 (from tenantRoleGuard) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `server/db/buddy` | `createBuddyPairing`, `getBuddyPairing`, `listBuddyPairings`, `updateBuddyPairing`, `deleteBuddyPairing`, `listBuddySessions`, `getBuddySession`, `listBuddyMessages` |
| `server/db/agents` | `getAgent` |
| `server/middleware/guards` | `tenantRoleGuard`, `RequestContext` type |
| `server/lib/response` | `json` helper |
| `shared/types/buddy` | `BuddyRole` type |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/index` | Registered in the main route dispatcher |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
