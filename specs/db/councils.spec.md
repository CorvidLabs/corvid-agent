---
module: db-councils
version: 1
status: draft
files:
  - server/db/councils.ts
db_tables:
  - councils
  - council_members
  - council_launches
  - council_launch_logs
  - council_discussion_messages
depends_on:
  - specs/db/schema.spec.md
  - specs/tenant/tenant.spec.md
---

# DB Councils

## Purpose

Provides the data-access layer for the council deliberation system: CRUD operations for councils and their member rosters, lifecycle management for council launches (prompt execution across multiple agents), structured discussion messages, and per-launch logging. All queries support multi-tenant isolation.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `listCouncils` | `db: Database, tenantId?: string` | `Council[]` | List all councils for a tenant, ordered by `updated_at` descending |
| `getCouncil` | `db: Database, id: string, tenantId?: string` | `Council \| null` | Retrieve a single council by ID with its member agent IDs |
| `createCouncil` | `db: Database, input: CreateCouncilInput, tenantId?: string` | `Council` | Create a new council and its member associations in a transaction |
| `updateCouncil` | `db: Database, id: string, input: UpdateCouncilInput, tenantId?: string` | `Council \| null` | Partially update a council's fields and/or member list in a transaction |
| `deleteCouncil` | `db: Database, id: string, tenantId?: string` | `boolean` | Delete a council, its launches, and cascade-delete members; returns true if a row was deleted |
| `createCouncilLaunch` | `db: Database, params: { id, councilId, projectId, prompt }, tenantId?: string` | `CouncilLaunchRow` | Insert a new council launch record |
| `getCouncilLaunch` | `db: Database, id: string, tenantId?: string` | `CouncilLaunch \| null` | Retrieve a launch by ID including associated session IDs |
| `listCouncilLaunches` | `db: Database, councilId?: string, tenantId?: string` | `CouncilLaunch[]` | List launches, optionally filtered by council ID, ordered by `created_at` descending |
| `updateCouncilLaunchStage` | `db: Database, id: string, stage: CouncilStage, synthesis?: string` | `void` | Update a launch's stage and optionally set its synthesis text |
| `addCouncilLaunchLog` | `db: Database, launchId: string, level: CouncilLogLevel, message: string, detail?: string` | `CouncilLaunchLog` | Append a log entry to a launch |
| `getCouncilLaunchLogs` | `db: Database, launchId: string` | `CouncilLaunchLog[]` | Get all log entries for a launch, ordered by `created_at` then `id` ascending |
| `insertDiscussionMessage` | `db: Database, params: { launchId, agentId, agentName, round, content, txid?, sessionId? }` | `CouncilDiscussionMessage` | Insert a discussion message from an agent for a specific round |
| `getDiscussionMessages` | `db: Database, launchId: string` | `CouncilDiscussionMessage[]` | Get all discussion messages for a launch, ordered by `round` then `id` ascending |
| `updateCouncilLaunchDiscussionRound` | `db: Database, launchId: string, round: number, totalRounds?: number` | `void` | Update the current discussion round (and optionally total rounds) on a launch |
| `updateDiscussionMessageTxid` | `db: Database, messageId: number, txid: string` | `void` | Set the on-chain transaction ID for a discussion message |
| `updateCouncilLaunchChatSession` | `db: Database, launchId: string, chatSessionId: string` | `void` | Associate a follow-up chat session with a completed launch |
| `createGovernanceVote` | `db: Database, params: { launchId, totalVoters }, tenantId?` | `GovernanceVote` | Create a new governance vote for a council launch |
| `getGovernanceVote` | `db: Database, launchId: string` | `GovernanceVote \| null` | Retrieve a governance vote by launch ID |
| `castGovernanceMemberVote` | `db: Database, params: { launchId, memberAgentId, voteChoice }, tenantId?` | `void` | Record a member's vote on a proposal |
| `getGovernanceMemberVotes` | `db: Database, launchId: string` | `GovernanceMemberVote[]` | Get all member votes for a governance vote |
| `updateGovernanceVoteStatus` | `db: Database, launchId: string, status` | `void` | Update the governance vote status (open/closed/approved/rejected) |
| `approveGovernanceVoteHuman` | `db: Database, launchId: string, approved: boolean` | `void` | Record human approval/denial of a governance vote |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | All public types are re-used from `shared/types/councils.ts`; internal row types (`CouncilRow`, `CouncilMemberRow`, `CouncilLaunchRow`, `CouncilLaunchLogRow`, `CouncilDiscussionMessageRow`) are not exported |

