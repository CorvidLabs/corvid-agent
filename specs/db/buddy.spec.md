---
module: db-buddy
version: 1
status: draft
files:
  - server/db/buddy.ts
db_tables:
  - buddy_pairings
  - buddy_sessions
  - buddy_messages
depends_on: []
---

# Buddy DB

## Purpose

CRUD helpers for buddy mode database tables: pairings (which agents can pair), sessions (active/completed buddy conversations), and messages (individual turns in a buddy conversation). Translates between snake_case database rows and camelCase application types.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createBuddyPairing` | `(db: Database, agentId: string, buddyAgentId: string, opts?: { maxRounds?: number; buddyRole?: BuddyRole })` | `BuddyPairing` | Creates a new buddy pairing with defaults (maxRounds=5, buddyRole='reviewer') |
| `getBuddyPairing` | `(db: Database, id: string)` | `BuddyPairing \| null` | Fetches a single pairing by ID |
| `listBuddyPairings` | `(db: Database, agentId: string)` | `BuddyPairing[]` | Lists all pairings for a given agent, ordered by created_at |
| `updateBuddyPairing` | `(db: Database, id: string, updates: { enabled?: boolean; maxRounds?: number; buddyRole?: BuddyRole })` | `void` | Updates specified fields on a pairing; no-op if updates object is empty |
| `deleteBuddyPairing` | `(db: Database, id: string)` | `void` | Deletes a pairing by ID |
| `createBuddySession` | `(db: Database, input: CreateBuddySessionInput)` | `BuddySession` | Creates a new buddy session record |
| `getBuddySession` | `(db: Database, id: string)` | `BuddySession \| null` | Fetches a single session by ID |
| `listBuddySessions` | `(db: Database, opts?: { leadAgentId?: string; buddyAgentId?: string; workTaskId?: string; status?: BuddySessionStatus; limit?: number })` | `BuddySession[]` | Lists sessions with optional filters, ordered by created_at DESC, default limit 50 |
| `updateBuddySessionStatus` | `(db: Database, id: string, status: BuddySessionStatus, round?: number)` | `void` | Updates session status and optionally the current round; sets completed_at for terminal statuses |
| `addBuddyMessage` | `(db: Database, buddySessionId: string, agentId: string, round: number, role: 'lead' \| 'buddy', content: string)` | `BuddyMessage` | Inserts a new message in a buddy session |
| `listBuddyMessages` | `(db: Database, buddySessionId: string)` | `BuddyMessage[]` | Lists all messages for a session, ordered by round ASC then created_at ASC |

## Invariants

1. **UUID primary keys**: All IDs are generated via `crypto.randomUUID()`
2. **Unique pairings**: `buddy_pairings` has a UNIQUE constraint on `(agent_id, buddy_agent_id)` — duplicate inserts throw
3. **Terminal status timestamp**: When status is set to `completed` or `failed`, `completed_at` is automatically set to `datetime('now')`
4. **Default maxRounds**: Pairings default to maxRounds=5, sessions default to maxRounds=5
5. **Empty update no-op**: `updateBuddyPairing` with no fields set returns without executing a query
6. **updated_at auto-set**: `updateBuddyPairing` always sets `updated_at = datetime('now')` when any field changes

## Behavioral Examples

### Scenario: Create and retrieve a pairing
- **Given** two valid agent IDs
- **When** `createBuddyPairing(db, agentA, agentB)` is called
- **Then** a pairing is created with enabled=true, maxRounds=5, buddyRole='reviewer' and returned

### Scenario: List sessions with status filter
- **Given** multiple buddy sessions exist with mixed statuses
- **When** `listBuddySessions(db, { status: 'active' })` is called
- **Then** only sessions with status='active' are returned, ordered by created_at DESC

### Scenario: Complete a session
- **Given** an active buddy session
- **When** `updateBuddySessionStatus(db, id, 'completed')` is called
- **Then** status is set to 'completed' and completed_at is set to the current datetime

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Duplicate pairing (same agent_id + buddy_agent_id) | SQLite UNIQUE constraint error thrown |
| Invalid foreign key (agent_id not in agents table) | SQLite FK constraint error (if FK enforcement is on) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` class |
| `shared/types/buddy` | `BuddyPairing`, `BuddySession`, `BuddyMessage`, `BuddyRole`, `BuddySessionStatus`, `BuddySource`, `CreateBuddySessionInput` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/buddy/service` | All session and message CRUD functions |
| `server/routes/buddy` | All pairing and session/message read functions |

## Database Tables

### buddy_pairings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | The primary agent in the pairing |
| buddy_agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | The buddy agent |
| enabled | INTEGER | NOT NULL, DEFAULT 1 | Whether pairing is active (1=true, 0=false) |
| max_rounds | INTEGER | NOT NULL, DEFAULT 5 | Maximum conversation rounds |
| buddy_role | TEXT | NOT NULL, DEFAULT 'reviewer' | Role type: reviewer, collaborator, or validator |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | Last update timestamp |

**Unique constraint**: `(agent_id, buddy_agent_id)`

### buddy_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| work_task_id | TEXT | FK work_tasks(id) ON DELETE SET NULL | Associated work task (optional) |
| session_id | TEXT | FK sessions(id) ON DELETE SET NULL | Associated session (optional) |
| lead_agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Lead agent in the session |
| buddy_agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Buddy/reviewer agent |
| source | TEXT | NOT NULL, DEFAULT 'web' | Origin: web, discord, algochat, cli, agent |
| source_id | TEXT | | Source-specific identifier |
| prompt | TEXT | NOT NULL | The original task prompt |
| status | TEXT | NOT NULL, DEFAULT 'active' | Session status: active, completed, failed |
| current_round | INTEGER | NOT NULL, DEFAULT 0 | Current conversation round |
| max_rounds | INTEGER | NOT NULL, DEFAULT 5 | Maximum allowed rounds |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |
| completed_at | TEXT | | Completion timestamp (set on terminal status) |

### buddy_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| buddy_session_id | TEXT | NOT NULL, FK buddy_sessions(id) ON DELETE CASCADE | Parent session |
| agent_id | TEXT | NOT NULL, FK agents(id) ON DELETE CASCADE | Agent who produced this message |
| round | INTEGER | NOT NULL | Conversation round number |
| role | TEXT | NOT NULL | Message role: 'lead' or 'buddy' |
| content | TEXT | NOT NULL | Message content |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | Creation timestamp |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-24 | corvid-agent | Initial spec |
