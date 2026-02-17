/**
 * UsageMeter — Tracks and reports usage metrics for billing.
 *
 * Runs periodically to aggregate usage from the credit system and
 * report it to Stripe for metered billing.
 */
import type { Database } from 'bun:sqlite';
import type { BillingService } from './service';
import { createUsageRecord } from './stripe';
import { createLogger } from '../lib/logger';

const log = createLogger('UsageMeter');

const METER_INTERVAL_MS = 3_600_000; // 1 hour

export class UsageMeter {
    private db: Database;
    private billing: BillingService;
    private meterTimer: ReturnType<typeof setInterval> | null = null;

    constructor(db: Database, billing: BillingService) {
        this.db = db;
        this.billing = billing;
    }

    /**
     * Start the usage metering loop.
     */
    start(): void {
        if (this.meterTimer) return;
        this.meterTimer = setInterval(() => {
            this.reportAll().catch((err) => {
                log.warn('Metering cycle failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, METER_INTERVAL_MS);
        log.info('UsageMeter started (interval: 1h)');
    }

    /**
     * Stop the metering loop.
     */
    stop(): void {
        if (this.meterTimer) {
            clearInterval(this.meterTimer);
            this.meterTimer = null;
        }
    }

    /**
     * Report usage for all tenants with unreported records.
     */
    async reportAll(): Promise<{ reported: number; failed: number }> {
        const unreported = this.db.query(`
            SELECT ur.*, s.stripe_subscription_id,
                   si.stripe_item_id
            FROM usage_records ur
            JOIN subscriptions s ON s.tenant_id = ur.tenant_id
            LEFT JOIN subscription_items si ON si.subscription_id = s.id
            WHERE ur.reported = 0 AND s.status = 'active'
        `).all() as Array<{
            id: string;
            tenant_id: string;
            credits_used: number;
            stripe_subscription_id: string;
            stripe_item_id: string | null;
        }>;

        let reported = 0;
        let failed = 0;

        for (const record of unreported) {
            if (!record.stripe_item_id) {
                log.debug('Skipping report — no subscription item', { tenantId: record.tenant_id });
                continue;
            }

            try {
                await createUsageRecord(
                    record.stripe_item_id,
                    record.credits_used,
                );

                this.db.query(
                    'UPDATE usage_records SET reported = 1 WHERE id = ?',
                ).run(record.id);

                reported++;
            } catch (err) {
                log.warn('Failed to report usage', {
                    tenantId: record.tenant_id,
                    error: err instanceof Error ? err.message : String(err),
                });
                failed++;
            }
        }

        if (reported > 0 || failed > 0) {
            log.info('Usage reporting complete', { reported, failed });
        }

        return { reported, failed };
    }

    /**
     * Get a usage summary for a tenant.
     */
    getUsageSummary(tenantId: string): {
        currentPeriodCredits: number;
        currentPeriodCost: number;
        totalCreditsAllTime: number;
    } {
        const current = this.billing.getCurrentUsage(tenantId);
        const history = this.billing.getUsageHistory(tenantId, 100);

        const totalCredits = history.reduce((sum, u) => sum + u.creditsUsed, 0);
        const currentCredits = current?.creditsUsed ?? 0;

        return {
            currentPeriodCredits: currentCredits,
            currentPeriodCost: this.billing.calculateCost(currentCredits),
            totalCreditsAllTime: totalCredits,
        };
    }
}
