#!/usr/bin/env bun
/**
 * benchmark-api.ts — HTTP endpoint latency benchmarker for corvid-agent
 *
 * Measures p50/p95/p99 latency for key API endpoints under configurable concurrency.
 *
 * Usage:
 *   bun scripts/benchmark-api.ts [options]
 *
 * Options:
 *   --url <base>        Base URL (default: http://localhost:3000)
 *   --concurrency <n>   Concurrent requests per endpoint (default: 10)
 *   --iterations <n>    Requests per endpoint (default: 100)
 *   --p95-threshold <n> Fail if p95 > n ms (default: 200)
 *   --json              Output results as JSON
 *   --endpoint <name>   Run only a specific endpoint group
 *
 * Exit codes:
 *   0 — all p95 values within threshold
 *   1 — one or more endpoints exceeded p95 threshold
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface EndpointConfig {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  group: string;
}

interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
  errors: number;
}

interface EndpointResult {
  endpoint: string;
  group: string;
  method: string;
  path: string;
  stats: LatencyStats;
  exceededThreshold: boolean;
}

interface BenchmarkReport {
  timestamp: string;
  baseUrl: string;
  concurrency: number;
  iterations: number;
  p95ThresholdMs: number;
  results: EndpointResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    worstP95Ms: number;
    worstEndpoint: string;
  };
}

// ─── CLI Parsing ─────────────────────────────────────────────────────────────

function parseArgs(): {
  baseUrl: string;
  concurrency: number;
  iterations: number;
  p95Threshold: number;
  jsonMode: boolean;
  onlyGroup: string | undefined;
} {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? (args[i + 1] ?? fallback) : fallback;
  };

  return {
    baseUrl: get('--url', 'http://localhost:3000'),
    concurrency: parseInt(get('--concurrency', '10'), 10),
    iterations: parseInt(get('--iterations', '100'), 10),
    p95Threshold: parseInt(get('--p95-threshold', '200'), 10),
    jsonMode: args.includes('--json'),
    onlyGroup: args.includes('--endpoint') ? get('--endpoint', '') : undefined,
  };
}

// ─── Endpoint Registry ───────────────────────────────────────────────────────

const ENDPOINTS: EndpointConfig[] = [
  // Health
  { name: 'health-liveness', group: 'health', method: 'GET', path: '/health/live' },
  { name: 'health-readiness', group: 'health', method: 'GET', path: '/health/ready' },
  { name: 'health-api', group: 'health', method: 'GET', path: '/api/health' },

  // Sessions
  { name: 'sessions-list', group: 'sessions', method: 'GET', path: '/api/sessions' },

  // Work tasks
  { name: 'work-tasks-list', group: 'work-tasks', method: 'GET', path: '/api/work-tasks' },
  {
    name: 'work-tasks-queue-status',
    group: 'work-tasks',
    method: 'GET',
    path: '/api/work-tasks/queue-status',
  },

  // Agents
  { name: 'agents-list', group: 'agents', method: 'GET', path: '/api/agents' },

  // Performance
  {
    name: 'performance-snapshot',
    group: 'performance',
    method: 'GET',
    path: '/api/performance/snapshot',
  },
];

// ─── Latency Measurement ─────────────────────────────────────────────────────

async function measureOnce(baseUrl: string, endpoint: EndpointConfig): Promise<{ latencyMs: number; ok: boolean }> {
  const start = performance.now();
  try {
    const url = `${baseUrl}${endpoint.path}`;
    const init: RequestInit = {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (endpoint.body !== undefined) {
      init.body = JSON.stringify(endpoint.body);
    }
    const resp = await fetch(url, init);
    // Drain the body so the connection can be reused
    await resp.text();
    const latencyMs = performance.now() - start;
    // Treat server errors (5xx) as failures; 4xx are OK (e.g. 401 when no auth)
    return { latencyMs, ok: resp.status < 500 };
  } catch {
    return { latencyMs: performance.now() - start, ok: false };
  }
}

function computeStats(samples: number[], errors: number): LatencyStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, count: 0, errors };
  }
  const percentile = (p: number) => sorted[Math.min(Math.ceil((p / 100) * n) - 1, n - 1)] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  return {
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
    mean: parseFloat(mean.toFixed(2)),
    p50: parseFloat(percentile(50).toFixed(2)),
    p95: parseFloat(percentile(95).toFixed(2)),
    p99: parseFloat(percentile(99).toFixed(2)),
    count: n,
    errors,
  };
}

async function benchmarkEndpoint(
  baseUrl: string,
  endpoint: EndpointConfig,
  iterations: number,
  concurrency: number,
): Promise<{ latencies: number[]; errors: number }> {
  const latencies: number[] = [];
  let errors = 0;

  // Run in batches of `concurrency`
  const batches = Math.ceil(iterations / concurrency);
  for (let b = 0; b < batches; b++) {
    const batchSize = Math.min(concurrency, iterations - b * concurrency);
    const promises = Array.from({ length: batchSize }, () => measureOnce(baseUrl, endpoint));
    const results = await Promise.all(promises);
    for (const r of results) {
      latencies.push(r.latencyMs);
      if (!r.ok) errors++;
    }
  }

  return { latencies, errors };
}

// ─── Server Connectivity Check ────────────────────────────────────────────────

async function checkServerReachable(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/health/live`);
    return resp.status < 500;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { baseUrl, concurrency, iterations, p95Threshold, jsonMode, onlyGroup } = parseArgs();

  if (!jsonMode) {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║     corvid-agent API Benchmark             ║');
    console.log('╚════════════════════════════════════════════╝\n');
    console.log(`  Base URL:     ${baseUrl}`);
    console.log(`  Concurrency:  ${concurrency}`);
    console.log(`  Iterations:   ${iterations} per endpoint`);
    console.log(`  p95 Limit:    ${p95Threshold} ms\n`);
  }

  // Verify the server is up before running
  const reachable = await checkServerReachable(baseUrl);
  if (!reachable) {
    const msg = `Cannot reach server at ${baseUrl}. Is corvid-agent running?`;
    if (jsonMode) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(`\nERROR: ${msg}`);
      console.error('Start the server with: bun server/index.ts');
    }
    process.exit(1);
  }

  const endpoints = onlyGroup ? ENDPOINTS.filter((e) => e.group === onlyGroup) : ENDPOINTS;

  const results: EndpointResult[] = [];
  let overallFailed = false;

  for (const endpoint of endpoints) {
    if (!jsonMode) {
      process.stdout.write(`  Benchmarking ${endpoint.name}...`);
    }

    const { latencies, errors } = await benchmarkEndpoint(baseUrl, endpoint, iterations, concurrency);
    const stats = computeStats(latencies, errors);
    const exceeded = stats.p95 > p95Threshold;
    if (exceeded) overallFailed = true;

    results.push({
      endpoint: endpoint.name,
      group: endpoint.group,
      method: endpoint.method,
      path: endpoint.path,
      stats,
      exceededThreshold: exceeded,
    });

    if (!jsonMode) {
      const mark = exceeded ? ' FAIL' : ' ok';
      console.log(
        `${mark}  p50=${stats.p50.toFixed(1)}ms  p95=${stats.p95.toFixed(1)}ms  p99=${stats.p99.toFixed(1)}ms  errors=${stats.errors}`,
      );
    }
  }

  // Build summary
  const worstResult = results.reduce(
    (worst, r) => (r.stats.p95 > worst.stats.p95 ? r : worst),
    results[0] ?? { stats: { p95: 0 }, endpoint: '' },
  ) as EndpointResult;

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    baseUrl,
    concurrency,
    iterations,
    p95ThresholdMs: p95Threshold,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => !r.exceededThreshold).length,
      failed: results.filter((r) => r.exceededThreshold).length,
      worstP95Ms: worstResult?.stats.p95 ?? 0,
      worstEndpoint: worstResult?.endpoint ?? '',
    },
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { summary } = report;
    console.log('\nSummary');
    console.log('───────');
    console.log(`  Endpoints:    ${summary.total}`);
    console.log(`  Passed:       ${summary.passed}`);
    console.log(`  Failed:       ${summary.failed}`);
    console.log(`  Worst p95:    ${summary.worstP95Ms.toFixed(1)} ms (${summary.worstEndpoint})`);
    console.log(`  Threshold:    ${p95Threshold} ms\n`);
    if (overallFailed) {
      console.log('RESULT: FAIL — one or more endpoints exceeded the p95 threshold.\n');
    } else {
      console.log('RESULT: PASS — all endpoints within threshold.\n');
    }
  }

  process.exit(overallFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
