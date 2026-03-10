/**
 * Scheduler handler for marketplace trial expiry.
 * Expires time-based trials past their expires_at.
 */
import { updateExecutionStatus } from '../../db/schedules';
import { TrialService } from '../../marketplace/trials';
import type { HandlerContext } from './types';

export function execMarketplaceTrialExpiry(
    ctx: HandlerContext,
    executionId: string,
): void {
    try {
        const trialService = new TrialService(ctx.db);
        const expired = trialService.expireTrials();

        updateExecutionStatus(ctx.db, executionId, 'completed', {
            result: `Trial expiry processed: ${expired} trials expired`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}
