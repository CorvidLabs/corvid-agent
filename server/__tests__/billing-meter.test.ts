import { describe, test, expect } from 'bun:test';
import { UsageMeter } from '../billing/meter';

// Minimal mock for Database
function createMockDb(queryResults: unknown[] = []) {
    return {
        query: () => ({
            all: () => queryResults,
            run: () => {},
        }),
        prepare: () => ({
            run: () => {},
        }),
    } as unknown as import('bun:sqlite').Database;
}

// Minimal mock for BillingService
function createMockBilling(overrides: Partial<{
    getCurrentUsage: (tenantId: string) => { creditsUsed: number } | null;
    getUsageHistory: (tenantId: string, limit: number) => Array<{ creditsUsed: number }>;
    calculateCost: (credits: number) => number;
}> = {}) {
    return {
        getCurrentUsage: overrides.getCurrentUsage ?? (() => ({ creditsUsed: 100 })),
        getUsageHistory: overrides.getUsageHistory ?? (() => [
            { creditsUsed: 50 },
            { creditsUsed: 100 },
        ]),
        calculateCost: overrides.calculateCost ?? ((credits: number) => credits * 0.01),
    } as unknown as import('../billing/service').BillingService;
}

describe('UsageMeter', () => {
    describe('constructor', () => {
        test('creates instance with db and billing service', () => {
            const db = createMockDb();
            const billing = createMockBilling();
            const meter = new UsageMeter(db, billing);
            expect(meter).toBeDefined();
        });
    });

    describe('start / stop', () => {
        test('start is idempotent (calling twice does not create duplicate timers)', () => {
            const db = createMockDb();
            const billing = createMockBilling();
            const meter = new UsageMeter(db, billing);
            meter.start();
            meter.start(); // Should not throw or create duplicate
            meter.stop();
        });

        test('stop clears the timer', () => {
            const db = createMockDb();
            const billing = createMockBilling();
            const meter = new UsageMeter(db, billing);
            meter.start();
            meter.stop();
            // Calling stop again should be safe
            meter.stop();
        });
    });

    describe('reportAll', () => {
        test('returns zero counts when no unreported records', async () => {
            const db = createMockDb([]); // No unreported records
            const billing = createMockBilling();
            const meter = new UsageMeter(db, billing);
            const result = await meter.reportAll();
            expect(result).toEqual({ reported: 0, failed: 0 });
        });

        test('skips records without stripe_item_id', async () => {
            const db = createMockDb([
                { id: '1', tenant_id: 't1', credits_used: 10, stripe_subscription_id: 'sub_1', stripe_item_id: null },
            ]);
            const billing = createMockBilling();
            const meter = new UsageMeter(db, billing);
            const result = await meter.reportAll();
            expect(result).toEqual({ reported: 0, failed: 0 });
        });
    });

    describe('getUsageSummary', () => {
        test('returns correct summary for a tenant', () => {
            const db = createMockDb();
            const billing = createMockBilling({
                getCurrentUsage: () => ({ creditsUsed: 250 }),
                getUsageHistory: () => [
                    { creditsUsed: 100 },
                    { creditsUsed: 200 },
                    { creditsUsed: 250 },
                ],
                calculateCost: (credits: number) => credits * 0.01,
            });
            const meter = new UsageMeter(db, billing);
            const summary = meter.getUsageSummary('tenant-1');
            expect(summary.currentPeriodCredits).toBe(250);
            expect(summary.currentPeriodCost).toBe(2.5);
            expect(summary.totalCreditsAllTime).toBe(550);
        });

        test('handles null current usage', () => {
            const db = createMockDb();
            const billing = createMockBilling({
                getCurrentUsage: () => null,
                getUsageHistory: () => [],
                calculateCost: () => 0,
            });
            const meter = new UsageMeter(db, billing);
            const summary = meter.getUsageSummary('tenant-1');
            expect(summary.currentPeriodCredits).toBe(0);
            expect(summary.currentPeriodCost).toBe(0);
            expect(summary.totalCreditsAllTime).toBe(0);
        });

        test('handles empty usage history', () => {
            const db = createMockDb();
            const billing = createMockBilling({
                getCurrentUsage: () => ({ creditsUsed: 50 }),
                getUsageHistory: () => [],
                calculateCost: (credits: number) => credits * 0.02,
            });
            const meter = new UsageMeter(db, billing);
            const summary = meter.getUsageSummary('tenant-2');
            expect(summary.currentPeriodCredits).toBe(50);
            expect(summary.currentPeriodCost).toBe(1.0);
            expect(summary.totalCreditsAllTime).toBe(0);
        });
    });
});
