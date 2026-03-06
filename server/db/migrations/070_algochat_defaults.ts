/**
 * Migration 070: Default all agents and councils to AlgoChat-enabled.
 *
 * Sets algochat_enabled=1, algochat_auto=1 for existing agents
 * and on_chain_mode='full' for existing councils.
 */

import { Database } from 'bun:sqlite';

export function up(db: Database): void {
    db.exec(`UPDATE agents SET algochat_enabled = 1, algochat_auto = 1 WHERE algochat_enabled = 0`);
    db.exec(`UPDATE councils SET on_chain_mode = 'full' WHERE on_chain_mode = 'off'`);
}

export function down(db: Database): void {
    // No-op: cannot reliably revert user intent
}
