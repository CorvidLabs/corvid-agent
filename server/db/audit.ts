/**
 * Immutable audit log — insert-only operations for security and compliance.
 *
 * The audit_log table is append-only: no UPDATE or DELETE operations are
 * performed. Each entry captures who did what, when, and the trace context
 * for correlation with distributed traces and structured logs.
 */

import type { Database } from 'bun:sqlite';
import { getTraceId } from '../observability/trace-context';
import { createLogger } from '../lib/logger';

const log = createLogger('Audit');

// ─── Types ────────────────────────────────────────────────────────────────

export type AuditAction =
    | 'credit_grant'
    | 'credit_deduction'
    | 'schedule_create'
    | 'schedule_modify'
    | 'schedule_execute'
    | 'schedule_delete'
    | 'work_task_create'
    | 'work_task_complete'
    | 'workflow_create'
    | 'workflow_trigger'
    | 'agent_message_send'
    | 'config_change'
    | 'injection_blocked'
    | 'psk_drift_alert';

export interface AuditEntry {
    id: number;
    timestamp: string;
    action: AuditAction;
    actor: string;
    resourceType: string;
    resourceId: string | null;
    detail: string | null;
    traceId: string | null;
    ipAddress: string | null;
}

export interface AuditQueryOptions {
    action?: string;
    actor?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    offset?: number;
    limit?: number;
}

// ─── Write operations (insert only) ──────────────────────────────────────

/**
 * Record an audit log entry. This is the only write operation on the audit_log table.
 * Automatically captures the current trace ID from AsyncLocalStorage if available.
 */
export function recordAudit(
    db: Database,
    action: AuditAction,
    actor: string,
    resourceType: string,
    resourceId?: string | null,
    detail?: string | null,
    traceId?: string | null,
    ipAddress?: string | null,
): void {
    const resolvedTraceId = traceId ?? getTraceId() ?? null;

    try {
        db.query(
            `INSERT INTO audit_log (action, actor, resource_type, resource_id, detail, trace_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
            action,
            actor,
            resourceType,
            resourceId ?? null,
            detail ?? null,
            resolvedTraceId,
            ipAddress ?? null,
        );
    } catch (err) {
        // Audit logging should never crash the caller — log and continue
        log.error('Failed to record audit entry', {
            action,
            actor,
            resourceType,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

// ─── Read operations ─────────────────────────────────────────────────────

/**
 * Query audit log entries with optional filters and pagination.
 */
export function queryAuditLog(db: Database, options: AuditQueryOptions = {}): { entries: AuditEntry[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.action) {
        conditions.push('action = ?');
        params.push(options.action);
    }
    if (options.actor) {
        conditions.push('actor = ?');
        params.push(options.actor);
    }
    if (options.resourceType) {
        conditions.push('resource_type = ?');
        params.push(options.resourceType);
    }
    if (options.startDate) {
        conditions.push('timestamp >= ?');
        params.push(options.startDate);
    }
    if (options.endDate) {
        conditions.push('timestamp <= ?');
        params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching rows
    const countRow = db.query(
        `SELECT COUNT(*) as total FROM audit_log ${whereClause}`
    ).get(...params) as { total: number };

    // Fetch paginated results
    const limit = Math.min(options.limit ?? 50, 500);
    const offset = options.offset ?? 0;

    const rows = db.query(
        `SELECT id, timestamp, action, actor, resource_type, resource_id, detail, trace_id, ip_address
         FROM audit_log ${whereClause}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Array<{
        id: number;
        timestamp: string;
        action: string;
        actor: string;
        resource_type: string;
        resource_id: string | null;
        detail: string | null;
        trace_id: string | null;
        ip_address: string | null;
    }>;

    return {
        entries: rows.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            action: r.action as AuditAction,
            actor: r.actor,
            resourceType: r.resource_type,
            resourceId: r.resource_id,
            detail: r.detail,
            traceId: r.trace_id,
            ipAddress: r.ip_address,
        })),
        total: countRow.total,
    };
}
