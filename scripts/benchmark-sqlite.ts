#!/usr/bin/env bun
/**
 * benchmark-sqlite.ts — Measure SQLite query performance under concurrent load.
 *
 * Usage:
 *   bun scripts/benchmark-sqlite.ts [--json] [--iterations <n>] [--workers <n>]
 *
 * Options:
 *   --iterations <n>  Queries per scenario (default: 1000)
 *   --workers <n>     Concurrent workers for parallel scenarios (default: 10)
 *   --json            Output results as JSON
 *   --db <path>       SQLite database path (default: in-memory :memory:)
 *                     Use the live database path to test real-world performance.
 *
 * Scenarios:
 *   1. Sequential reads    — single SELECT per iteration
 *   2. Sequential writes   — single INSERT per iteration
 *   3. Bulk transaction    — 100 INSERTs inside a single transaction
 *   4. Concurrent reads    — parallel SELECT from multiple workers
 *   5. Concurrent writes   — parallel INSERT with WAL mode (serialized)
 *   6. Mixed read/write    — 80% reads, 20% writes simultaneously
 *   7. FTS query           — full-text search if FTS table exists
 *   8. Complex join        — multi-table JOIN with WHERE clause
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/1989
 */

import { Database } from 'bun:sqlite';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  iterations: number;
  workers: number;
  totalMs: number;
  opsPerSec: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
  };
  errors: number;
}

