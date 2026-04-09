/**
 * Session metrics persistence — stores tool-chain analytics collected
 * during direct-process execution for observability and model evaluation.
 *
 * @module
 */

import type { Database } from 'bun:sqlite';

export interface SessionMetricsInput {
  sessionId: string;
  model: string;
  tier: string;
  totalIterations: number;
  toolCallCount: number;
  maxChainDepth: number;
  nudgeCount: number;
  midChainNudgeCount: number;
  explorationDriftCount: number;
  stallDetected: boolean;
  stallType: string | null;
  terminationReason:
    | 'normal'
    | 'stall_repeat'
    | 'stall_same_tool'
    | 'stall_repetitive_loop'
    | 'stall_quality_exhausted'
    | 'stall_repetitive'
    | 'stall_exploration'
    | 'max_iterations'
    | 'abort'
    | 'error';
  durationMs: number;
  needsSummary: boolean;
}

export interface SessionMetricsRow {
  id: number;
  session_id: string;
  model: string;
  tier: string;
  total_iterations: number;
  tool_call_count: number;
  max_chain_depth: number;
  nudge_count: number;
  mid_chain_nudge_count: number;
  exploration_drift_count: number;
  stall_detected: number;
  stall_type: string | null;
  termination_reason: string;
  duration_ms: number;
  needs_summary: number;
  created_at: string;
}

export interface SessionMetrics {
  id: number;
  sessionId: string;
  model: string;
  tier: string;
  totalIterations: number;
  toolCallCount: number;
  maxChainDepth: number;
  nudgeCount: number;
  midChainNudgeCount: number;
  explorationDriftCount: number;
  stallDetected: boolean;
  stallType: string | null;
  terminationReason: string;
  durationMs: number;
  needsSummary: boolean;
  createdAt: string;
}

function rowToMetrics(row: SessionMetricsRow): SessionMetrics {
  return {
    id: row.id,
    sessionId: row.session_id,
    model: row.model,
    tier: row.tier,
    totalIterations: row.total_iterations,
    toolCallCount: row.tool_call_count,
    maxChainDepth: row.max_chain_depth,
    nudgeCount: row.nudge_count,
    midChainNudgeCount: row.mid_chain_nudge_count,
    explorationDriftCount: row.exploration_drift_count,
    stallDetected: row.stall_detected === 1,
    stallType: row.stall_type,
    terminationReason: row.termination_reason,
    durationMs: row.duration_ms,
    needsSummary: row.needs_summary === 1,
    createdAt: row.created_at,
  };
}

export function insertSessionMetrics(db: Database, input: SessionMetricsInput): SessionMetrics {
  const result = db
    .query(`
        INSERT INTO session_metrics (
            session_id, model, tier, total_iterations, tool_call_count,
            max_chain_depth, nudge_count, mid_chain_nudge_count,
            exploration_drift_count, stall_detected, stall_type,
            termination_reason, duration_ms, needs_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.sessionId,
      input.model,
      input.tier,
      input.totalIterations,
      input.toolCallCount,
      input.maxChainDepth,
      input.nudgeCount,
      input.midChainNudgeCount,
      input.explorationDriftCount,
      input.stallDetected ? 1 : 0,
      input.stallType,
      input.terminationReason,
      input.durationMs,
      input.needsSummary ? 1 : 0,
    );

  const row = db.query('SELECT * FROM session_metrics WHERE id = ?').get(result.lastInsertRowid) as SessionMetricsRow;
  return rowToMetrics(row);
}

export function getSessionMetrics(db: Database, sessionId: string): SessionMetrics[] {
  const rows = db
    .query('SELECT * FROM session_metrics WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as SessionMetricsRow[];
  return rows.map(rowToMetrics);
}

export function getMetricsAggregate(
  db: Database,
  options?: {
    model?: string;
    tier?: string;
    days?: number;
  },
): {
  totalSessions: number;
  avgIterations: number;
  avgToolCalls: number;
  avgChainDepth: number;
  avgNudges: number;
  stallRate: number;
  avgDurationMs: number;
  byTerminationReason: Record<string, number>;
  byStallType: Record<string, number>;
} {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (options?.model) {
    conditions.push('model = ?');
    bindings.push(options.model);
  }
  if (options?.tier) {
    conditions.push('tier = ?');
    bindings.push(options.tier);
  }
  if (options?.days) {
    conditions.push("created_at >= datetime('now', '-' || ? || ' days')");
    bindings.push(options.days);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const agg = db
    .query(`
        SELECT
            COUNT(*) as total_sessions,
            AVG(total_iterations) as avg_iterations,
            AVG(tool_call_count) as avg_tool_calls,
            AVG(max_chain_depth) as avg_chain_depth,
            AVG(nudge_count) as avg_nudges,
            AVG(CAST(stall_detected AS REAL)) as stall_rate,
            AVG(duration_ms) as avg_duration_ms
        FROM session_metrics ${where}
    `)
    .get(...bindings) as Record<string, number | null>;

  const termRows = db
    .query(`
        SELECT termination_reason, COUNT(*) as count
        FROM session_metrics ${where}
        GROUP BY termination_reason
    `)
    .all(...bindings) as { termination_reason: string; count: number }[];

  const stallWhere =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')} AND stall_detected = 1 AND stall_type IS NOT NULL`
      : 'WHERE stall_detected = 1 AND stall_type IS NOT NULL';

  const stallRows = db
    .query(`
        SELECT stall_type, COUNT(*) as count
        FROM session_metrics ${stallWhere}
        GROUP BY stall_type
    `)
    .all(...bindings) as { stall_type: string; count: number }[];

  const byTerminationReason: Record<string, number> = {};
  for (const row of termRows) {
    byTerminationReason[row.termination_reason] = row.count;
  }

  const byStallType: Record<string, number> = {};
  for (const row of stallRows) {
    byStallType[row.stall_type] = row.count;
  }

  return {
    totalSessions: (agg.total_sessions as number) ?? 0,
    avgIterations: Math.round(((agg.avg_iterations as number) ?? 0) * 100) / 100,
    avgToolCalls: Math.round(((agg.avg_tool_calls as number) ?? 0) * 100) / 100,
    avgChainDepth: Math.round(((agg.avg_chain_depth as number) ?? 0) * 100) / 100,
    avgNudges: Math.round(((agg.avg_nudges as number) ?? 0) * 100) / 100,
    stallRate: Math.round(((agg.stall_rate as number) ?? 0) * 10000) / 10000,
    avgDurationMs: Math.round((agg.avg_duration_ms as number) ?? 0),
    byTerminationReason,
    byStallType,
  };
}

export function listRecentMetrics(db: Database, limit: number = 20): SessionMetrics[] {
  const rows = db
    .query('SELECT * FROM session_metrics ORDER BY created_at DESC LIMIT ?')
    .all(limit) as SessionMetricsRow[];
  return rows.map(rowToMetrics);
}
