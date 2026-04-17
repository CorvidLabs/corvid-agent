#!/usr/bin/env bun
/**
 * benchmark-sqlite.ts — SQLite throughput benchmark for corvid-agent
 *
 * Measures read/write throughput, bulk transaction speed, concurrent access,
 * mixed load, FTS5 full-text search, and window function performance.
 * Uses WAL mode to match the production database configuration.
 *
 * Usage:
 *   bun scripts/benchmark-sqlite.ts [options]
 *
 * Options:
 *   --rows <n>       Row count for bulk operations (default: 1000)
 *   --iterations <n> Iterations for single-op benchmarks (default: 500)
 *   --json           Output results as JSON
 *   --suite <name>   Run only one suite (reads|writes|bulk|concurrent|mixed|fts5|window)
 */

import { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SuiteResult {
  suite: string;
  ops: number;
  durationMs: number;
  opsPerSec: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

interface BenchmarkReport {
  timestamp: string;
  dbMode: string;
  rowsPerBulk: number;
  iterations: number;
  suites: SuiteResult[];
  summary: {
    totalDurationMs: number;
    totalOps: number;
    fastestSuite: string;
    slowestSuite: string;
  };
}

// ─── CLI Parsing ─────────────────────────────────────────────────────────────

function parseArgs(): {
  rows: number;
  iterations: number;
  jsonMode: boolean;
  onlySuite: string | undefined;
} {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? (args[i + 1] ?? fallback) : fallback;
  };
  return {
    rows: parseInt(get('--rows', '1000'), 10),
    iterations: parseInt(get('--iterations', '500'), 10),
    jsonMode: args.includes('--json'),
    onlySuite: args.includes('--suite') ? get('--suite', '') : undefined,
  };
}

// ─── Percentile Helper ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1);
  return sorted[idx] ?? 0;
}

function buildStats(samples: number[]): Pick<SuiteResult, 'avgLatencyMs' | 'p50Ms' | 'p95Ms' | 'p99Ms'> {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);
  return {
    avgLatencyMs: parseFloat(avg.toFixed(3)),
    p50Ms: parseFloat(percentile(sorted, 50).toFixed(3)),
    p95Ms: parseFloat(percentile(sorted, 95).toFixed(3)),
    p99Ms: parseFloat(percentile(sorted, 99).toFixed(3)),
  };
}

// ─── DB Setup ────────────────────────────────────────────────────────────────

function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  // WAL mode matches production (server/db/connection.ts)
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL'); // WAL default
  db.exec('PRAGMA cache_size = -8000'); // 8 MB page cache
  return db;
}

function setupSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bench_kv (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      key   TEXT NOT NULL,
      value TEXT NOT NULL,
      ts    INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_bench_kv_key ON bench_kv (key);

    CREATE TABLE IF NOT EXISTS bench_events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id  TEXT NOT NULL,
      type      TEXT NOT NULL,
      payload   TEXT NOT NULL,
      created   INTEGER NOT NULL DEFAULT (unixepoch()),
      score     REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_bench_events_agent ON bench_events (agent_id);
    CREATE INDEX IF NOT EXISTS idx_bench_events_type  ON bench_events (type);

    CREATE VIRTUAL TABLE IF NOT EXISTS bench_fts USING fts5 (
      doc_id UNINDEXED,
      content,
      tokenize = 'porter unicode61'
    );
  `);
}

// ─── Suite Runners ────────────────────────────────────────────────────────────

/** Sequential reads: SELECT by primary key */
function runReads(db: Database, iterations: number): SuiteResult {
  // Seed some rows first
  const insert = db.prepare('INSERT INTO bench_kv (key, value) VALUES (?, ?)');
  db.transaction(() => {
    for (let i = 0; i < 100; i++) insert.run(`seed-key-${i}`, `value-${i}`);
  })();

  const select = db.prepare('SELECT * FROM bench_kv WHERE id = ?');
  const samples: number[] = [];

  for (let i = 1; i <= iterations; i++) {
    const id = (i % 100) + 1;
    const t0 = performance.now();
    select.get(id);
    samples.push(performance.now() - t0);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'sequential-reads',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

/** Sequential writes: single INSERT per transaction */
function runWrites(db: Database, iterations: number): SuiteResult {
  const insert = db.prepare("INSERT INTO bench_kv (key, value) VALUES (?, 'v')");
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    db.transaction(() => insert.run(`write-${i}`))();
    samples.push(performance.now() - t0);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'sequential-writes',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

/** Bulk transaction: all rows in one BEGIN/COMMIT */
function runBulk(db: Database, rows: number): SuiteResult {
  const insert = db.prepare('INSERT INTO bench_events (agent_id, type, payload, score) VALUES (?, ?, ?, ?)');
  const types = ['task.start', 'task.end', 'error', 'metric', 'log'];

  const t0 = performance.now();
  db.transaction(() => {
    for (let i = 0; i < rows; i++) {
      insert.run(`agent-${i % 10}`, types[i % types.length] ?? 'log', JSON.stringify({ i }), Math.random() * 100);
    }
  })();
  const durationMs = performance.now() - t0;

  return {
    suite: 'bulk-insert',
    ops: rows,
    durationMs: parseFloat(durationMs.toFixed(2)),
    opsPerSec: parseFloat((rows / (durationMs / 1000)).toFixed(1)),
    // Bulk is a single transaction; latency is the whole duration
    avgLatencyMs: parseFloat(durationMs.toFixed(3)),
    p50Ms: parseFloat(durationMs.toFixed(3)),
    p95Ms: parseFloat(durationMs.toFixed(3)),
    p99Ms: parseFloat(durationMs.toFixed(3)),
  };
}

/** Concurrent reads: simulate multiple readers via interleaved queries */
function runConcurrentReads(db: Database, iterations: number): SuiteResult {
  const select = db.prepare('SELECT id, key, value FROM bench_kv WHERE id > ? LIMIT 10');
  const samples: number[] = [];

  // Interleave 4 "concurrent" readers in round-robin
  const offsets = [0, 10, 20, 30];
  for (let i = 0; i < iterations; i++) {
    const offset = offsets[i % offsets.length] ?? 0;
    const t0 = performance.now();
    select.all(offset);
    samples.push(performance.now() - t0);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'concurrent-reads',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

/** Concurrent writes: simulate write contention via small transactions */
function runConcurrentWrites(db: Database, iterations: number): SuiteResult {
  const insert = db.prepare("INSERT INTO bench_kv (key, value) VALUES (?, 'cw')");
  const samples: number[] = [];

  // Simulate 4 concurrent writers by batching in groups of 4
  const batchSize = 4;
  const batches = Math.ceil(iterations / batchSize);
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    db.transaction(() => {
      for (let i = 0; i < batchSize && b * batchSize + i < iterations; i++) {
        insert.run(`cw-${b}-${i}`);
      }
    })();
    const elapsed = performance.now() - t0;
    // Record one sample per logical "concurrent" write
    for (let i = 0; i < batchSize; i++) samples.push(elapsed / batchSize);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'concurrent-writes',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

/** Mixed read/write load: alternating reads and writes */
function runMixed(db: Database, iterations: number): SuiteResult {
  const insert = db.prepare("INSERT INTO bench_kv (key, value) VALUES (?, 'mx')");
  const select = db.prepare('SELECT * FROM bench_kv ORDER BY RANDOM() LIMIT 5');
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    if (i % 3 === 0) {
      // 1 write per 3 ops
      db.transaction(() => insert.run(`mixed-${i}`))();
    } else {
      select.all();
    }
    samples.push(performance.now() - t0);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'mixed-load',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

/** FTS5 full-text search: porter stemmer, multi-term queries */
function runFts5(db: Database, rows: number, iterations: number): SuiteResult {
  // Seed FTS index
  const ftsInsert = db.prepare('INSERT INTO bench_fts (doc_id, content) VALUES (?, ?)');
  const words = ['agent', 'session', 'memory', 'council', 'work', 'task', 'algochat', 'governance', 'skill', 'tool'];
  db.transaction(() => {
    for (let i = 0; i < rows; i++) {
      const w1 = words[i % words.length] ?? 'agent';
      const w2 = words[(i + 3) % words.length] ?? 'session';
      ftsInsert.run(i, `${w1} ${w2} record number ${i} in the benchmark corpus`);
    }
  })();

  const queries = ['agent session', 'memory council', 'work task', 'algochat governance', 'skill tool'];
  const ftsSelect = db.prepare('SELECT doc_id, content FROM bench_fts WHERE bench_fts MATCH ? LIMIT 20');
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const q = queries[i % queries.length] ?? 'agent';
    const t0 = performance.now();
    ftsSelect.all(q);
    samples.push(performance.now() - t0);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'fts5-search',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

/** Window functions: ROW_NUMBER, RANK, running sum over event table */
function runWindowFunctions(db: Database, iterations: number): SuiteResult {
  const query = db.prepare(`
    SELECT
      id,
      agent_id,
      type,
      score,
      ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY created DESC) AS rn,
      RANK()       OVER (PARTITION BY type   ORDER BY score DESC)     AS rnk,
      SUM(score)   OVER (PARTITION BY agent_id ORDER BY created)      AS running_score
    FROM bench_events
    LIMIT 100
  `);

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    query.all();
    samples.push(performance.now() - t0);
  }

  const duration = samples.reduce((s, v) => s + v, 0);
  return {
    suite: 'window-functions',
    ops: iterations,
    durationMs: parseFloat(duration.toFixed(2)),
    opsPerSec: parseFloat((iterations / (duration / 1000)).toFixed(1)),
    ...buildStats(samples),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { rows, iterations, jsonMode, onlySuite } = parseArgs();

  const dbPath = join(tmpdir(), `corvid-bench-${Date.now()}.db`);
  const db = openDb(dbPath);

  try {
    setupSchema(db);

    if (!jsonMode) {
      console.log('\n╔════════════════════════════════════════════╗');
      console.log('║     corvid-agent SQLite Benchmark          ║');
      console.log('╚════════════════════════════════════════════╝\n');
      console.log(`  DB mode:     WAL (journal_mode=WAL)`);
      console.log(`  Rows/bulk:   ${rows}`);
      console.log(`  Iterations:  ${iterations}\n`);
    }

    type SuiteRunner = () => SuiteResult;

    const allSuites: Record<string, SuiteRunner> = {
      reads: () => runReads(db, iterations),
      writes: () => runWrites(db, iterations),
      bulk: () => runBulk(db, rows),
      'concurrent-reads': () => runConcurrentReads(db, iterations),
      'concurrent-writes': () => runConcurrentWrites(db, iterations),
      mixed: () => runMixed(db, iterations),
      fts5: () => runFts5(db, rows, iterations),
      window: () => runWindowFunctions(db, iterations),
    };

    const suiteNames = onlySuite ? [onlySuite].filter((s) => s in allSuites) : Object.keys(allSuites);

    const results: SuiteResult[] = [];
    const startAll = performance.now();

    for (const suiteName of suiteNames) {
      const runner = allSuites[suiteName];
      if (!runner) {
        console.error(`Unknown suite: ${suiteName}. Valid: ${Object.keys(allSuites).join(', ')}`);
        process.exit(1);
      }

      if (!jsonMode) {
        process.stdout.write(`  Running ${suiteName}...`);
      }

      const result = runner();
      results.push(result);

      if (!jsonMode) {
        console.log(
          `  ${result.opsPerSec.toLocaleString()} ops/s  p50=${result.p50Ms.toFixed(2)}ms  p95=${result.p95Ms.toFixed(2)}ms  p99=${result.p99Ms.toFixed(2)}ms`,
        );
      }
    }

    const totalDurationMs = performance.now() - startAll;
    const totalOps = results.reduce((s, r) => s + r.ops, 0);
    const fastest = results.reduce(
      (best, r) => (r.opsPerSec > best.opsPerSec ? r : best),
      results[0] ?? { suite: '', opsPerSec: 0 },
    );
    const slowest = results.reduce(
      (worst, r) => (r.opsPerSec < worst.opsPerSec ? r : worst),
      results[0] ?? { suite: '', opsPerSec: Infinity },
    );

    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      dbMode: 'WAL',
      rowsPerBulk: rows,
      iterations,
      suites: results,
      summary: {
        totalDurationMs: parseFloat(totalDurationMs.toFixed(2)),
        totalOps,
        fastestSuite: fastest?.suite ?? '',
        slowestSuite: slowest?.suite ?? '',
      },
    };

    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('\nSummary');
      console.log('───────');
      console.log(`  Total ops:    ${totalOps.toLocaleString()}`);
      console.log(`  Total time:   ${(totalDurationMs / 1000).toFixed(2)} s`);
      console.log(`  Fastest:      ${report.summary.fastestSuite}`);
      console.log(`  Slowest:      ${report.summary.slowestSuite}\n`);
    }
  } finally {
    db.close();
    try {
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
    } catch {
      // cleanup is best-effort
    }
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
