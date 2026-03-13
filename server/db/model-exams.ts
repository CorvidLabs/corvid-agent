import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { writeTransaction } from './pool';
import type { ExamScorecard } from '../exam/types';

// ── Row types ────────────────────────────────────────────────────────

interface ExamRunRow {
    id: string;
    model: string;
    overall_score: number;
    total_cases: number;
    total_passed: number;
    total_duration_ms: number;
    categories_json: string;
    created_at: string;
}

interface ExamResultRow {
    id: string;
    run_id: string;
    category: string;
    case_name: string;
    passed: number;
    score: number;
    reason: string | null;
    duration_ms: number;
    created_at: string;
}

// ── Public types ─────────────────────────────────────────────────────

export interface StoredExamRun {
    id: string;
    model: string;
    overallScore: number;
    totalCases: number;
    totalPassed: number;
    totalDurationMs: number;
    categories: Record<string, { score: number; passed: number; total: number }>;
    createdAt: string;
    results: StoredExamResult[];
}

export interface StoredExamResult {
    id: string;
    runId: string;
    category: string;
    caseName: string;
    passed: boolean;
    score: number;
    reason: string | null;
    durationMs: number;
    createdAt: string;
}

export interface ListExamRunsOptions {
    model?: string;
    limit?: number;
    offset?: number;
}

// ── Mappers ──────────────────────────────────────────────────────────

function rowToRun(row: ExamRunRow, results: StoredExamResult[] = []): StoredExamRun {
    return {
        id: row.id,
        model: row.model,
        overallScore: row.overall_score,
        totalCases: row.total_cases,
        totalPassed: row.total_passed,
        totalDurationMs: row.total_duration_ms,
        categories: JSON.parse(row.categories_json),
        createdAt: row.created_at,
        results,
    };
}

function rowToResult(row: ExamResultRow): StoredExamResult {
    return {
        id: row.id,
        runId: row.run_id,
        category: row.category,
        caseName: row.case_name,
        passed: row.passed === 1,
        score: row.score,
        reason: row.reason,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
    };
}

// ── CRUD ─────────────────────────────────────────────────────────────

/** Persist a completed exam scorecard (run + all individual results). */
export function saveExamRun(db: Database, scorecard: ExamScorecard): StoredExamRun {
    const runId = crypto.randomUUID();

    const totalPassed = scorecard.results.filter(r => r.grade.passed).length;

    return writeTransaction(db, (db) => {
        db.query(
            `INSERT INTO model_exam_runs
                (id, model, overall_score, total_cases, total_passed, total_duration_ms, categories_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            runId,
            scorecard.model,
            scorecard.overall,
            scorecard.results.length,
            totalPassed,
            scorecard.durationMs,
            JSON.stringify(scorecard.categories),
            scorecard.timestamp,
        );

        const results: StoredExamResult[] = [];
        for (const r of scorecard.results) {
            const resultId = crypto.randomUUID();
            db.query(
                `INSERT INTO model_exam_results
                    (id, run_id, category, case_name, passed, score, reason, duration_ms, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                resultId,
                runId,
                r.category,
                r.name,
                r.grade.passed ? 1 : 0,
                r.grade.score,
                r.grade.reason,
                r.durationMs,
                scorecard.timestamp,
            );
            results.push({
                id: resultId,
                runId,
                category: r.category,
                caseName: r.name,
                passed: r.grade.passed,
                score: r.grade.score,
                reason: r.grade.reason,
                durationMs: r.durationMs,
                createdAt: scorecard.timestamp,
            });
        }

        return {
            id: runId,
            model: scorecard.model,
            overallScore: scorecard.overall,
            totalCases: scorecard.results.length,
            totalPassed,
            totalDurationMs: scorecard.durationMs,
            categories: scorecard.categories as Record<string, { score: number; passed: number; total: number }>,
            createdAt: scorecard.timestamp,
            results,
        };
    });
}

/** Retrieve a single exam run with its results. */
export function getExamRun(db: Database, id: string): StoredExamRun | null {
    const row = db.query('SELECT * FROM model_exam_runs WHERE id = ?').get(id) as ExamRunRow | null;
    if (!row) return null;

    const resultRows = db.query(
        'SELECT * FROM model_exam_results WHERE run_id = ? ORDER BY created_at ASC'
    ).all(id) as ExamResultRow[];

    return rowToRun(row, resultRows.map(rowToResult));
}

/** List exam runs, optionally filtered by model with pagination. */
export function listExamRuns(db: Database, opts: ListExamRunsOptions = {}): StoredExamRun[] {
    const { model, limit = 50, offset = 0 } = opts;

    let query: string;
    let bindings: SQLQueryBindings[];

    if (model) {
        query = 'SELECT * FROM model_exam_runs WHERE model = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
        bindings = [model, limit, offset];
    } else {
        query = 'SELECT * FROM model_exam_runs ORDER BY created_at DESC LIMIT ? OFFSET ?';
        bindings = [limit, offset];
    }

    const rows = db.query(query).all(...bindings) as ExamRunRow[];
    // List view omits individual results for efficiency
    return rows.map(row => rowToRun(row));
}

/** Get all runs for a specific model, ordered by date descending. */
export function getModelHistory(db: Database, model: string): StoredExamRun[] {
    const rows = db.query(
        'SELECT * FROM model_exam_runs WHERE model = ? ORDER BY created_at DESC'
    ).all(model) as ExamRunRow[];

    return rows.map(row => {
        const resultRows = db.query(
            'SELECT * FROM model_exam_results WHERE run_id = ? ORDER BY created_at ASC'
        ).all(row.id) as ExamResultRow[];
        return rowToRun(row, resultRows.map(rowToResult));
    });
}

/** Get the most recent exam run per model (for comparison dashboard). */
export function getLatestByModel(db: Database): StoredExamRun[] {
    const rows = db.query(`
        SELECT r.* FROM model_exam_runs r
        INNER JOIN (
            SELECT model, MAX(created_at) AS max_created
            FROM model_exam_runs
            GROUP BY model
        ) latest ON r.model = latest.model AND r.created_at = latest.max_created
        ORDER BY r.overall_score DESC
    `).all() as ExamRunRow[];

    return rows.map(row => rowToRun(row));
}

/** Delete an exam run and all its results. */
export function deleteExamRun(db: Database, id: string): boolean {
    const existing = db.query('SELECT id FROM model_exam_runs WHERE id = ?').get(id) as { id: string } | null;
    if (!existing) return false;

    writeTransaction(db, (db) => {
        db.query('DELETE FROM model_exam_results WHERE run_id = ?').run(id);
        db.query('DELETE FROM model_exam_runs WHERE id = ?').run(id);
    });

    return true;
}
