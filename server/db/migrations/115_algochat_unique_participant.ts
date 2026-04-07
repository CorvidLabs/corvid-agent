import type { Database } from 'bun:sqlite';

/**
 * Migration 115: Fix duplicate AlgoChat conversations
 *
 * 1. Remove duplicate rows (keep the most recent per participant_addr)
 * 2. Add UNIQUE constraint on participant_addr
 */
export function up(db: Database): void {
  // Delete duplicate conversations, keeping the one with the latest created_at per participant_addr
  db.exec(`
        DELETE FROM algochat_conversations
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY participant_addr
                    ORDER BY created_at DESC
                ) AS rn
                FROM algochat_conversations
            )
            WHERE rn = 1
        )
    `);

  // Drop the old non-unique index and replace with a unique one
  db.exec(`DROP INDEX IF EXISTS idx_algochat_participant`);
  db.exec(`CREATE UNIQUE INDEX idx_algochat_participant ON algochat_conversations(participant_addr)`);
}

export function down(db: Database): void {
  // Revert to non-unique index
  db.exec(`DROP INDEX IF EXISTS idx_algochat_participant`);
  db.exec(`CREATE INDEX idx_algochat_participant ON algochat_conversations(participant_addr)`);
}
