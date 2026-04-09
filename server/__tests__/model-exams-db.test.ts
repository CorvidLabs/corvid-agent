import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  deleteExamRun,
  getExamRun,
  getLatestByModel,
  getModelHistory,
  listExamRuns,
  saveExamRun,
} from '../db/model-exams';
import { runMigrations } from '../db/schema';
import type { ExamScorecard } from '../exam/types';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

function makeScorecard(overrides: Partial<ExamScorecard> = {}): ExamScorecard {
  return {
    model: 'qwen3:14b',
    timestamp: new Date().toISOString(),
    overall: 75,
    categories: {
      coding: { score: 80, passed: 4, total: 5 },
      context: { score: 60, passed: 3, total: 5 },
      tools: { score: 90, passed: 4, total: 5 },
      algochat: { score: 70, passed: 3, total: 5 },
      council: { score: 80, passed: 4, total: 5 },
      instruction: { score: 70, passed: 3, total: 5 },
      collaboration: { score: 75, passed: 3, total: 4 },
      reasoning: { score: 85, passed: 4, total: 5 },
    },
    results: [
      {
        caseId: 'coding-001',
        category: 'coding',
        name: 'Basic function',
        grade: { passed: true, reason: 'Correct output', score: 1 },
        durationMs: 1500,
      },
      {
        caseId: 'context-001',
        category: 'context',
        name: 'Follow-up question',
        grade: { passed: false, reason: 'Missed key context', score: 0.3 },
        durationMs: 2200,
      },
    ],
    durationMs: 3700,
    ...overrides,
  };
}

// ── saveExamRun ──────────────────────────────────────────────────────

describe('saveExamRun', () => {
  test('saves a run and returns it with results', () => {
    const scorecard = makeScorecard();
    const run = saveExamRun(db, scorecard);

    expect(run.id).toBeTruthy();
    expect(run.model).toBe('qwen3:14b');
    expect(run.overallScore).toBe(75);
    expect(run.totalCases).toBe(2);
    expect(run.totalPassed).toBe(1);
    expect(run.totalDurationMs).toBe(3700);
    expect(run.categories.coding.score).toBe(80);
    expect(run.results).toHaveLength(2);
  });

  test('results have correct fields', () => {
    const scorecard = makeScorecard();
    const run = saveExamRun(db, scorecard);

    const passed = run.results.find((r) => r.caseName === 'Basic function');
    expect(passed).toBeDefined();
    expect(passed!.passed).toBe(true);
    expect(passed!.score).toBe(1);
    expect(passed!.category).toBe('coding');
    expect(passed!.durationMs).toBe(1500);

    const failed = run.results.find((r) => r.caseName === 'Follow-up question');
    expect(failed).toBeDefined();
    expect(failed!.passed).toBe(false);
    expect(failed!.score).toBe(0.3);
    expect(failed!.reason).toBe('Missed key context');
  });

  test('saves multiple runs for the same model', () => {
    saveExamRun(db, makeScorecard());
    saveExamRun(db, makeScorecard());
    const runs = listExamRuns(db, { model: 'qwen3:14b' });
    expect(runs).toHaveLength(2);
  });
});

// ── getExamRun ───────────────────────────────────────────────────────

