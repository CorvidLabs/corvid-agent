import { describe, it, expect, beforeEach } from 'bun:test';
import { DeliveryTracker } from '../lib/delivery-tracker';

describe('DeliveryTracker', () => {
    let tracker: DeliveryTracker;

    beforeEach(() => {
        tracker = new DeliveryTracker();
    });

    // ── sendWithReceipt ─────────────────────────────────────────────────

    describe('sendWithReceipt', () => {
        it('records successful delivery', async () => {
            const { receipt } = await tracker.sendWithReceipt('discord', async () => 'ok', false);

            expect(receipt.platform).toBe('discord');
            expect(receipt.success).toBe(true);
            expect(receipt.attempts).toBe(1);
            expect(receipt.error).toBeUndefined();
        });

        it('records failed delivery', async () => {
            await expect(
                tracker.sendWithReceipt('telegram', async () => {
                    throw new Error('API down');
                }, false),
            ).rejects.toThrow('API down');

            const metrics = tracker.getMetrics('telegram');
            expect(metrics.failure).toBe(1);
            expect(metrics.recentFailures).toHaveLength(1);
            expect(metrics.recentFailures[0].error).toBe('API down');
        });

        it('returns the result of the send function', async () => {
            const { result } = await tracker.sendWithReceipt('slack', async () => 42, false);
            expect(result).toBe(42);
        });

        it('retries on failure when retry is enabled', async () => {
            let attempts = 0;
            const { receipt } = await tracker.sendWithReceipt(
                'discord',
                async () => {
                    attempts++;
                    if (attempts < 2) throw new Error('transient');
                    return 'ok';
                },
                { maxAttempts: 3, baseDelayMs: 10 },
            );

            expect(receipt.success).toBe(true);
            expect(receipt.attempts).toBe(2);
            expect(attempts).toBe(2);
        });

        it('records failure after all retries exhausted', async () => {
            await expect(
                tracker.sendWithReceipt(
                    'telegram',
                    async () => { throw new Error('persistent'); },
                    { maxAttempts: 2, baseDelayMs: 10 },
                ),
            ).rejects.toThrow('persistent');

            const metrics = tracker.getMetrics('telegram');
            expect(metrics.failure).toBe(1);
            expect(metrics.total).toBe(1);
        });
    });

    // ── Metrics ─────────────────────────────────────────────────────────

    describe('getMetrics', () => {
        it('returns zero metrics for unused platform', () => {
            const metrics = tracker.getMetrics('slack');
            expect(metrics.total).toBe(0);
            expect(metrics.success).toBe(0);
            expect(metrics.failure).toBe(0);
            expect(metrics.successRate).toBe(1);
            expect(metrics.recentFailures).toEqual([]);
        });

        it('computes correct success rate', async () => {
            // 3 successes, 1 failure
            for (let i = 0; i < 3; i++) {
                await tracker.sendWithReceipt('discord', async () => 'ok', false);
            }
            try {
                await tracker.sendWithReceipt('discord', async () => { throw new Error('fail'); }, false);
            } catch { /* expected */ }

            const metrics = tracker.getMetrics('discord');
            expect(metrics.total).toBe(4);
            expect(metrics.success).toBe(3);
            expect(metrics.failure).toBe(1);
            expect(metrics.successRate).toBe(0.75);
        });

        it('limits recent failures to 10', async () => {
            for (let i = 0; i < 15; i++) {
                try {
                    await tracker.sendWithReceipt('slack', async () => { throw new Error(`fail-${i}`); }, false);
                } catch { /* expected */ }
            }

            const metrics = tracker.getMetrics('slack');
            expect(metrics.recentFailures).toHaveLength(10);
            // Should keep the most recent 10
            expect(metrics.recentFailures[0].error).toBe('fail-5');
            expect(metrics.recentFailures[9].error).toBe('fail-14');
        });
    });

    describe('getAllMetrics', () => {
        it('returns metrics for all platforms', async () => {
            await tracker.sendWithReceipt('discord', async () => 'ok', false);
            await tracker.sendWithReceipt('telegram', async () => 'ok', false);

            const all = tracker.getAllMetrics();
            expect(all.discord.total).toBe(1);
            expect(all.telegram.total).toBe(1);
            expect(all.slack.total).toBe(0);
        });
    });

    describe('reset', () => {
        it('clears all metrics', async () => {
            await tracker.sendWithReceipt('discord', async () => 'ok', false);
            tracker.reset();

            const metrics = tracker.getMetrics('discord');
            expect(metrics.total).toBe(0);
        });
    });
});
