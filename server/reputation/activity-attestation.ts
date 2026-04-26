import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('ActivitySummaryAttestation');

export interface ActivitySummaryPayload {
  period: 'daily' | 'weekly';
  periodStart: string;
  periodEnd: string;
  sessions: { total: number; completed: number; failed: number };
  workTasks: { total: number; completed: number; failed: number; prsCreated: number };
  creditsConsumed: number;
  reputationEvents: number;
  generatedAt: string;
}

export interface ActivitySummaryRecord {
  id: number;
  period: string;
  periodStart: string;
  periodEnd: string;
  payload: string;
  hash: string;
  txid: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export class ActivitySummaryAttestation {
  constructor(private db: Database) {}

  buildPayload(period: 'daily' | 'weekly'): ActivitySummaryPayload {
    const days = period === 'daily' ? 1 : 7;
    const periodStart = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const periodEnd = new Date().toISOString();

    const sessions = this.db
      .query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'error' OR status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM sessions
        WHERE created_at >= ?
      `)
      .get(periodStart) as { total: number; completed: number; failed: number };

    const workTasks = this.db
      .query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN pr_url IS NOT NULL THEN 1 ELSE 0 END) as prsCreated
        FROM work_tasks
        WHERE created_at >= ?
      `)
      .get(periodStart) as { total: number; completed: number; failed: number; prsCreated: number };

    const credits = this.db
      .query(`
        SELECT COALESCE(SUM(credits_consumed), 0) as total
        FROM sessions
        WHERE created_at >= ?
      `)
      .get(periodStart) as { total: number };

    const events = this.db
      .query(`
        SELECT COUNT(*) as total FROM reputation_events WHERE created_at >= ?
      `)
      .get(periodStart) as { total: number };

    return {
      period,
      periodStart,
      periodEnd,
      sessions: {
        total: sessions?.total ?? 0,
        completed: sessions?.completed ?? 0,
        failed: sessions?.failed ?? 0,
      },
      workTasks: {
        total: workTasks?.total ?? 0,
        completed: workTasks?.completed ?? 0,
        failed: workTasks?.failed ?? 0,
        prsCreated: workTasks?.prsCreated ?? 0,
      },
      creditsConsumed: credits?.total ?? 0,
      reputationEvents: events?.total ?? 0,
      generatedAt: new Date().toISOString(),
    };
  }

  async hashPayload(payload: ActivitySummaryPayload): Promise<string> {
    const canonical = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async createSummary(
    period: 'daily' | 'weekly',
    sendTransaction?: (note: string) => Promise<string>,
  ): Promise<{ hash: string; txid: string | null }> {
    const payload = this.buildPayload(period);
    const canonical = JSON.stringify(payload);
    const hash = await this.hashPayload(payload);

    this.db
      .query(`
        INSERT OR REPLACE INTO activity_summaries
          (period, period_start, period_end, payload, hash, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `)
      .run(period, payload.periodStart, payload.periodEnd, canonical, hash);

    let txid: string | null = null;
    if (sendTransaction) {
      try {
        const note = `corvid-activity:${period}:${payload.periodStart.slice(0, 10)}:${hash.slice(0, 16)}`;
        txid = await sendTransaction(note);
        this.db
          .query(`
            UPDATE activity_summaries SET txid = ?, published_at = datetime('now')
            WHERE hash = ?
          `)
          .run(txid, hash);
        log.info('Published activity summary on-chain', { period, hash: hash.slice(0, 16), txid });
      } catch (err) {
        log.warn('Failed to publish activity summary on-chain (best-effort)', { err });
      }
    }

    return { hash, txid };
  }

  listSummaries(period?: string, limit = 30): ActivitySummaryRecord[] {
    const rows = period
      ? this.db
          .query('SELECT * FROM activity_summaries WHERE period = ? ORDER BY created_at DESC LIMIT ?')
          .all(period, limit)
      : this.db.query('SELECT * FROM activity_summaries ORDER BY created_at DESC LIMIT ?').all(limit);
    return (rows as Record<string, unknown>[]).map((row) => ({
      id: row.id as number,
      period: row.period as string,
      periodStart: row.period_start as string,
      periodEnd: row.period_end as string,
      payload: row.payload as string,
      hash: row.hash as string,
      txid: row.txid as string | null,
      publishedAt: row.published_at as string | null,
      createdAt: row.created_at as string,
    }));
  }
}
