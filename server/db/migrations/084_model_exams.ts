import type { Database } from 'bun:sqlite';

/**
 * Migration 084: Model exam persistence tables.
 *
 * Stores exam run scorecards and per-case results so that model
 * performance can be tracked over time and compared across models.
 */

export function up(db: Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS model_exam_runs (
            id                TEXT PRIMARY KEY,
            model             TEXT NOT NULL,
            overall_score     REAL NOT NULL,
            total_cases       INTEGER NOT NULL,
            total_passed      INTEGER NOT NULL,
            total_duration_ms INTEGER NOT NULL,
            categories_json   TEXT NOT NULL,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS model_exam_results (
            id          TEXT PRIMARY KEY,
            run_id      TEXT NOT NULL REFERENCES model_exam_runs(id),
            category    TEXT NOT NULL,
            case_name   TEXT NOT NULL,
            passed      INTEGER NOT NULL DEFAULT 0,
            score       REAL NOT NULL DEFAULT 0,
            reason      TEXT,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_model_exam_runs_model ON model_exam_runs(model)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_model_exam_runs_created ON model_exam_runs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_model_exam_results_run ON model_exam_results(run_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_model_exam_results_category ON model_exam_results(category)`);
}

export function down(db: Database): void {
  db.exec('DROP INDEX IF EXISTS idx_model_exam_results_category');
  db.exec('DROP INDEX IF EXISTS idx_model_exam_results_run');
  db.exec('DROP INDEX IF EXISTS idx_model_exam_runs_created');
  db.exec('DROP INDEX IF EXISTS idx_model_exam_runs_model');
  db.exec('DROP TABLE IF EXISTS model_exam_results');
  db.exec('DROP TABLE IF EXISTS model_exam_runs');
}
