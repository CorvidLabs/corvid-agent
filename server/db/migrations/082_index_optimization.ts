import type { Database } from 'bun:sqlite';

/**
 * Migration 082: Database index optimization for RC gating criteria.
 *
 * Adds compound indexes to support common multi-column query patterns
 * identified during the v0.23.0 stabilization audit (#742).
 *
 * All indexes use IF NOT EXISTS for idempotency.
 */

const INDEXES = [
  // agent_messages: OR queries on from/to need both columns indexed.
  // Existing: idx_agent_messages_to (to_agent_id only).
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_from
        ON agent_messages(from_agent_id)`,

  // schedule_executions: listExecutionsFiltered() filters by schedule + status + date.
  // Existing: idx_schedule_executions_schedule (schedule_id only).
  `CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule_status
        ON schedule_executions(schedule_id, status, started_at DESC)`,

  // credit_transactions: getUsdcDepositHistory() filters wallet + type + date.
  // Existing: idx_credit_txn_wallet (wallet_address only).
  `CREATE INDEX IF NOT EXISTS idx_credit_txn_wallet_type_created
        ON credit_transactions(wallet_address, type, created_at DESC)`,

  // council_launches: query with ORDER BY created_at DESC per council.
  // Existing: idx_council_launches_council (council_id only).
  `CREATE INDEX IF NOT EXISTS idx_council_launches_council_created
        ON council_launches(council_id, created_at DESC)`,

  // workflow_runs: listWorkflowRuns() queries per workflow + date ordering.
  // Existing: idx_workflow_runs_workflow (workflow_id only).
  `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started
        ON workflow_runs(workflow_id, started_at DESC)`,

  // session_messages: getSessionMessages() orders by timestamp within session.
  // Existing: idx_session_messages_session (session_id only, from baseline).
  `CREATE INDEX IF NOT EXISTS idx_session_messages_session_timestamp
        ON session_messages(session_id, timestamp ASC)`,

  // algochat_conversations: listConversations() orders by created_at DESC.
  `CREATE INDEX IF NOT EXISTS idx_algochat_conversations_created
        ON algochat_conversations(created_at DESC)`,
];

export function up(db: Database): void {
  for (const sql of INDEXES) {
    db.exec(sql);
  }
}

export function down(db: Database): void {
  db.exec('DROP INDEX IF EXISTS idx_agent_messages_from');
  db.exec('DROP INDEX IF EXISTS idx_schedule_executions_schedule_status');
  db.exec('DROP INDEX IF EXISTS idx_credit_txn_wallet_type_created');
  db.exec('DROP INDEX IF EXISTS idx_council_launches_council_created');
  db.exec('DROP INDEX IF EXISTS idx_workflow_runs_workflow_started');
  db.exec('DROP INDEX IF EXISTS idx_session_messages_session_timestamp');
  db.exec('DROP INDEX IF EXISTS idx_algochat_conversations_created');
}
