/**
 * Background service that auto-expires governance proposals with elapsed deadlines.
 *
 * Runs `checkExpiredProposals` every 60 seconds. Proposals in `voting` status
 * whose `voting_deadline` has passed are transitioned to `decided/rejected`.
 */

import type { Database } from 'bun:sqlite';
import { checkExpiredProposals } from '../db/proposals';
import { createLogger } from '../lib/logger';

const log = createLogger('ProposalExpiry');
const INTERVAL_MS = 60_000;

export function startProposalExpiryService(db: Database): () => void {
  const timer = setInterval(() => {
    try {
      const count = checkExpiredProposals(db);
      if (count > 0) {
        log.info(`Auto-expired ${count} proposal(s) past voting deadline`);
      }
    } catch (err) {
      log.error('Failed to check expired proposals', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, INTERVAL_MS);

  log.info('Proposal expiry service started (60s interval)');

  return () => {
    clearInterval(timer);
    log.info('Proposal expiry service stopped');
  };
}
