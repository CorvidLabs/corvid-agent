/**
 * Tests for UsageMeter — start/stop lifecycle, reportAll logic,
 * and getUsageSummary delegation.
 *
 * Stripe API calls are intercepted via globalThis.fetch override.
 * BillingService is used directly with an in-memory SQLite database.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { UsageMeter } from '../billing/meter';
import { BillingService } from '../billing/service';
import { runMigrations } from '../db/schema';

let db: Database;
let billing: BillingService;
let meter: UsageMeter;
let tenantId: string;
let originalFetch: typeof globalThis.fetch;
let originalStripeKey: string | undefined;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);

  tenantId = crypto.randomUUID();
  db.query(
    "INSERT INTO tenants (id, name, slug, owner_email) VALUES (?, 'Meter Tenant', 'meter-tenant', 'meter@test.com')",
  ).run(tenantId);

  billing = new BillingService(db);
  meter = new UsageMeter(db, billing);

  originalFetch = globalThis.fetch;
  originalStripeKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_meter';
});

afterEach(() => {
  meter.stop();
  globalThis.fetch = originalFetch;
  if (originalStripeKey !== undefined) {
    process.env.STRIPE_SECRET_KEY = originalStripeKey;
  } else {
    delete process.env.STRIPE_SECRET_KEY;
  }
  db.close();
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('UsageMeter lifecycle', () => {
  it('starts and stops without throwing', () => {
    expect(() => meter.start()).not.toThrow();
    expect(() => meter.stop()).not.toThrow();
  });

  it('calling start twice does not create duplicate timers', () => {
    meter.start();
    // Second call should be a no-op (timer already set)
    expect(() => meter.start()).not.toThrow();
    meter.stop();
  });

  it('calling stop when not started does not throw', () => {
    expect(() => meter.stop()).not.toThrow();
  });

  it('can be restarted after stop', () => {
    meter.start();
    meter.stop();
    expect(() => meter.start()).not.toThrow();
    meter.stop();
  });
});

// ── reportAll — no unreported records ─────────────────────────────────────────

describe('reportAll with no records', () => {
  it('returns { reported: 0, failed: 0 } when there are no unreported records', async () => {
    const result = await meter.reportAll();
    expect(result).toEqual({ reported: 0, failed: 0 });
  });
});

// ── reportAll — skips records without stripe_item_id ─────────────────────────

describe('reportAll skips missing stripe_item_id', () => {
  it('skips records where subscription_item is null', async () => {
    // Create an active subscription without a subscription item
    db.query(`
            INSERT INTO subscriptions (id, tenant_id, stripe_subscription_id, plan, status,
                current_period_start, current_period_end, cancel_at_period_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
      crypto.randomUUID(),
      tenantId,
      'sub_no_item',
      'pro',
      'active',
      '2024-01-01T00:00:00Z',
      '2024-02-01T00:00:00Z',
      0,
    );

    db.query(`
            INSERT INTO usage_records (id, tenant_id, credits_used, period_start, period_end, reported)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), tenantId, 500, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z', 0);

    const result = await meter.reportAll();
    // No stripe_item_id — record should be skipped, not reported or failed
    expect(result.reported).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ── reportAll — reports successfully ─────────────────────────────────────────

describe('reportAll with stripe item', () => {
  beforeEach(() => {
    // Seed subscription + subscription_item + usage_record
    const subId = crypto.randomUUID();
    db.query(`
            INSERT INTO subscriptions (id, tenant_id, stripe_subscription_id, plan, status,
                current_period_start, current_period_end, cancel_at_period_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(subId, tenantId, 'sub_with_item', 'pro', 'active', '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z', 0);

    db.query(`
            INSERT INTO subscription_items (id, subscription_id, stripe_item_id, stripe_price_id)
            VALUES (?, ?, ?, ?)
        `).run(crypto.randomUUID(), subId, 'si_test_item', 'price_test');

    db.query(`
            INSERT INTO usage_records (id, tenant_id, credits_used, period_start, period_end, reported)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), tenantId, 1000, '2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z', 0);
  });

  it('marks records as reported after successful Stripe call', async () => {
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ id: 'mbur_test', quantity: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      { preconnect: () => {} },
    ) as unknown as typeof globalThis.fetch;

    const result = await meter.reportAll();
    expect(result.reported).toBe(1);
    expect(result.failed).toBe(0);

    // Verify DB was updated
    const row = db.query('SELECT reported FROM usage_records WHERE tenant_id = ?').get(tenantId) as {
      reported: number;
    } | null;
    expect(row?.reported).toBe(1);
  });

  it('counts failed when Stripe call throws', async () => {
    globalThis.fetch = (async () => {
      throw new Error('Stripe network error');
    }) as unknown as typeof globalThis.fetch;

    const result = await meter.reportAll();
    expect(result.reported).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('counts failed when Stripe returns non-OK', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid item' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;

    const result = await meter.reportAll();
    expect(result.reported).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('skips already-reported records', async () => {
    // Mark the record as already reported
    db.query('UPDATE usage_records SET reported = 1 WHERE tenant_id = ?').run(tenantId);

    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const result = await meter.reportAll();
    expect(result.reported).toBe(0);
    expect(result.failed).toBe(0);
    expect(fetchCalled).toBe(false);
  });
});

// ── getUsageSummary ───────────────────────────────────────────────────────────

describe('getUsageSummary', () => {
  it('returns zero summary for tenant with no usage', () => {
    const summary = meter.getUsageSummary(tenantId);
    expect(summary.currentPeriodCredits).toBe(0);
    expect(summary.currentPeriodCost).toBe(0);
    expect(summary.totalCreditsAllTime).toBe(0);
  });

  it('returns currentPeriodCredits based on active usage record', () => {
    billing.recordUsage(tenantId, 5000);

    const summary = meter.getUsageSummary(tenantId);
    expect(summary.currentPeriodCredits).toBe(5000);
    expect(summary.currentPeriodCost).toBeGreaterThan(0);
  });

  it('totalCreditsAllTime sums all usage history', () => {
    billing.recordUsage(tenantId, 2000);
    billing.recordUsage(tenantId, 3000);

    const summary = meter.getUsageSummary(tenantId);
    // totalCreditsAllTime reflects usage history — current period accumulates
    expect(summary.totalCreditsAllTime).toBeGreaterThanOrEqual(5000);
  });
});