## Invariants

1. Council creation and update are wrapped in transactions -- member list changes are atomic with council field changes.
2. Deleting a council removes all associated launches (explicit DELETE), which cascade-deletes launch logs and discussion messages; council_members cascade on the councils FK.
3. Before deleting launches, sessions referencing those launches have their `council_launch_id` set to NULL to avoid FK violations.
4. All list/get operations that accept `tenantId` apply tenant filtering via `withTenantFilter` or `validateTenantOwnership`.
5. Council member `sort_order` is assigned by array index (0-based) and members are always returned sorted ascending by `sort_order`.
6. `discussion_rounds` defaults to 2 when not specified in input or when the DB value is null.
7. Launch stage progression follows: `responding` -> `discussing` -> `reviewing` -> `synthesizing` -> `complete`.
8. Discussion messages are ordered by `(round ASC, id ASC)` and launch logs by `(created_at ASC, id ASC)`.
9. `on_chain_mode` defaults to `'full'` for new councils. `createCouncil()` defaults `onChainMode` to `'full'` when not specified. All fallback `??` values in `discussion.ts` and `synthesis.ts` use `'full'` as the default.

## Behavioral Examples

### Scenario: Create a council with agents
- **Given** a database and a `CreateCouncilInput` with `name: "Security Review"`, `agentIds: ["a1", "a2", "a3"]`, and `discussionRounds: 3`
- **When** `createCouncil(db, input)` is called
- **Then** a new row in `councils` is created with a UUID, three rows in `council_members` with `sort_order` 0, 1, 2, and the returned `Council` object contains all three agent IDs

### Scenario: Update council members atomically
- **Given** an existing council with agents `["a1", "a2"]`
- **When** `updateCouncil(db, id, { agentIds: ["a3", "a4", "a5"] })` is called
- **Then** all old `council_members` rows for that council are deleted and three new rows are inserted, all within a single transaction

### Scenario: Delete council cascades
- **Given** a council with launches that have sessions referencing them
- **When** `deleteCouncil(db, id)` is called
- **Then** sessions have `council_launch_id` nulled, launches are deleted (cascading logs and discussion messages), and the council and its members are removed

### Scenario: Track discussion rounds
- **Given** a council launch in the `discussing` stage
- **When** `insertDiscussionMessage` is called for round 1 from agent "a1", then `updateCouncilLaunchDiscussionRound(db, launchId, 1, 3)` is called
- **Then** the launch's `current_discussion_round` is 1 and `total_discussion_rounds` is 3

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getCouncil` with non-existent ID | Returns `null` |
| `getCouncil` with wrong tenant | Returns `null` (tenant ownership check fails) |
| `updateCouncil` with non-existent ID | Returns `null` (existing check fails) |
| `deleteCouncil` with wrong tenant | Returns `false` (tenant ownership check fails) |
| `deleteCouncil` with non-existent ID | Returns `false` (`result.changes` is 0) |
| `getCouncilLaunch` with wrong tenant | Returns `null` (tenant ownership check fails) |
| FK violation on `chairman_agent_id` | SQLite throws constraint error (agent must exist) |
| FK violation on `council_id` in launches | SQLite throws constraint error (council must exist) |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type, query execution |
| `shared/types/councils` | `Council`, `CouncilLaunch`, `CouncilLaunchLog`, `CouncilDiscussionMessage`, `CouncilStage`, `CouncilLogLevel`, `CreateCouncilInput`, `UpdateCouncilInput` |
| `server/tenant/types` | `DEFAULT_TENANT_ID` |
| `server/tenant/db-filter` | `withTenantFilter`, `validateTenantOwnership` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/councils` | `listCouncils`, `getCouncil`, `createCouncil`, `updateCouncil`, `deleteCouncil`, `createCouncilLaunch`, `getCouncilLaunch`, `listCouncilLaunches`, `updateCouncilLaunchStage`, `addCouncilLaunchLog`, `getCouncilLaunchLogs`, `getDiscussionMessages` |
| `server/councils/discussion` | `insertDiscussionMessage`, `getDiscussionMessages`, `updateCouncilLaunchDiscussionRound`, `updateDiscussionMessageTxid`, `addCouncilLaunchLog`, `updateCouncilLaunchStage` |
| `server/councils/synthesis` | `updateCouncilLaunchStage`, `addCouncilLaunchLog`, `getDiscussionMessages`, `updateCouncilLaunchChatSession` |
| `server/algochat/command-handler` | `listCouncils`, `createCouncil`, `getCouncilLaunch` |
| `server/__tests__/councils.test.ts` | Various CRUD functions |
| `server/__tests__/db.test.ts` | Various CRUD functions |
| `server/__tests__/council-synthesis.test.ts` | Launch and log functions |
| `server/__tests__/tenant-isolation.test.ts` | `listCouncils`, `getCouncil`, `createCouncil`, `updateCouncil`, `deleteCouncil` |

