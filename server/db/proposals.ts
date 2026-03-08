import type { Database, SQLQueryBindings } from 'bun:sqlite';
import type {
    GovernanceProposal,
    GovernanceProposalVote,
    CreateProposalInput,
    UpdateProposalInput,
    ProposalStatus,
    ProposalDecision,
} from '../../shared/types';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { withTenantFilter } from '../tenant/db-filter';

// ─── Row types ──────────────────────────────────────────────────────────────

interface ProposalRow {
    id: string;
    title: string;
    description: string;
    author_agent_id: string;
    council_id: string | null;
    governance_tier: number;
    affected_paths: string;
    status: string;
    decision: string | null;
    quorum_threshold: number | null;
    min_voters: number | null;
    vote_start_at: string | null;
    vote_end_at: string | null;
    decided_at: string | null;
    enacted_at: string | null;
    launch_id: string | null;
    tenant_id: string;
    created_at: string;
    updated_at: string;
}

interface ProposalVoteRow {
    id: number;
    proposal_id: string;
    agent_id: string;
    vote: string;
    weight: number;
    reason: string;
    created_at: string;
}

// ─── Row converters ─────────────────────────────────────────────────────────

function rowToProposal(row: ProposalRow): GovernanceProposal {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        authorAgentId: row.author_agent_id,
        councilId: row.council_id,
        governanceTier: row.governance_tier,
        affectedPaths: JSON.parse(row.affected_paths),
        status: row.status as ProposalStatus,
        decision: row.decision as ProposalDecision | null,
        quorumThreshold: row.quorum_threshold,
        minVoters: row.min_voters,
        voteStartAt: row.vote_start_at,
        voteEndAt: row.vote_end_at,
        decidedAt: row.decided_at,
        enactedAt: row.enacted_at,
        launchId: row.launch_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function rowToVote(row: ProposalVoteRow): GovernanceProposalVote {
    return {
        id: row.id,
        proposalId: row.proposal_id,
        agentId: row.agent_id,
        vote: row.vote as 'approve' | 'reject' | 'abstain',
        weight: row.weight,
        reason: row.reason,
        createdAt: row.created_at,
    };
}

// ─── Proposal CRUD ──────────────────────────────────────────────────────────

export function createProposal(
    db: Database,
    input: CreateProposalInput,
    tenantId: string = DEFAULT_TENANT_ID,
): GovernanceProposal {
    const id = crypto.randomUUID();
    db.query(`
        INSERT INTO governance_proposals
            (id, title, description, author_agent_id, council_id, governance_tier,
             affected_paths, quorum_threshold, min_voters, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        input.title,
        input.description ?? '',
        input.authorAgentId,
        input.councilId ?? null,
        input.governanceTier ?? 2,
        JSON.stringify(input.affectedPaths ?? []),
        input.quorumThreshold ?? null,
        input.minVoters ?? null,
        tenantId,
    );

    return getProposal(db, id)!;
}

export function getProposal(db: Database, id: string): GovernanceProposal | null {
    const row = db.query('SELECT * FROM governance_proposals WHERE id = ?')
        .get(id) as ProposalRow | null;
    return row ? rowToProposal(row) : null;
}

export function listProposals(
    db: Database,
    opts?: { councilId?: string; status?: ProposalStatus; authorAgentId?: string },
    tenantId: string = DEFAULT_TENANT_ID,
): GovernanceProposal[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (opts?.councilId) {
        conditions.push('council_id = ?');
        values.push(opts.councilId);
    }
    if (opts?.status) {
        conditions.push('status = ?');
        values.push(opts.status);
    }
    if (opts?.authorAgentId) {
        conditions.push('author_agent_id = ?');
        values.push(opts.authorAgentId);
    }

    let sql = 'SELECT * FROM governance_proposals';
    if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const { query, bindings } = withTenantFilter(sql + ' ORDER BY updated_at DESC', tenantId);
    const rows = db.query(query).all(...(values as SQLQueryBindings[]), ...bindings) as ProposalRow[];
    return rows.map(rowToProposal);
}

export function updateProposal(
    db: Database,
    id: string,
    input: UpdateProposalInput,
): GovernanceProposal | null {
    const existing = getProposal(db, id);
    if (!existing) return null;
    if (existing.status !== 'draft') return null; // Only draft proposals can be edited

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
    if (input.governanceTier !== undefined) {
        fields.push('governance_tier = ?');
        values.push(input.governanceTier);
    }
    if (input.affectedPaths !== undefined) {
        fields.push('affected_paths = ?');
        values.push(JSON.stringify(input.affectedPaths));
    }
    if (input.quorumThreshold !== undefined) {
        fields.push('quorum_threshold = ?');
        values.push(input.quorumThreshold);
    }
    if (input.minVoters !== undefined) {
        fields.push('min_voters = ?');
        values.push(input.minVoters);
    }

    if (fields.length > 0) {
        fields.push("updated_at = datetime('now')");
        values.push(id);
        db.query(`UPDATE governance_proposals SET ${fields.join(', ')} WHERE id = ?`)
            .run(...(values as SQLQueryBindings[]));
    }

    return getProposal(db, id);
}

export function updateProposalStatus(
    db: Database,
    id: string,
    status: ProposalStatus,
    extras?: {
        decision?: ProposalDecision;
        decidedAt?: string;
        enactedAt?: string;
        voteStartAt?: string;
        voteEndAt?: string;
        launchId?: string;
    },
): void {
    const fields: string[] = ['status = ?', "updated_at = datetime('now')"];
    const values: unknown[] = [status];

    if (extras?.decision !== undefined) {
        fields.push('decision = ?');
        values.push(extras.decision);
    }
    if (extras?.decidedAt !== undefined) {
        fields.push('decided_at = ?');
        values.push(extras.decidedAt);
    }
    if (extras?.enactedAt !== undefined) {
        fields.push('enacted_at = ?');
        values.push(extras.enactedAt);
    }
    if (extras?.voteStartAt !== undefined) {
        fields.push('vote_start_at = ?');
        values.push(extras.voteStartAt);
    }
    if (extras?.voteEndAt !== undefined) {
        fields.push('vote_end_at = ?');
        values.push(extras.voteEndAt);
    }
    if (extras?.launchId !== undefined) {
        fields.push('launch_id = ?');
        values.push(extras.launchId);
    }

    values.push(id);
    db.query(`UPDATE governance_proposals SET ${fields.join(', ')} WHERE id = ?`)
        .run(...(values as SQLQueryBindings[]));
}

export function deleteProposal(db: Database, id: string): boolean {
    const existing = getProposal(db, id);
    if (!existing) return false;
    if (existing.status !== 'draft') return false; // Only draft proposals can be deleted
    const result = db.query('DELETE FROM governance_proposals WHERE id = ?').run(id);
    return result.changes > 0;
}

// ─── Proposal Votes ─────────────────────────────────────────────────────────

export function castProposalVote(
    db: Database,
    params: {
        proposalId: string;
        agentId: string;
        vote: 'approve' | 'reject' | 'abstain';
        weight?: number;
        reason?: string;
    },
): GovernanceProposalVote {
    const result = db.query(`
        INSERT INTO governance_proposal_votes (proposal_id, agent_id, vote, weight, reason)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id, agent_id) DO UPDATE SET
            vote = excluded.vote,
            weight = excluded.weight,
            reason = excluded.reason,
            created_at = datetime('now')
    `).run(
        params.proposalId,
        params.agentId,
        params.vote,
        params.weight ?? 50,
        params.reason ?? '',
    );

    return db.query('SELECT * FROM governance_proposal_votes WHERE id = ?')
        .get(result.lastInsertRowid) as GovernanceProposalVote;
}

export function getProposalVotes(db: Database, proposalId: string): GovernanceProposalVote[] {
    const rows = db.query(
        'SELECT * FROM governance_proposal_votes WHERE proposal_id = ? ORDER BY created_at ASC'
    ).all(proposalId) as ProposalVoteRow[];
    return rows.map(rowToVote);
}