describe('getExamRun', () => {
  test('returns a run with results by id', () => {
    const saved = saveExamRun(db, makeScorecard());
    const fetched = getExamRun(db, saved.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(saved.id);
    expect(fetched!.model).toBe('qwen3:14b');
    expect(fetched!.results).toHaveLength(2);
  });

  test('returns null for unknown id', () => {
    expect(getExamRun(db, 'nonexistent')).toBeNull();
  });
});

// ── listExamRuns ─────────────────────────────────────────────────────

describe('listExamRuns', () => {
  test('returns all runs ordered by date desc', () => {
    saveExamRun(db, makeScorecard({ timestamp: '2026-01-01T00:00:00Z' }));
    saveExamRun(db, makeScorecard({ timestamp: '2026-01-02T00:00:00Z' }));
    saveExamRun(db, makeScorecard({ model: 'llama3:8b', timestamp: '2026-01-03T00:00:00Z' }));

    const runs = listExamRuns(db);
    expect(runs).toHaveLength(3);
    // Most recent first
    expect(runs[0].model).toBe('llama3:8b');
  });

  test('filters by model', () => {
    saveExamRun(db, makeScorecard({ model: 'qwen3:14b' }));
    saveExamRun(db, makeScorecard({ model: 'llama3:8b' }));

    const runs = listExamRuns(db, { model: 'qwen3:14b' });
    expect(runs).toHaveLength(1);
    expect(runs[0].model).toBe('qwen3:14b');
  });

  test('supports limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      saveExamRun(db, makeScorecard({ timestamp: `2026-01-0${i + 1}T00:00:00Z` }));
    }

    const page1 = listExamRuns(db, { limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = listExamRuns(db, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);

    const page3 = listExamRuns(db, { limit: 2, offset: 4 });
    expect(page3).toHaveLength(1);
  });

  test('list view omits individual results', () => {
    saveExamRun(db, makeScorecard());
    const runs = listExamRuns(db);
    expect(runs[0].results).toHaveLength(0);
  });
});

// ── getModelHistory ──────────────────────────────────────────────────

describe('getModelHistory', () => {
  test('returns all runs for a model with results', () => {
    saveExamRun(db, makeScorecard({ model: 'qwen3:14b', timestamp: '2026-01-01T00:00:00Z' }));
    saveExamRun(db, makeScorecard({ model: 'qwen3:14b', timestamp: '2026-01-02T00:00:00Z' }));
    saveExamRun(db, makeScorecard({ model: 'llama3:8b' }));

    const history = getModelHistory(db, 'qwen3:14b');
    expect(history).toHaveLength(2);
    // Each run includes its results
    expect(history[0].results).toHaveLength(2);
    expect(history[1].results).toHaveLength(2);
  });

  test('returns empty array for unknown model', () => {
    expect(getModelHistory(db, 'unknown')).toHaveLength(0);
  });
});

// ── getLatestByModel ─────────────────────────────────────────────────

describe('getLatestByModel', () => {
  test('returns the most recent run per model', () => {
    saveExamRun(db, makeScorecard({ model: 'qwen3:14b', overall: 60, timestamp: '2026-01-01T00:00:00Z' }));
    saveExamRun(db, makeScorecard({ model: 'qwen3:14b', overall: 80, timestamp: '2026-01-02T00:00:00Z' }));
    saveExamRun(db, makeScorecard({ model: 'llama3:8b', overall: 70, timestamp: '2026-01-01T00:00:00Z' }));

    const latest = getLatestByModel(db);
    expect(latest).toHaveLength(2);

    const qwen = latest.find((r) => r.model === 'qwen3:14b');
    expect(qwen).toBeDefined();
    expect(qwen!.overallScore).toBe(80); // latest run, not the first

    const llama = latest.find((r) => r.model === 'llama3:8b');
    expect(llama).toBeDefined();
    expect(llama!.overallScore).toBe(70);
  });

  test('returns empty array when no runs exist', () => {
    expect(getLatestByModel(db)).toHaveLength(0);
  });

  test('orders by overall score descending', () => {
    saveExamRun(db, makeScorecard({ model: 'low-scorer', overall: 30 }));
    saveExamRun(db, makeScorecard({ model: 'high-scorer', overall: 90 }));

    const latest = getLatestByModel(db);
    expect(latest[0].model).toBe('high-scorer');
    expect(latest[1].model).toBe('low-scorer');
  });
});

// ── deleteExamRun ────────────────────────────────────────────────────

describe('deleteExamRun', () => {
  test('deletes a run and its results', () => {
    const run = saveExamRun(db, makeScorecard());
    expect(deleteExamRun(db, run.id)).toBe(true);
    expect(getExamRun(db, run.id)).toBeNull();

    // Verify results are also deleted
    const resultCount = db.query('SELECT COUNT(*) as count FROM model_exam_results WHERE run_id = ?').get(run.id) as {
      count: number;
    };
    expect(resultCount.count).toBe(0);
  });

  test('returns false for unknown id', () => {
    expect(deleteExamRun(db, 'nonexistent')).toBe(false);
  });

  test('does not affect other runs', () => {
    const run1 = saveExamRun(db, makeScorecard());
    const run2 = saveExamRun(db, makeScorecard());

    deleteExamRun(db, run1.id);
    expect(getExamRun(db, run2.id)).not.toBeNull();
  });
});