## Database Tables

### councils

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| name | TEXT | NOT NULL | Display name of the council |
| description | TEXT | DEFAULT '' | Optional description |
| chairman_agent_id | TEXT | DEFAULT NULL, FK -> agents(id) | Agent who chairs the council (optional) |
| discussion_rounds | INTEGER | DEFAULT 2 | Number of discussion rounds per launch (added v9) |
| tenant_id | TEXT | NOT NULL DEFAULT 'default', INDEXED | Tenant isolation identifier (added v56) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| on_chain_mode | TEXT | DEFAULT 'full' | On-chain mode: 'off', 'metadata', 'full' (added v68) |
| updated_at | TEXT | DEFAULT datetime('now') | Last modification timestamp |

### council_members

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| council_id | TEXT | NOT NULL, FK -> councils(id) ON DELETE CASCADE, PK part | Parent council |
| agent_id | TEXT | NOT NULL, FK -> agents(id) ON DELETE CASCADE, PK part | Member agent |
| sort_order | INTEGER | DEFAULT 0 | Display/processing order (0-based) |

**Indexes:** `idx_council_members_council` on `council_id`

### council_launches

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID identifier |
| council_id | TEXT | NOT NULL, FK -> councils(id) | Parent council |
| project_id | TEXT | NOT NULL, FK -> projects(id) | Associated project |
| prompt | TEXT | NOT NULL | User prompt that triggered the launch |
| stage | TEXT | DEFAULT 'responding' | Current stage: responding, discussing, reviewing, synthesizing, complete |
| synthesis | TEXT | DEFAULT NULL | Final synthesized output |
| current_discussion_round | INTEGER | DEFAULT 0 | Current round number during discussion (added v9) |
| total_discussion_rounds | INTEGER | DEFAULT 0 | Total planned discussion rounds (added v9) |
| chat_session_id | TEXT | DEFAULT NULL | Follow-up chat session ID (added v22) |
| synthesis_txid | TEXT | DEFAULT NULL | On-chain transaction ID for the synthesis (added v68) |
| tenant_id | TEXT | NOT NULL DEFAULT 'default', INDEXED | Tenant isolation identifier (added v56) |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

**Indexes:** `idx_council_launches_council` on `council_id`, `idx_council_launches_tenant` on `tenant_id`

### council_launch_logs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing identifier |
| launch_id | TEXT | NOT NULL, FK -> council_launches(id) ON DELETE CASCADE | Parent launch |
| level | TEXT | DEFAULT 'info' | Log level: info, warn, error, stage |
| message | TEXT | NOT NULL | Log message text |
| detail | TEXT | DEFAULT NULL | Optional additional detail |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

**Indexes:** `idx_council_launch_logs_launch` on `launch_id`

### council_discussion_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Auto-incrementing identifier |
| launch_id | TEXT | NOT NULL, FK -> council_launches(id) ON DELETE CASCADE | Parent launch |
| agent_id | TEXT | NOT NULL, FK -> agents(id) ON DELETE CASCADE | Agent who authored the message |
| agent_name | TEXT | NOT NULL | Display name of the agent at time of message |
| round | INTEGER | NOT NULL | Discussion round number |
| content | TEXT | NOT NULL | Message content |
| txid | TEXT | DEFAULT NULL | On-chain transaction ID (AlgoChat) |
| session_id | TEXT | DEFAULT NULL | Session that produced this message |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |

**Indexes:** `idx_cdm_launch` on `launch_id`

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-06 | corvid-agent | Councils now default to on_chain_mode='full'. All fallback defaults changed from 'off' to 'full'. |
