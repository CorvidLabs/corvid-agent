import { Database } from 'bun:sqlite';
import { describe, expect, it, mock } from 'bun:test';
import type { PerformanceCollector, PerformanceSnapshot, Regression } from '../performance/collector';
import { handlePerformanceRoutes } from '../routes/performance';

// --- Helpers ----------------------------------------------------------------

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

const MOCK_SNAPSHOT: PerformanceSnapshot = {
  timestamp: '2026-03-09T12:00:00.000Z',
  memory: { heapUsed: 50_000_000, heapTotal: 100_000_000, rss: 150_000_000, external: 5_000_000 },
  db: { sizeBytes: 1_000_000, latencyMs: 0.5 },
  uptime: 3600,
};

function createMockCollector(overrides?: Partial<PerformanceCollector>): PerformanceCollector {
  return {
    takeSnapshot: mock(() => MOCK_SNAPSHOT),
    getTimeSeries: mock((_metric: string, _days: number) => [{ timestamp: '2026-03-09T00:00:00Z', value: 100 }]),
    detectRegressions: mock((_threshold?: number) => [] as Regression[]),
    getStatusReportSection: mock(() => ({
      snapshot: MOCK_SNAPSHOT,
      regressions: [],
      slowQueriestoday: 0,
      metricsStoredTotal: 50,
    })),
    getMetricNames: mock(() => ['memory_rss', 'db_latency']),
    ...overrides,
  } as unknown as PerformanceCollector;
}

// --- Tests ------------------------------------------------------------------

describe('routes/performance', () => {
  const db = new Database(':memory:');

  // ── Routing ──────────────────────────────────────────────────────────

  it('returns null for non-performance paths', () => {
    const { req, url } = fakeReq('GET', '/api/agents');
    expect(handlePerformanceRoutes(req, url, db, null)).toBeNull();
  });

  it('returns 503 when collector is null', async () => {
    const { req, url } = fakeReq('GET', '/api/performance/snapshot');
    const res = handlePerformanceRoutes(req, url, db, null);
    expect(res!.status).toBe(503);
  });

  // ── Snapshot ─────────────────────────────────────────────────────────

  it('returns current snapshot', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/snapshot');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.memory.rss).toBe(150_000_000);
    expect(data.uptime).toBe(3600);
  });

  // ── Trends ───────────────────────────────────────────────────────────

  it('returns time-series trends for all metrics', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/trends');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.days).toBe(7);
    expect(data.trends).toBeDefined();
  });

  it('returns time-series for single metric', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/trends?metric=memory_rss&days=14');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.metric).toBe('memory_rss');
    expect(data.series).toHaveLength(1);
  });

  it('clamps days parameter to valid range', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/trends?days=9999');
    const res = handlePerformanceRoutes(req, url, db, collector);
    const data = await res!.json();
    expect(data.days).toBe(365);
  });

  // ── Regressions ──────────────────────────────────────────────────────

  it('returns empty regressions', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/regressions');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.hasRegressions).toBe(false);
    expect(data.criticalCount).toBe(0);
  });

  it('reports regressions with custom threshold', async () => {
    const collector = createMockCollector({
      detectRegressions: mock((_t?: number) => [
        {
          metric: 'memory_rss',
          thisWeekAvg: 200,
          lastWeekAvg: 100,
          changePercent: 100,
          severity: 'critical' as const,
        },
      ]),
    } as any);
    const { req, url } = fakeReq('GET', '/api/performance/regressions?threshold=10');
    const res = handlePerformanceRoutes(req, url, db, collector);
    const data = await res!.json();
    expect(data.hasRegressions).toBe(true);
    expect(data.criticalCount).toBe(1);
  });

  // ── Report ───────────────────────────────────────────────────────────

  it('returns performance report', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/report');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.snapshot).toBeDefined();
    expect(data.metricsStoredTotal).toBe(50);
  });

  // ── Metrics list ─────────────────────────────────────────────────────

  it('returns metric names', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/metrics');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.metrics).toEqual(['memory_rss', 'db_latency']);
  });

  // ── Manual collect ───────────────────────────────────────────────────

  it('triggers manual collection via POST', async () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('POST', '/api/performance/collect');
    const res = handlePerformanceRoutes(req, url, db, collector);
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(data.ok).toBe(true);
    expect(data.snapshot).toBeDefined();
  });

  // ── Unknown sub-path ─────────────────────────────────────────────────

  it('returns null for unmatched performance sub-paths', () => {
    const collector = createMockCollector();
    const { req, url } = fakeReq('GET', '/api/performance/unknown');
    expect(handlePerformanceRoutes(req, url, db, collector)).toBeNull();
  });
});
