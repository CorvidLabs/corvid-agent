/**
 * Scheduler handler for marketplace subscription billing.
 * Processes renewals, past_due expiries, and cancelled subscription expiries.
 */
import { updateExecutionStatus } from '../../db/schedules';
import { SubscriptionService } from '../../marketplace/subscriptions';
import type { HandlerContext } from './types';

export function execMarketplaceBilling(
    ctx: HandlerContext,
    executionId: string,
): void {
    try {
        const subscriptionService = new SubscriptionService(ctx.db);
        const result = subscriptionService.processRenewals();

        updateExecutionStatus(ctx.db, executionId, 'completed', {
            result: `Billing processed: ${result.renewed} renewed, ${result.pastDue} past_due, ${result.expired} expired`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateExecutionStatus(ctx.db, executionId, 'failed', { result: message });
    }
}
