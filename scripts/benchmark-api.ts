#!/usr/bin/env bun
/**
 * benchmark-api.ts — Measure HTTP endpoint latency for corvid-agent's critical routes.
 *
 * Usage:
 *   bun scripts/benchmark-api.ts [--json] [--requests <n>] [--concurrency <n>] [--base-url <url>]
 *
 * Options:
 *   --requests <n>     Total requests per endpoint (default: 100)
 *   --concurrency <n>  Concurrent requests per batch (default: 10)
 *   --base-url <url>   Server base URL (default: http://localhost:3000)
 *   --json             Output results as JSON
 *   --endpoint <path>  Benchmark a single endpoint path only
 *
 * Measures:
 *   - p50, p95, p99 latency in milliseconds
 *   - Success rate
 *   - Error breakdown
 *
 * Success criteria (v1.0.0):
 *   - API p95 < 200ms for all critical endpoints under normal load
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/1989
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface EndpointConfig {
  name: string;
  method: string;
  path: string;
  expectedStatus?: number;
  /** Headers to include in the request */
  headers?: Record<string, string>;
}

interface RequestResult {
  durationMs: number;
  status: number;
  ok: boolean;
  error?: string;
}

interface PercentileResult {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

interface EndpointResult {
  name: string;
  method: string;
  path: string;
  requests: number;
  concurrency: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  latency: PercentileResult;
  p95PassesSLA: boolean;
  errors: Record<string, number>;
}

interface BenchmarkResult {
  timestamp: string;
  baseUrl: string;
  requests: number;
  concurrency: number;
  endpoints: EndpointResult[];
  summary: {
    allPassSLA: boolean;
    worstP95Ms: number;
    worstEndpoint: string;
    slaThresholdMs: number;
  };
}

// ─── Config ──────────────────────────────────────────────────────────────────

/** Default critical endpoints for v1.0.0 benchmarking */
const CRITICAL_ENDPOINTS: EndpointConfig[] = [
  { name: 'Health (liveness)', method: 'GET', path: '/health/live', expectedStatus: 200 },
  { name: 'Health (full)', method: 'GET', path: '/api/health', expectedStatus: 200 },
  { name: 'Sessions (list)', method: 'GET', path: '/api/sessions', expectedStatus: 200 },
  { name: 'Work tasks (list)', method: 'GET', path: '/api/work-tasks', expectedStatus: 200 },
  { name: 'Work tasks (queue status)', method: 'GET', path: '/api/work-tasks/queue-status', expectedStatus: 200 },
  { name: 'Agents (list)', method: 'GET', path: '/api/agents', expectedStatus: 200 },
  { name: 'Performance (snapshot)', method: 'GET', path: '/api/performance/snapshot', expectedStatus: 200 },
];

/** v1.0.0 SLA: p95 must be under this threshold */
const P95_SLA_MS = 200;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentiles(samples: number[]): PercentileResult {
  if (samples.length === 0) {
    return { p50: 0, p75: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const pct = (p: number) => sorted[Math.min(Math.ceil(p * n) - 1, n - 1)];
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return {
    p50: Math.round(pct(0.5) * 100) / 100,
    p75: Math.round(pct(0.75) * 100) / 100,
    p95: Math.round(pct(0.95) * 100) / 100,
    p99: Math.round(pct(0.99) * 100) / 100,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[n - 1] * 100) / 100,
    mean: Math.round(mean * 100) / 100,
  };
}

async function singleRequest(baseUrl: string, endpoint: EndpointConfig, apiKey?: string): Promise<RequestResult> {
  const url = `${baseUrl}${endpoint.path}`;
  const headers: Record<string, string> = { ...endpoint.headers };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: endpoint.method,
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = performance.now() - start;
    return { durationMs, status: res.status, ok: res.ok };
  } catch (err) {
    const durationMs = performance.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    return { durationMs, status: 0, ok: false, error };
  }
}

async function benchmarkEndpoint(
  baseUrl: string,
  endpoint: EndpointConfig,
  totalRequests: number,
  concurrency: number,
  apiKey?: string,
): Promise<EndpointResult> {
  const results: RequestResult[] = [];
  const errors: Record<string, number> = {};

  // Run in batches of `concurrency` requests
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batchSize = Math.min(concurrency, totalRequests - i);
    const batch = Array.from({ length: batchSize }, () => singleRequest(baseUrl, endpoint, apiKey));
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);

