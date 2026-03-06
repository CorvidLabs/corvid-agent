/**
 * Permission Broker — capability-based security for agent actions.
 *
 * Phase 1 (#557): HMAC-signed grants, action-level checks, audit trail,
 * and emergency revocation. Designed for <10ms permission checks.
 *
 * Integration: embedded in the MCP tool server, not a separate service.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';
import { recordAudit, type AuditAction } from '../db/audit';
import type {
    PermissionAction,
    PermissionGrant,
    PermissionCheckResult,
    GrantOptions,
    RevokeOptions,
} from './types';
import { TOOL_ACTION_MAP } from './types';

const log = createLogger('PermissionBroker');

/** HMAC secret — from env or a safe default for local dev. */
function getHmacSecret(): string {
    return process.env.PERMISSION_HMAC_SECRET || 'corvid-agent-dev-hmac-secret';
}

/** Sign a grant payload with HMAC-SHA256. */
async function signGrant(agentId: string, action: string, createdAt: string): Promise<string> {
    const secret = getHmacSecret();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const data = encoder.encode(`${agentId}:${action}:${createdAt}`);
    const sig = await crypto.subtle.sign('HMAC', key, data);
    // Convert to hex string
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Verify an HMAC signature on a grant. */
async function verifySignature(agentId: string, action: string, createdAt: string, signature: string): Promise<boolean> {
    const expected = await signGrant(agentId, action, createdAt);
    // Constant-time comparison via subtle.verify would be ideal,
    // but for hex strings at this length, timing leakage is negligible.
    return expected === signature;
}

// ─── DB row shape ────────────────────────────────────────────────────────

interface GrantRow {
    id: number;
    agent_id: string;
    action: string;
    granted_by: string;
    reason: string;
    signature: string;
    expires_at: string | null;
    revoked_at: string | null;
    revoked_by: string | null;
    tenant_id: string;
    created_at: string;
}

function rowToGrant(row: GrantRow): PermissionGrant {
    return {
        id: row.id,
        agentId: row.agent_id,
        action: row.action,
        grantedBy: row.granted_by,
        reason: row.reason,
        signature: row.signature,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        revokedBy: row.revoked_by,
        tenantId: row.tenant_id,
        createdAt: row.created_at,
    };
}

// ─── Permission Broker ───────────────────────────────────────────────────

export class PermissionBroker {
    constructor(private db: Database) {}

    /**
     * Check whether an agent is permitted to use a tool.
     * Returns the decision with timing and audit trail.
     *
     * Permission is granted if ANY active (non-expired, non-revoked) grant matches:
     * 1. Exact action match (e.g. "git:create_pr")
     * 2. Namespace wildcard (e.g. "git:*")
     * 3. Superuser wildcard ("*")
     */
    async checkTool(
        agentId: string,
        toolName: string,
        opts?: { sessionId?: string; tenantId?: string },
    ): Promise<PermissionCheckResult> {
        const start = performance.now();
        const action = TOOL_ACTION_MAP[toolName];
        const tenantId = opts?.tenantId ?? 'default';

        // If the tool has no action mapping, it's not gated — allow by default
        if (!action) {
            return {
                allowed: true,
                grantId: null,
                reason: `Tool "${toolName}" has no permission mapping — allowed by default`,
                checkMs: performance.now() - start,
            };
        }

        const result = await this.checkAction(agentId, action, tenantId);
        const checkMs = performance.now() - start;

        // Record the check in the audit trail
        this.recordCheck(agentId, toolName, action, result.allowed, result.grantId, result.reason, checkMs, opts?.sessionId, tenantId);

        return { ...result, checkMs };
    }

    /**
     * Check whether an agent has a grant for a specific action.
     */
    async checkAction(
        agentId: string,
        action: PermissionAction,
        tenantId: string = 'default',
    ): Promise<PermissionCheckResult> {
        const start = performance.now();
        const now = new Date().toISOString();
        const namespace = action.split(':')[0];

        // Query for matching grants: exact action, namespace wildcard, or superuser
        const rows = this.db.query(`
            SELECT * FROM permission_grants
            WHERE agent_id = ?
              AND tenant_id = ?
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > ?)
              AND (action = ? OR action = ? OR action = '*')
            ORDER BY created_at DESC
            LIMIT 1
        `).all(agentId, tenantId, now, action, `${namespace}:*`) as GrantRow[];

        if (rows.length === 0) {
            return {
                allowed: false,
                grantId: null,
                reason: `No active grant for action "${action}"`,
                checkMs: performance.now() - start,
            };
        }

        const grant = rows[0];

        // Verify HMAC signature integrity
        const valid = await verifySignature(grant.agent_id, grant.action, grant.created_at, grant.signature);
        if (!valid) {
            log.warn('Grant signature verification failed', { grantId: grant.id, agentId, action });
            return {
                allowed: false,
                grantId: grant.id,
                reason: `Grant #${grant.id} has invalid HMAC signature — possible tampering`,
                checkMs: performance.now() - start,
            };
        }

        return {
            allowed: true,
            grantId: grant.id,
            reason: `Authorized by grant #${grant.id} (action: ${grant.action})`,
            checkMs: performance.now() - start,
        };
    }

    /**
     * Grant a capability to an agent. Returns the created grant.
     */
    async grant(options: GrantOptions): Promise<PermissionGrant> {
        const { agentId, action, grantedBy, reason = '', expiresAt = null, tenantId = 'default' } = options;
        const createdAt = new Date().toISOString();
        const signature = await signGrant(agentId, action, createdAt);

        const result = this.db.query(`
            INSERT INTO permission_grants (agent_id, action, granted_by, reason, signature, expires_at, tenant_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(agentId, action, grantedBy, reason, signature, expiresAt, tenantId, createdAt);

        const grantId = Number(result.lastInsertRowid);

        recordAudit(this.db, 'permission_grant' as AuditAction, grantedBy, 'permission', String(grantId),
            JSON.stringify({ agentId, action, expiresAt }));

        log.info('Permission granted', { grantId, agentId, action, grantedBy });

        return {
            id: grantId,
            agentId,
            action,
            grantedBy,
            reason,
            signature,
            expiresAt,
            revokedAt: null,
            revokedBy: null,
            tenantId,
            createdAt,
        };
    }

    /**
     * Revoke a specific grant or all grants matching agent+action.
     */
    revoke(options: RevokeOptions): number {
        const { grantId, agentId, action, revokedBy, reason, tenantId = 'default' } = options;
        const revokedAt = new Date().toISOString();
        let affected = 0;

        if (grantId !== undefined) {
            // Revoke specific grant
            const result = this.db.query(`
                UPDATE permission_grants
                SET revoked_at = ?, revoked_by = ?
                WHERE id = ? AND revoked_at IS NULL
            `).run(revokedAt, revokedBy, grantId);
            affected = result.changes;
        } else if (agentId) {
            // Revoke all matching grants for an agent
            if (action) {
                const result = this.db.query(`
                    UPDATE permission_grants
                    SET revoked_at = ?, revoked_by = ?
                    WHERE agent_id = ? AND action = ? AND tenant_id = ? AND revoked_at IS NULL
                `).run(revokedAt, revokedBy, agentId, action, tenantId);
                affected = result.changes;
            } else {
                // Revoke ALL grants for an agent (emergency revocation)
                const result = this.db.query(`
                    UPDATE permission_grants
                    SET revoked_at = ?, revoked_by = ?
                    WHERE agent_id = ? AND tenant_id = ? AND revoked_at IS NULL
                `).run(revokedAt, revokedBy, agentId, tenantId);
                affected = result.changes;
            }
        }

        if (affected > 0) {
            recordAudit(this.db, 'permission_revoke' as AuditAction, revokedBy, 'permission',
                grantId ? String(grantId) : agentId ?? '',
                JSON.stringify({ agentId, action, reason, affected }));
            log.info('Permission revoked', { grantId, agentId, action, revokedBy, affected });
        }

        return affected;
    }

    /**
     * Emergency revocation — immediately revoke ALL grants for an agent.
     * Used for compromised agents or security incidents.
     */
    emergencyRevoke(agentId: string, revokedBy: string, reason: string): number {
        const count = this.revoke({ agentId, revokedBy, reason });
        if (count > 0) {
            log.warn('EMERGENCY REVOCATION', { agentId, revokedBy, reason, revokedCount: count });
            recordAudit(this.db, 'permission_emergency_revoke' as AuditAction, revokedBy, 'permission', agentId,
                JSON.stringify({ reason, revokedCount: count }));
        }
        return count;
    }

    /**
     * List active grants for an agent.
     */
    getGrants(agentId: string, tenantId: string = 'default'): PermissionGrant[] {
        const now = new Date().toISOString();
        const rows = this.db.query(`
            SELECT * FROM permission_grants
            WHERE agent_id = ? AND tenant_id = ?
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > ?)
            ORDER BY created_at DESC
        `).all(agentId, tenantId, now) as GrantRow[];

        return rows.map(rowToGrant);
    }

    /**
     * Get all grants (including revoked/expired) for audit purposes.
     */
    getGrantHistory(agentId: string, tenantId: string = 'default', limit: number = 50): PermissionGrant[] {
        const rows = this.db.query(`
            SELECT * FROM permission_grants
            WHERE agent_id = ? AND tenant_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(agentId, tenantId, limit) as GrantRow[];

        return rows.map(rowToGrant);
    }

    /**
     * Get the required action for a tool (for UI/documentation).
     */
    getRequiredAction(toolName: string): PermissionAction | null {
        return TOOL_ACTION_MAP[toolName] ?? null;
    }

    // ─── Private helpers ─────────────────────────────────────────────────

    private recordCheck(
        agentId: string,
        toolName: string,
        action: string,
        allowed: boolean,
        grantId: number | null,
        reason: string,
        checkMs: number,
        sessionId?: string,
        tenantId: string = 'default',
    ): void {
        try {
            this.db.query(`
                INSERT INTO permission_checks (agent_id, tool_name, action, allowed, grant_id, reason, check_ms, session_id, tenant_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(agentId, toolName, action, allowed ? 1 : 0, grantId, reason, checkMs, sessionId ?? null, tenantId);
        } catch (err) {
            // Never crash the caller — permission check audit is best-effort
            log.error('Failed to record permission check', {
                agentId, toolName, error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
