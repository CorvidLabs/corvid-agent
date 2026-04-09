/** Model exam run scorecards and per-case results (migration 84). */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS model_exam_runs (
        id                TEXT PRIMARY KEY,
        model             TEXT NOT NULL,
        overall_score     REAL NOT NULL,
        total_cases       INTEGER NOT NULL,
        total_passed      INTEGER NOT NULL,
        total_duration_ms INTEGER NOT NULL,
        categories_json   TEXT NOT NULL,
        created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS model_exam_results (
        id          TEXT PRIMARY KEY,
        run_id      TEXT NOT NULL REFERENCES model_exam_runs(id),
        category    TEXT NOT NULL,
        case_name   TEXT NOT NULL,
        passed      INTEGER NOT NULL DEFAULT 0,
        score       REAL NOT NULL DEFAULT 0,
        reason      TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_model_exam_runs_model ON model_exam_runs(model)`,
  `CREATE INDEX IF NOT EXISTS idx_model_exam_runs_created ON model_exam_runs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_model_exam_results_run ON model_exam_results(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_model_exam_results_category ON model_exam_results(category)`,
];
