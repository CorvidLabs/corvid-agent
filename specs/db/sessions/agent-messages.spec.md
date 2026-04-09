---
module: agent-messages-db
version: 1
status: draft
files:
  - server/db/agent-messages.ts
db_tables:
  - agent_messages
depends_on: []
---

# Agent Messages DB

## Purpose

Pure data-access layer for inter-agent message CRUD operations. Agent messages represent direct communication between agents, optionally backed by Algorand payment transactions, with support for threading, fire-and-forget delivery, and protocol versioning.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createAgentMessage` | `(db: Database, params: { fromAgentId: string; toAgentId: string; content: string; paymentMicro?: number; threadId?: string; provider?: string; model?: string; fireAndForget?: boolean })` | `AgentMessage` | Create a new inter-agent message with current protocol version |
| `getAgentMessage` | `(db: Database, id: string)` | `AgentMessage \| null` | Fetch a single message by ID |
| `updateAgentMessageStatus` | `(db: Database, id: string, status: AgentMessageStatus, extra?: { txid?: string; sessionId?: string; response?: string; responseTxid?: string; errorCode?: MessageErrorCode })` | `void` | Update message status and optionally set transaction IDs, session link, response, or error code |
| `listAgentMessages` | `(db: Database, agentId: string)` | `AgentMessage[]` | List all messages where the agent is sender or recipient, ordered by `created_at DESC` |
| `listRecentAgentMessages` | `(db: Database, limit?: number)` | `AgentMessage[]` | List most recent messages across all agents. Default limit 50 |
| `searchAgentMessages` | `(db: Database, options: { limit?: number; offset?: number; search?: string; agentId?: string; threadId?: string })` | `{ messages: AgentMessage[]; total: number }` | Paginated search with optional text, agent, and thread filters. Max limit capped at 100 |
| `getAgentMessageBySessionId` | `(db: Database, sessionId: string)` | `AgentMessage \| null` | Look up a message by its linked session ID |
| `getThreadMessages` | `(db: Database, threadId: string)` | `AgentMessage[]` | Get all messages in a thread, ordered by `created_at ASC` |

### Exported Types

| Type | Description |
|------|-------------|
| (none) | All types are imported from `shared/types` (`AgentMessage`, `AgentMessageStatus`, `MessageErrorCode`, `MESSAGE_PROTOCOL_VERSION`) |

## Invariants

1. **UUID generation**: Message IDs are generated via `crypto.randomUUID()`
2. **Protocol versioning**: Every new message is stamped with `MESSAGE_PROTOCOL_VERSION` from shared/types
3. **Status lifecycle**: Messages follow: pending -> (paid ->) processing -> completed/failed
4. **Completion timestamp**: `completed_at` is automatically set to `datetime('now')` when status changes to 'completed' or 'failed'
5. **Limit cap**: `searchAgentMessages` enforces a maximum limit of 100 regardless of input
6. **Default payment**: `paymentMicro` defaults to 0 if not specified
7. **Thread ordering**: `getThreadMessages` returns messages in chronological order (ASC), while `listAgentMessages` returns in reverse chronological order (DESC)
8. **Bidirectional listing**: `listAgentMessages` includes messages where the agent is either sender (`from_agent_id`) or recipient (`to_agent_id`)
9. **No cascade deletion**: Agent messages are manually deleted in `deleteAgent` transaction (not ON DELETE CASCADE)

## Behavioral Examples

### Scenario: Send a message between agents

- **Given** two agents "agent-A" and "agent-B"
- **When** `createAgentMessage(db, { fromAgentId: 'agent-A', toAgentId: 'agent-B', content: 'Hello' })` is called
- **Then** a new message is created with status 'pending', paymentMicro 0, and the current MESSAGE_PROTOCOL_VERSION

### Scenario: Complete a message with response

- **Given** a pending message with id "msg-1"
- **When** `updateAgentMessageStatus(db, 'msg-1', 'completed', { response: 'Got it', sessionId: 'sess-1' })` is called
- **Then** the message status becomes 'completed', response is set, session is linked, and `completed_at` is set

### Scenario: Paginated search with filters

- **Given** 200 messages, 50 of which mention "deploy"
- **When** `searchAgentMessages(db, { search: 'deploy', limit: 10, offset: 0 })` is called
- **Then** returns `{ messages: [...10 items], total: 50 }`

### Scenario: Thread conversation retrieval

- **Given** 5 messages sharing threadId "thread-1"
- **When** `getThreadMessages(db, 'thread-1')` is called
- **Then** returns all 5 messages in chronological order (oldest first)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| `getAgentMessage` with nonexistent ID | Returns `null` |
| `getAgentMessageBySessionId` with no linked message | Returns `null` |
| `searchAgentMessages` with no matching results | Returns `{ messages: [], total: 0 }` |
| `listAgentMessages` for agent with no messages | Returns empty array |
| `getThreadMessages` with nonexistent threadId | Returns empty array |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `bun:sqlite` | `Database` type |
| `shared/types` | `AgentMessage`, `AgentMessageStatus`, `MessageErrorCode`, `MESSAGE_PROTOCOL_VERSION` |
| `server/db/types` | `queryCount` |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/routes/agents.ts` | `listAgentMessages` |
| `server/routes/index.ts` | `searchAgentMessages` |
| `server/algochat/agent-messenger.ts` | `createAgentMessage`, `updateAgentMessageStatus`, `getAgentMessage`, `getThreadMessages` |
| `server/algochat/work-command-router.ts` | `createAgentMessage`, `updateAgentMessageStatus`, `getAgentMessage` |

## Database Tables

### agent_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| from_agent_id | TEXT | NOT NULL | Sender agent ID |
| to_agent_id | TEXT | NOT NULL | Recipient agent ID |
| content | TEXT | NOT NULL | Message body |
| payment_micro | INTEGER | DEFAULT 0 | Payment amount in microALGOs |
| txid | TEXT | DEFAULT NULL | Algorand transaction ID for the payment |
| status | TEXT | DEFAULT 'pending' | Message lifecycle status |
| response | TEXT | DEFAULT NULL | Response content from the recipient agent |
| response_txid | TEXT | DEFAULT NULL | Algorand transaction ID for the response |
| session_id | TEXT | DEFAULT NULL | Linked session ID used for processing |
| thread_id | TEXT | DEFAULT NULL | Thread ID for conversation threading |
| provider | TEXT | DEFAULT '' | LLM provider used for response generation |
| model | TEXT | DEFAULT '' | LLM model used for response generation |
| fire_and_forget | INTEGER | DEFAULT 0 | Whether sender does not wait for a response (boolean) |
| message_version | INTEGER | DEFAULT 1 | Protocol version of the message format |
| error_code | TEXT | DEFAULT NULL | Error code if message failed |
| created_at | TEXT | DEFAULT datetime('now') | Creation timestamp |
| completed_at | TEXT | DEFAULT NULL | Timestamp when message was completed or failed |

### Indexes

| Index | Columns | Type | Description |
|-------|---------|------|-------------|
| idx_agent_messages_to | (to_agent_id) | INDEX | Speeds up recipient lookups |
| idx_agent_messages_status | (status) | INDEX | Speeds up status-based queries |
| idx_agent_messages_thread | (thread_id) | INDEX | Speeds up thread lookups |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