    // Collect errors
    for (const r of batchResults) {
      if (!r.ok) {
        const key = r.error ? `error:${r.error.slice(0, 60)}` : `http:${r.status}`;
        errors[key] = (errors[key] ?? 0) + 1;
      }
    }
  }

  const successResults = results.filter((r) => r.ok);
  const durations = successResults.map((r) => r.durationMs);
  const latency = percentiles(durations);

  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    requests: totalRequests,
    concurrency,
    successCount: successResults.length,
    errorCount: results.length - successResults.length,
    successRate: Math.round((successResults.length / results.length) * 1000) / 10,
    latency,
    p95PassesSLA: latency.p95 <= P95_SLA_MS,
    errors,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<BenchmarkResult> {
  const args = process.argv.slice(2);

  const getArg = (flag: string, fallback: string): string => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
  };

  const baseUrl = getArg('--base-url', 'http://localhost:3000').replace(/\/$/, '');
  const totalRequests = Math.max(1, parseInt(getArg('--requests', '100'), 10));
  const concurrency = Math.max(1, parseInt(getArg('--concurrency', '10'), 10));
  const singleEndpoint = getArg('--endpoint', '');
  const apiKey = getArg('--api-key', process.env.CORVID_API_KEY ?? '');

  const endpoints = singleEndpoint ? CRITICAL_ENDPOINTS.filter((e) => e.path === singleEndpoint) : CRITICAL_ENDPOINTS;

  if (endpoints.length === 0) {
    console.error(`No endpoints match --endpoint ${singleEndpoint}`);
    console.error('Available paths:', CRITICAL_ENDPOINTS.map((e) => e.path).join(', '));
    process.exit(1);
  }

  // Verify server is reachable before running full benchmark
  console.error(`Connecting to ${baseUrl}...`);
  try {
    const probe = await fetch(`${baseUrl}/health/live`, { signal: AbortSignal.timeout(5_000) });
    if (!probe.ok) {
      console.error(`Warning: health check returned ${probe.status}`);
    }
  } catch (err) {
    console.error(`Error: cannot reach server at ${baseUrl}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error('  Start the server with: bun server/index.ts');
    process.exit(1);
  }

  const endpointResults: EndpointResult[] = [];
  for (const ep of endpoints) {
    process.stderr.write(`  Benchmarking ${ep.name}...`);
    const result = await benchmarkEndpoint(baseUrl, ep, totalRequests, concurrency, apiKey || undefined);
    endpointResults.push(result);
    process.stderr.write(` p95=${result.latency.p95}ms ${result.p95PassesSLA ? '✓' : '✗ FAIL'}\n`);
  }

  const worst = endpointResults.reduce((a, b) => (b.latency.p95 > a.latency.p95 ? b : a));
  const allPassSLA = endpointResults.every((r) => r.p95PassesSLA);

  return {
    timestamp: new Date().toISOString(),
    baseUrl,
    requests: totalRequests,
    concurrency,
    endpoints: endpointResults,
    summary: {
      allPassSLA,
      worstP95Ms: worst.latency.p95,
      worstEndpoint: worst.name,
      slaThresholdMs: P95_SLA_MS,
    },
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

const result = await run();
const jsonMode = process.argv.includes('--json');

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const pass = (v: boolean) => (v ? '✓' : '✗');
  const ms = (n: number) => `${n}ms`;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      corvid-agent API Latency Benchmark      ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log(`Base URL:    ${result.baseUrl}`);
  console.log(`Requests:    ${result.requests} per endpoint`);
  console.log(`Concurrency: ${result.concurrency} parallel`);
  console.log(`SLA target:  p95 < ${result.summary.slaThresholdMs}ms`);
  console.log(`Timestamp:   ${result.timestamp}`);
  console.log();

  // Header
  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
  console.log(
    `${'Endpoint'.padEnd(36)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'p99'.padStart(7)} ${'mean'.padStart(7)} ${'ok%'.padStart(5)} ${'SLA'.padStart(4)}`,
  );
  console.log('─'.repeat(80));

  for (const ep of result.endpoints) {
    const l = ep.latency;
    console.log(
      `${col(ep.name, 36)} ${ms(l.p50).padStart(7)} ${ms(l.p95).padStart(7)} ${ms(l.p99).padStart(7)} ${ms(l.mean).padStart(7)} ${`${ep.successRate}%`.padStart(5)} ${pass(ep.p95PassesSLA).padStart(4)}`,
    );
    if (ep.errorCount > 0) {
      for (const [errKey, count] of Object.entries(ep.errors)) {
        console.log(`  ⚠ ${count}x ${errKey}`);
      }
    }
  }

  console.log('─'.repeat(80));
  console.log();

  if (result.summary.allPassSLA) {
    console.log(`✓ All endpoints pass p95 < ${result.summary.slaThresholdMs}ms SLA`);
  } else {
    console.log(`✗ SLA BREACH: worst p95 = ${result.summary.worstP95Ms}ms on "${result.summary.worstEndpoint}"`);
    console.log(`  Target: p95 < ${result.summary.slaThresholdMs}ms for all endpoints`);
    process.exitCode = 1;
  }
  console.log();
}
