/**
 * Database functions for governance proposals.
 *
 * Proposals follow a lifecycle: draft → open → voting → decided → enacted.
 * Each proposal belongs to a council and targets a governance tier with
 * configurable quorum rules (percentage threshold + minimum voters).
 */

import type { Database, SQLQueryBindings } from 'bun:sqlite';
import type {
  CreateProposalInput,
  GovernanceProposal,
  ProposalDecision,
  ProposalStatus,
  UpdateProposalInput,
} from '../../shared/types';
import { validateTenantOwnership, withTenantFilter } from '../tenant/db-filter';
import { DEFAULT_TENANT_ID } from '../tenant/types';

// ─── Row type ────────────────────────────────────────────────────────────────

interface ProposalRow {
  id: string;
  council_id: string;
  title: string;
  description: string;
  author_id: string;
  status: string;
  decision: string | null;
  governance_tier: number;
  affected_paths: string;
  quorum_threshold: number | null;
  minimum_voters: number | null;
  launch_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  enacted_at: string | null;
}

function rowToProposal(row: ProposalRow): GovernanceProposal {
  return {
    id: row.id,
    councilId: row.council_id,
    title: row.title,
    description: row.description,
    authorId: row.author_id,
    status: row.status as ProposalStatus,
    decision: (row.decision as ProposalDecision) ?? null,
    governanceTier: row.governance_tier,
    affectedPaths: JSON.parse(row.affected_paths),
    quorumThreshold: row.quorum_threshold,
    minimumVoters: row.minimum_voters,
    launchId: row.launch_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    enactedAt: row.enacted_at,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function createProposal(
  db: Database,
  input: CreateProposalInput,
  tenantId: string = DEFAULT_TENANT_ID,
): GovernanceProposal {
  const id = crypto.randomUUID();

  db.query(`
        INSERT INTO governance_proposals
            (id, council_id, title, description, author_id, governance_tier, affected_paths, quorum_threshold, minimum_voters, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
    id,
    input.councilId,
    input.title,
    input.description ?? '',
    input.authorId,
    input.governanceTier ?? 2,
    JSON.stringify(input.affectedPaths ?? []),
    input.quorumThreshold ?? null,
    input.minimumVoters ?? null,
    tenantId,
  );

  return getProposal(db, id, tenantId)!;
}

export function getProposal(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): GovernanceProposal | null {
  if (tenantId !== DEFAULT_TENANT_ID && !validateTenantOwnership(db, 'governance_proposals', id, tenantId)) {
    return null;
  }
  const row = db.query('SELECT * FROM governance_proposals WHERE id = ?').get(id) as ProposalRow | null;
  return row ? rowToProposal(row) : null;
}

export function listProposals(
  db: Database,
  opts?: { councilId?: string; status?: ProposalStatus },
  tenantId: string = DEFAULT_TENANT_ID,
): GovernanceProposal[] {
  const conditions: string[] = [];
  const bindings: SQLQueryBindings[] = [];

  if (opts?.councilId) {
    conditions.push('council_id = ?');
    bindings.push(opts.councilId);
  }
  if (opts?.status) {
    conditions.push('status = ?');
    bindings.push(opts.status);
  }

  let sql = 'SELECT * FROM governance_proposals';
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY updated_at DESC';

  const { query, bindings: tenantBindings } = withTenantFilter(sql, tenantId);
  const rows = db.query(query).all(...bindings, ...tenantBindings) as ProposalRow[];
  return rows.map(rowToProposal);
}

export function updateProposal(
  db: Database,
  id: string,
  input: UpdateProposalInput,
  tenantId: string = DEFAULT_TENANT_ID,
): GovernanceProposal | null {
  const existing = getProposal(db, id, tenantId);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    fields.push('title = ?');
    values.push(input.title);
  }
  if (input.description !== undefined) {
    fields.push('description = ?');
    values.push(input.description);
  }
  if (input.affectedPaths !== undefined) {
    fields.push('affected_paths = ?');
    values.push(JSON.stringify(input.affectedPaths));
  }
  if (input.quorumThreshold !== undefined) {
    fields.push('quorum_threshold = ?');
    values.push(input.quorumThreshold);
  }
  if (input.minimumVoters !== undefined) {
    fields.push('minimum_voters = ?');
    values.push(input.minimumVoters);
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.query(`UPDATE governance_proposals SET ${fields.join(', ')} WHERE id = ?`).run(
      ...(values as SQLQueryBindings[]),
    );
  }

  return getProposal(db, id, tenantId);
}

export function deleteProposal(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  if (tenantId !== DEFAULT_TENANT_ID && !validateTenantOwnership(db, 'governance_proposals', id, tenantId)) {
    return false;
  }
  const result = db.query('DELETE FROM governance_proposals WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Lifecycle transitions ───────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['open'],
  open: ['voting', 'draft'], // can go back to draft
  voting: ['decided'],
  decided: ['enacted'],
  enacted: [],
};

export function transitionProposal(
  db: Database,
  id: string,
  newStatus: ProposalStatus,
  decision?: ProposalDecision,
  tenantId: string = DEFAULT_TENANT_ID,
): GovernanceProposal | null {
  const existing = getProposal(db, id, tenantId);
  if (!existing) return null;

  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(newStatus)) {
    const valid = allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)';
    throw new Error(
      `Invalid transition: ${existing.status} → ${newStatus}. Valid transitions from "${existing.status}": ${valid}`,
    );
  }

  const fields: string[] = ['status = ?'];
  const values: SQLQueryBindings[] = [newStatus];

  if (newStatus === 'decided' && decision) {
    fields.push('decision = ?');
    values.push(decision);
    fields.push("decided_at = datetime('now')");
  }
  if (newStatus === 'enacted') {
    fields.push("enacted_at = datetime('now')");
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.query(`UPDATE governance_proposals SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProposal(db, id, tenantId);
}

export function linkProposalToLaunch(db: Database, proposalId: string, launchId: string): void {
  db.query("UPDATE governance_proposals SET launch_id = ?, updated_at = datetime('now') WHERE id = ?").run(
    launchId,
    proposalId,
  );
}
