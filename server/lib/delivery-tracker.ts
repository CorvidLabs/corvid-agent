/**
 * Delivery receipt tracker for outbound bridge messages.
 *
 * Tracks success/failure of messages sent to external platforms
 * (Discord, Telegram, Slack) and provides per-platform metrics.
 */

import { createLogger } from './logger';
import { type RetryOptions, withRetry } from './resilience';

const log = createLogger('DeliveryTracker');

export type DeliveryPlatform = 'discord' | 'telegram' | 'slack';

export interface DeliveryReceipt {
  platform: DeliveryPlatform;
  success: boolean;
  timestamp: number;
  error?: string;
  /** How many attempts were needed (1 = first try succeeded) */
  attempts: number;
}

export interface DeliveryMetrics {
  total: number;
  success: number;
  failure: number;
  successRate: number;
  /** Recent failures (last 10) */
  recentFailures: Array<{ timestamp: number; error: string }>;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 2,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  multiplier: 2,
};

const MAX_RECENT_FAILURES = 10;
const METRICS_WINDOW_MS = 3_600_000; // 1 hour

export class DeliveryTracker {
  private receipts: Map<DeliveryPlatform, DeliveryReceipt[]> = new Map();

  /**
   * Send a message with delivery tracking and optional retry.
   * Returns the delivery receipt.
   */
  async sendWithReceipt<T>(
    platform: DeliveryPlatform,
    sendFn: () => Promise<T>,
    retryOptions?: RetryOptions | false,
  ): Promise<{ result: T; receipt: DeliveryReceipt }> {
    const startTime = Date.now();
    let attempts = 0;

    const doRetry = retryOptions !== false;
    const retryOpts = typeof retryOptions === 'object' ? retryOptions : DEFAULT_RETRY;

    try {
      let result: T;
      if (doRetry) {
        let attemptCount = 0;
        result = await withRetry(async () => {
          attemptCount++;
          return sendFn();
        }, retryOpts);
        attempts = attemptCount;
      } else {
        attempts = 1;
        result = await sendFn();
      }

      const receipt: DeliveryReceipt = {
        platform,
        success: true,
        timestamp: startTime,
        attempts,
      };
      this.record(receipt);
      return { result, receipt };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const receipt: DeliveryReceipt = {
        platform,
        success: false,
        timestamp: startTime,
        error: errorMsg,
        attempts: doRetry ? (retryOpts.maxAttempts ?? 3) : 1,
      };
      this.record(receipt);
      log.warn('Delivery failed', { platform, error: errorMsg, attempts: receipt.attempts });
      throw err;
    }
  }

  private record(receipt: DeliveryReceipt): void {
    const list = this.receipts.get(receipt.platform) ?? [];
    list.push(receipt);
    // Prune receipts older than metrics window
    const cutoff = Date.now() - METRICS_WINDOW_MS;
    const pruned = list.filter((r) => r.timestamp >= cutoff);
    this.receipts.set(receipt.platform, pruned);
  }

  getMetrics(platform: DeliveryPlatform): DeliveryMetrics {
    const cutoff = Date.now() - METRICS_WINDOW_MS;
    const list = (this.receipts.get(platform) ?? []).filter((r) => r.timestamp >= cutoff);

    const total = list.length;
    const success = list.filter((r) => r.success).length;
    const failure = total - success;

    const recentFailures = list
      .filter((r) => !r.success && r.error)
      .slice(-MAX_RECENT_FAILURES)
      .map((r) => ({ timestamp: r.timestamp, error: r.error! }));

    return {
      total,
      success,
      failure,
      successRate: total > 0 ? success / total : 1,
      recentFailures,
    };
  }

  getAllMetrics(): Record<DeliveryPlatform, DeliveryMetrics> {
    return {
      discord: this.getMetrics('discord'),
      telegram: this.getMetrics('telegram'),
      slack: this.getMetrics('slack'),
    };
  }

  reset(): void {
    this.receipts.clear();
  }
}

/** Global singleton */
let globalTracker: DeliveryTracker | null = null;

export function getDeliveryTracker(): DeliveryTracker {
  if (!globalTracker) {
    globalTracker = new DeliveryTracker();
  }
  return globalTracker;
}