interface BenchmarkResult {
  timestamp: string;
  dbPath: string;
  iterations: number;
  workers: number;
  scenarios: ScenarioResult[];
  summary: {
    fastestOpsPerSec: number;
    slowestOpsPerSec: number;
    fastestScenario: string;
    slowestScenario: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentiles(samples: number[]): ScenarioResult['latency'] {
  if (samples.length === 0) return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const pct = (p: number) => sorted[Math.min(Math.ceil(p * n) - 1, n - 1)];
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    p50: round(pct(0.5)),
    p95: round(pct(0.95)),
    p99: round(pct(0.99)),
    mean: round(mean),
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
  };
}

function setupSchema(db: Database): void {
  // Enable WAL mode for better concurrent performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA cache_size = -64000'); // 64 MB cache
  db.exec('PRAGMA temp_store = MEMORY');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bench_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      score REAL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bench_session ON bench_rows(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bench_status ON bench_rows(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bench_agent ON bench_rows(agent_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bench_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // FTS for search scenario
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bench_fts
    USING fts5(content, session_id, tokenize='porter ascii')
  `);

  // Seed some rows for read scenarios
  const insert = db.prepare(
    `INSERT OR IGNORE INTO bench_rows (session_id, agent_id, content, status, score) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(`INSERT OR IGNORE INTO bench_fts (content, session_id) VALUES (?, ?)`);
  const statuses = ['pending', 'running', 'completed', 'failed'];
  const agents = ['agent-alpha', 'agent-beta', 'agent-gamma', 'agent-delta'];
  const contents = [
    'Implement feature request for user dashboard',
    'Fix bug in authentication flow',
    'Review and merge pull request',
    'Write tests for new API endpoint',
    'Deploy to staging environment',
    'Analyze performance regression',
    'Update documentation for v1.0',
    'Refactor database connection pool',
  ];

  const seedTx = db.transaction(() => {
    for (let i = 0; i < 1000; i++) {
      const sessionId = `session-${(i % 100).toString().padStart(3, '0')}`;
      const agent = agents[i % agents.length];
      const content = contents[i % contents.length];
      const status = statuses[i % statuses.length];
      insert.run(sessionId, agent, content, status, Math.random() * 100);
    }
    for (let i = 0; i < 500; i++) {
      const sessionId = `session-${(i % 100).toString().padStart(3, '0')}`;
      const content = contents[i % contents.length];
      insertFts.run(content, sessionId);
    }
  });
  seedTx();
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

/** 1. Sequential reads — simple SELECT by indexed column */
function scenarioSequentialReads(db: Database, iterations: number): ScenarioResult {
  const stmt = db.prepare(`SELECT * FROM bench_rows WHERE session_id = ? LIMIT 10`);
  const samples: number[] = [];
  let errors = 0;
  const sessions = Array.from({ length: 100 }, (_, i) => `session-${i.toString().padStart(3, '0')}`);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    try {
      stmt.all(sessions[i % sessions.length]);
    } catch {
      errors++;
    }
    samples.push(performance.now() - t);
  }
  const totalMs = performance.now() - start;

  return {
    name: 'Sequential reads (indexed SELECT)',
    iterations,
    workers: 1,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((iterations / totalMs) * 1000),
    latency: percentiles(samples),
    errors,
  };
}

/** 2. Sequential writes — INSERT with auto-commit */
function scenarioSequentialWrites(db: Database, iterations: number): ScenarioResult {
  const stmt = db.prepare(`INSERT INTO bench_rows (session_id, agent_id, content, status) VALUES (?, ?, ?, ?)`);
  const samples: number[] = [];
  let errors = 0;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    try {
      stmt.run(`bench-write-${i}`, 'bench-agent', `content ${i}`, 'pending');
    } catch {
      errors++;
    }
    samples.push(performance.now() - t);
  }
  const totalMs = performance.now() - start;

  // Cleanup
  db.exec(`DELETE FROM bench_rows WHERE session_id LIKE 'bench-write-%'`);

  return {
    name: 'Sequential writes (auto-commit INSERT)',
    iterations,
    workers: 1,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((iterations / totalMs) * 1000),
    latency: percentiles(samples),
    errors,
  };
}

/** 3. Bulk transaction — 100 INSERTs per transaction */
function scenarioBulkTransaction(db: Database, iterations: number): ScenarioResult {
  const BATCH = 100;
  const totalOps = iterations;
  const batches = Math.ceil(totalOps / BATCH);
  const stmt = db.prepare(`INSERT INTO bench_rows (session_id, agent_id, content, status) VALUES (?, ?, ?, ?)`);
  const samples: number[] = [];
  let errors = 0;

  const start = performance.now();
  for (let b = 0; b < batches; b++) {
    const t = performance.now();
    try {
      const tx = db.transaction(() => {
        for (let i = 0; i < BATCH; i++) {
          stmt.run(`bench-bulk-${b * BATCH + i}`, 'bench-agent', `bulk content ${i}`, 'pending');
        }
      });
      tx();
    } catch {
      errors++;
    }
    samples.push(performance.now() - t);
  }
  const totalMs = performance.now() - start;

  db.exec(`DELETE FROM bench_rows WHERE session_id LIKE 'bench-bulk-%'`);

  return {
    name: `Bulk transaction (${BATCH} INSERTs/tx)`,
    iterations: batches,
    workers: 1,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((totalOps / totalMs) * 1000),
    latency: percentiles(samples),
    errors,
  };
}

/** 4. Concurrent reads — simulate multiple agents reading simultaneously */
async function scenarioConcurrentReads(db: Database, iterations: number, workers: number): Promise<ScenarioResult> {
  const stmt = db.prepare(`
    SELECT r.*, m.value as meta
    FROM bench_rows r
    LEFT JOIN bench_metadata m ON m.key = 'config'
    WHERE r.status = ? AND r.agent_id = ?
    LIMIT 20
  `);

  const statuses = ['pending', 'running', 'completed', 'failed'];
  const agents = ['agent-alpha', 'agent-beta', 'agent-gamma', 'agent-delta'];
  const allSamples: number[] = [];
  let errors = 0;

  const workerFn = async (workerId: number, count: number): Promise<number[]> => {
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = performance.now();
      try {
        stmt.all(statuses[(workerId + i) % statuses.length], agents[(workerId + i) % agents.length]);
      } catch {
        errors++;
      }
      samples.push(performance.now() - t);
      // Yield occasionally to allow other workers to run
      if (i % 50 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return samples;
  };

  const perWorker = Math.ceil(iterations / workers);
  const start = performance.now();
  const workerResults = await Promise.all(Array.from({ length: workers }, (_, i) => workerFn(i, perWorker)));
  const totalMs = performance.now() - start;

  for (const w of workerResults) allSamples.push(...w);
  const totalOps = allSamples.length;

  return {
    name: `Concurrent reads (${workers} workers)`,
    iterations: totalOps,
    workers,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((totalOps / totalMs) * 1000),
    latency: percentiles(allSamples),
    errors,
  };
}

/** 5. Concurrent writes — WAL enables concurrent reads while writing */
async function scenarioConcurrentWrites(db: Database, iterations: number, workers: number): Promise<ScenarioResult> {
  const stmt = db.prepare(`INSERT INTO bench_rows (session_id, agent_id, content, status) VALUES (?, ?, ?, ?)`);

  const allSamples: number[] = [];
  let errors = 0;

  const workerFn = async (workerId: number, count: number): Promise<number[]> => {
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = performance.now();
      try {
        stmt.run(`bench-cw-${workerId}-${i}`, `worker-${workerId}`, `concurrent write ${i}`, 'pending');
      } catch {
        errors++;
      }
      samples.push(performance.now() - t);
      if (i % 50 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return samples;
  };

  const perWorker = Math.ceil(iterations / workers);
  const start = performance.now();
  const workerResults = await Promise.all(Array.from({ length: workers }, (_, i) => workerFn(i, perWorker)));
  const totalMs = performance.now() - start;

  db.exec(`DELETE FROM bench_rows WHERE session_id LIKE 'bench-cw-%'`);

  for (const w of workerResults) allSamples.push(...w);
  const totalOps = allSamples.length;

  return {
    name: `Concurrent writes (${workers} workers, WAL)`,
    iterations: totalOps,
    workers,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((totalOps / totalMs) * 1000),
    latency: percentiles(allSamples),
    errors,
  };
}

/** 6. Mixed read/write — 80% reads, 20% writes */
async function scenarioMixedLoad(db: Database, iterations: number, workers: number): Promise<ScenarioResult> {
  const readStmt = db.prepare(`SELECT * FROM bench_rows WHERE agent_id = ? LIMIT 10`);
  const writeStmt = db.prepare(`INSERT INTO bench_rows (session_id, agent_id, content, status) VALUES (?, ?, ?, ?)`);
  const agents = ['agent-alpha', 'agent-beta', 'agent-gamma', 'agent-delta'];
  const allSamples: number[] = [];
  let errors = 0;

  const workerFn = async (workerId: number, count: number): Promise<number[]> => {
    const samples: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = performance.now();
      try {
        if (Math.random() < 0.8) {
          readStmt.all(agents[i % agents.length]);
        } else {
          writeStmt.run(`bench-mixed-${workerId}-${i}`, `worker-${workerId}`, `mixed ${i}`, 'pending');
        }
      } catch {
        errors++;
      }
      samples.push(performance.now() - t);
      if (i % 50 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return samples;
  };

  const perWorker = Math.ceil(iterations / workers);
  const start = performance.now();
  const workerResults = await Promise.all(Array.from({ length: workers }, (_, i) => workerFn(i, perWorker)));
  const totalMs = performance.now() - start;

  db.exec(`DELETE FROM bench_rows WHERE session_id LIKE 'bench-mixed-%'`);

  for (const w of workerResults) allSamples.push(...w);
  const totalOps = allSamples.length;

  return {
    name: `Mixed load (80% read / 20% write, ${workers} workers)`,
    iterations: totalOps,
    workers,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((totalOps / totalMs) * 1000),
    latency: percentiles(allSamples),
    errors,
  };
}

/** 7. FTS search */
function scenarioFtsSearch(db: Database, iterations: number): ScenarioResult {
  const stmt = db.prepare(`SELECT * FROM bench_fts WHERE bench_fts MATCH ? LIMIT 10`);
  const terms = ['feature', 'bug', 'review', 'test', 'deploy', 'performance', 'documentation', 'refactor'];
  const samples: number[] = [];
  let errors = 0;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    try {
      stmt.all(terms[i % terms.length]);
    } catch {
      errors++;
    }
    samples.push(performance.now() - t);
  }
  const totalMs = performance.now() - start;

  return {
    name: 'FTS5 full-text search',
    iterations,
    workers: 1,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((iterations / totalMs) * 1000),
    latency: percentiles(samples),
    errors,
  };
}

/** 8. Complex join */
function scenarioComplexJoin(db: Database, iterations: number): ScenarioResult {
  const stmt = db.prepare(`
    SELECT r.id, r.session_id, r.content, r.status,
           COUNT(*) OVER (PARTITION BY r.session_id) as session_count,
           AVG(r.score) OVER (PARTITION BY r.agent_id) as avg_score
    FROM bench_rows r
    WHERE r.created_at >= datetime('now', '-1 day')
      AND r.status IN ('pending', 'running')
    ORDER BY r.created_at DESC
    LIMIT 20
  `);
  const samples: number[] = [];
  let errors = 0;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    try {
      stmt.all();
    } catch {
      errors++;
    }
    samples.push(performance.now() - t);
  }
  const totalMs = performance.now() - start;

  return {
    name: 'Window function + ORDER BY',
    iterations,
    workers: 1,
    totalMs: Math.round(totalMs),
    opsPerSec: Math.round((iterations / totalMs) * 1000),
    latency: percentiles(samples),
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

  const iterations = Math.max(10, parseInt(getArg('--iterations', '1000'), 10));
  const workers = Math.max(1, parseInt(getArg('--workers', '10'), 10));
  const dbPath = getArg('--db', ':memory:');

  const db = new Database(dbPath);
  setupSchema(db);

  const scenarios: ScenarioResult[] = [];

  process.stderr.write('Running SQLite benchmark scenarios...\n');

  const runScenario = async (name: string, fn: () => ScenarioResult | Promise<ScenarioResult>) => {
    process.stderr.write(`  ${name}...`);
    const result = await fn();
    scenarios.push(result);
    process.stderr.write(` ${result.opsPerSec.toLocaleString()} ops/s, p95=${result.latency.p95}ms\n`);
  };

  await runScenario('Sequential reads', () => scenarioSequentialReads(db, iterations));
  await runScenario('Sequential writes', () => scenarioSequentialWrites(db, iterations));
  await runScenario('Bulk transaction', () => scenarioBulkTransaction(db, iterations));
  await runScenario('Concurrent reads', () => scenarioConcurrentReads(db, iterations, workers));
  await runScenario('Concurrent writes', () => scenarioConcurrentWrites(db, iterations, workers));
  await runScenario('Mixed load', () => scenarioMixedLoad(db, iterations, workers));
  await runScenario('FTS search', () => scenarioFtsSearch(db, Math.min(iterations, 500)));
  await runScenario('Complex join', () => scenarioComplexJoin(db, Math.min(iterations, 500)));

  db.close();

  const fastest = scenarios.reduce((a, b) => (b.opsPerSec > a.opsPerSec ? b : a));
  const slowest = scenarios.reduce((a, b) => (b.opsPerSec < a.opsPerSec ? b : a));

  return {
    timestamp: new Date().toISOString(),
    dbPath,
    iterations,
    workers,
    scenarios,
    summary: {
      fastestOpsPerSec: fastest.opsPerSec,
      slowestOpsPerSec: slowest.opsPerSec,
      fastestScenario: fastest.name,
      slowestScenario: slowest.name,
    },
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

const result = await run();
const jsonMode = process.argv.includes('--json');

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     corvid-agent SQLite Benchmark            ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  console.log(`Database:    ${result.dbPath}`);
  console.log(`Iterations:  ${result.iterations} per scenario`);
  console.log(`Workers:     ${result.workers} concurrent`);
  console.log(`Timestamp:   ${result.timestamp}`);
  console.log();

  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
  console.log(
    `${col('Scenario', 44)} ${'ops/s'.padStart(10)} ${'p50µs'.padStart(7)} ${'p95µs'.padStart(7)} ${'p99µs'.padStart(7)} ${'errs'.padStart(5)}`,
  );
  console.log('─'.repeat(82));

  for (const s of result.scenarios) {
    const msToUs = (ms: number) => `${Math.round(ms * 1000)}`;
    console.log(
      `${col(s.name, 44)} ${s.opsPerSec.toLocaleString().padStart(10)} ${msToUs(s.latency.p50).padStart(7)} ${msToUs(s.latency.p95).padStart(7)} ${msToUs(s.latency.p99).padStart(7)} ${String(s.errors).padStart(5)}`,
    );
  }

  console.log('─'.repeat(82));
  console.log();
  console.log(`Fastest: ${result.summary.fastestScenario} (${result.summary.fastestOpsPerSec.toLocaleString()} ops/s)`);
  console.log(`Slowest: ${result.summary.slowestScenario} (${result.summary.slowestOpsPerSec.toLocaleString()} ops/s)`);
  console.log();
}
