---
module: sessions-db
version: 1
status: active
files:
  - server/db/sessions.ts
db_tables:
  - sessions
  - session_messages
  - algochat_conversations
depends_on: []
---

# Sessions DB

## Purpose

Pure data-access layer for session CRUD, session messages, and AlgoChat conversation tracking. Every agent interaction flows through a session. This module provides the foundational read/write operations that all higher-level services (ProcessManager, WorkTaskService, SchedulerService) depend on.

No business logic lives here -- just SQL queries with row-to-domain mapping.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listSessions` | `(db: Database, projectId?: string)` | `Session[]` | List all sessions, optionally filtered by project. Ordered by `updated_at DESC` |
| `getSession` | `(db: Database, id: string)` | `Session \| null` | Fetch a single session by ID |
| `createSession` | `(db: Database, input: CreateSessionInput)` | `Session` | Insert a new session with a generated UUID |
| `listSessionsByCouncilLaunch` | `(db: Database, launchId: string)` | `Session[]` | List sessions belonging to a council launch, ordered by `created_at ASC` |
| `updateSession` | `(db: Database, id: string, input: UpdateSessionInput)` | `Session \| null` | Update name and/or status. Returns null if session not found |
| `updateSessionAgent` | `(db: Database, id: string, agentId: string)` | `void` | Reassign a session to a different agent |
| `updateSessionPid` | `(db: Database, id: string, pid: number \| null)` | `void` | Update the OS process ID (null when process exits) |
| `updateSessionStatus` | `(db: Database, id: string, status: string)` | `void` | Set session status (idle, running, stopped, error, paused) |
| `updateSessionCost` | `(db: Database, id: string, costUsd: number, turns: number)` | `void` | Update cumulative cost and turn count |
| `updateSessionAlgoSpent` | `(db: Database, id: string, microAlgos: number)` | `void` | Increment total ALGO spent (additive, not replacement) |
| `deleteSession` | `(db: Database, id: string)` | `boolean` | Delete session and cascade: delete messages, unlink conversations. Returns false if not found |
| `getSessionMessages` | `(db: Database, sessionId: string)` | `SessionMessage[]` | Get all messages for a session, ordered by `timestamp ASC` |
| `addSessionMessage` | `(db: Database, sessionId: string, role: string, content: string, costUsd?: number)` | `SessionMessage` | Append a message to a session |
| `listConversations` | `(db: Database)` | `AlgoChatConversation[]` | List all AlgoChat conversations, ordered by `created_at DESC` |
| `getConversationByParticipant` | `(db: Database, participantAddr: string)` | `AlgoChatConversation \| null` | Look up conversation by wallet address |
| `createConversation` | `(db: Database, participantAddr: string, agentId: string \| null, sessionId: string \| null)` | `AlgoChatConversation` | Create a new AlgoChat conversation |
| `updateConversationRound` | `(db: Database, id: string, lastRound: number)` | `void` | Update the last-seen Algorand round |
| `updateConversationSession` | `(db: Database, id: string, sessionId: string)` | `void` | Link a conversation to a session |
| `updateConversationAgent` | `(db: Database, id: string, agentId: string, sessionId: string)` | `void` | Update both agent and session for a conversation |
| `getParticipantForSession` | `(db: Database, sessionId: string)` | `string \| null` | Reverse lookup: get wallet address for a session via conversations |

## Invariants

1. **Session status values**: Status must be one of: `idle`, `running`, `stopped`, `error`, `paused`
2. **Cost monotonicity**: `total_cost_usd` only increases (set via `updateSessionCost`, never decremented)
3. **ALGO spent monotonicity**: `total_algo_spent` only increases (additive via `UPDATE ... SET total_algo_spent = total_algo_spent + ?`)
4. **Cascade deletion**: Deleting a session must delete all its `session_messages` and unlink (not delete) any `algochat_conversations` referencing it
5. **Message ordering**: `getSessionMessages` always returns messages in chronological order (`timestamp ASC`)
6. **UUID generation**: Session and conversation IDs are generated via `crypto.randomUUID()`
7. **Timestamp auto-update**: Every mutation to a session sets `updated_at = datetime('now')`
8. **Conversation uniqueness**: Each participant wallet address maps to at most one conversation

## Behavioral Examples

### Scenario: Create and retrieve a session

- **Given** a valid project ID
- **When** `createSession(db, { projectId: 'proj-1', name: 'Test' })` is called
- **Then** a new session is returned with a UUID `id`, status `idle`, and `totalCostUsd: 0`

### Scenario: Delete session cascades

- **Given** a session with 5 messages and a linked conversation
- **When** `deleteSession(db, sessionId)` is called
- **Then** all 5 messages are deleted, the conversation's `session_id` is set to NULL, and the function returns `true`

### Scenario: Update session cost

- **Given** a session with `totalCostUsd: 0.50`
- **When** `updateSessionCost(db, id, 1.25, 10)` is called
- **Then** the session's `total_cost_usd` becomes `1.25` and `total_turns` becomes `10`

### Scenario: Participant lookup

- **Given** a conversation linking wallet `ABC...` to session `sess-1`
- **When** `getParticipantForSession(db, 'sess-1')` is called
- **Then** returns `'ABC...'`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getSession` with nonexistent ID | Returns `null` |
| `updateSession` with nonexistent ID | Returns `null` |
| `deleteSession` with nonexistent ID | Returns `false` |
| `getConversationByParticipant` with unknown address | Returns `null` |
| `getParticipantForSession` with no linked conversation | Returns `null` |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `Session`, `SessionMessage`, `CreateSessionInput`, `UpdateSessionInput`, `AlgoChatConversation` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/process/manager.ts` | `getSession`, `getSessionMessages`, `updateSessionPid`, `updateSessionStatus`, `updateSessionCost`, `updateSessionAgent`, `addSessionMessage`, `createSession`, `getParticipantForSession` |
| `server/work/service.ts` | `createSession` |
| `server/scheduler/service.ts` | `createSession` |
| `server/routes/sessions.ts` | All session CRUD functions |
| `server/algochat/bridge.ts` | Conversation CRUD functions |

## Database Tables

### sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| project_id | TEXT | NOT NULL, FK projects(id) | Owning project |
| agent_id | TEXT | FK agents(id), nullable | Assigned agent |
| name | TEXT | DEFAULT '' | Display name |
| status | TEXT | DEFAULT 'idle' | idle/running/stopped/error/paused |
| source | TEXT | DEFAULT 'web' | Origin: web/algochat/agent |
| initial_prompt | TEXT | DEFAULT '' | First prompt sent |
| pid | INTEGER | nullable | OS process ID when running |
| total_cost_usd | REAL | DEFAULT 0 | Cumulative API cost |
| total_algo_spent | INTEGER | DEFAULT 0 | Cumulative microALGOs spent |
| total_turns | INTEGER | DEFAULT 0 | Number of conversation turns |
| council_launch_id | TEXT | nullable | Links to council_launches if part of a council |
| council_role | TEXT | nullable | chairman/member/synthesizer |
| work_dir | TEXT | nullable | Override working directory (e.g. git worktree) |
| credits_consumed | INTEGER | DEFAULT 0 | Credits consumed by this session |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

### session_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing ID |
| session_id | TEXT | NOT NULL, FK sessions(id) | Parent session |
| role | TEXT | NOT NULL | user/assistant/system |
| content | TEXT | NOT NULL | Message text |
| cost_usd | REAL | DEFAULT 0 | Cost of this message |
| timestamp | TEXT | DEFAULT datetime('now') | When the message was created |

### algochat_conversations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| participant_addr | TEXT | NOT NULL | Algorand wallet address |
| agent_id | TEXT | FK agents(id), nullable | Which agent handles this conversation |
| session_id | TEXT | FK sessions(id), nullable | Linked session |
| last_round | INTEGER | DEFAULT 0 | Last processed Algorand round |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

## Configuration

No environment variables. This module is a pure data layer.

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-02-19 | corvid-agent | Initial spec |
