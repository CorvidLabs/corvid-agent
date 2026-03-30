import type { Database, SQLQueryBindings } from 'bun:sqlite';
import type {
  Council,
  CouncilDiscussionMessage,
  CouncilLaunch,
  CouncilLaunchLog,
  CouncilLogLevel,
  CouncilOnChainMode,
  CouncilQuorumType,
  CouncilStage,
  CreateCouncilInput,
  UpdateCouncilInput,
} from '../../shared/types';
import { validateTenantOwnership, withTenantFilter } from '../tenant/db-filter';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { writeTransaction } from './pool';

interface CouncilRow {
  id: string;
  name: string;
  description: string;
  chairman_agent_id: string | null;
  discussion_rounds: number;
  on_chain_mode: string;
  quorum_type: string;
  quorum_threshold: number | null;
  created_at: string;
  updated_at: string;
}

interface CouncilMemberRow {
  council_id: string;
  agent_id: string;
  sort_order: number;
}

interface CouncilLaunchRow {
  id: string;
  council_id: string;
  project_id: string;
  prompt: string;
  stage: string;
  synthesis: string | null;
  current_discussion_round: number;
  total_discussion_rounds: number;
  chat_session_id: string | null;
  vote_type: string;
  governance_tier: number | null;
  synthesis_txid: string | null;
  created_at: string;
}

function rowToCouncil(row: CouncilRow, agentIds: string[]): Council {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    chairmanAgentId: row.chairman_agent_id,
    agentIds,
    discussionRounds: row.discussion_rounds ?? 2,
    onChainMode: (row.on_chain_mode as CouncilOnChainMode) ?? 'full',
    quorumType: (row.quorum_type as CouncilQuorumType) ?? 'majority',
    quorumThreshold: row.quorum_threshold ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLaunch(row: CouncilLaunchRow, sessionIds: string[]): CouncilLaunch {
  return {
    id: row.id,
    councilId: row.council_id,
    projectId: row.project_id,
    prompt: row.prompt,
    stage: row.stage as CouncilStage,
    synthesis: row.synthesis,
    sessionIds,
    currentDiscussionRound: row.current_discussion_round ?? 0,
    totalDiscussionRounds: row.total_discussion_rounds ?? 0,
    chatSessionId: row.chat_session_id ?? null,
    voteType: (row.vote_type as CouncilLaunch['voteType']) ?? 'standard',
    governanceTier: row.governance_tier ?? null,
    synthesisTxid: row.synthesis_txid ?? null,
    createdAt: row.created_at,
  };
}

function getMemberAgentIds(db: Database, councilId: string): string[] {
  const rows = db
    .query('SELECT agent_id FROM council_members WHERE council_id = ? ORDER BY sort_order ASC')
    .all(councilId) as CouncilMemberRow[];
  return rows.map((r) => r.agent_id);
}

// MARK: - Council CRUD

export function listCouncils(db: Database, tenantId: string = DEFAULT_TENANT_ID): Council[] {
  const { query, bindings } = withTenantFilter('SELECT * FROM councils ORDER BY updated_at DESC', tenantId);
  const rows = db.query(query).all(...bindings) as CouncilRow[];
  return rows.map((row) => rowToCouncil(row, getMemberAgentIds(db, row.id)));
}

export function getCouncil(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): Council | null {
  if (tenantId !== DEFAULT_TENANT_ID && !validateTenantOwnership(db, 'councils', id, tenantId)) return null;
  const row = db.query('SELECT * FROM councils WHERE id = ?').get(id) as CouncilRow | null;
  if (!row) return null;
  return rowToCouncil(row, getMemberAgentIds(db, row.id));
}

export function createCouncil(db: Database, input: CreateCouncilInput, tenantId: string = DEFAULT_TENANT_ID): Council {
  const id = crypto.randomUUID();

  writeTransaction(db, (db) => {
    db.query(
      `INSERT INTO councils (id, name, description, chairman_agent_id, discussion_rounds, on_chain_mode, quorum_type, quorum_threshold, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.description ?? '',
      input.chairmanAgentId ?? null,
      input.discussionRounds ?? 2,
      input.onChainMode ?? 'full',
      input.quorumType ?? 'majority',
      input.quorumThreshold ?? null,
      tenantId,
    );

    for (let i = 0; i < input.agentIds.length; i++) {
      db.query('INSERT INTO council_members (council_id, agent_id, sort_order) VALUES (?, ?, ?)').run(
        id,
        input.agentIds[i],
        i,
      );
    }
  });

  return getCouncil(db, id) as Council;
}

export function updateCouncil(
  db: Database,
  id: string,
  input: UpdateCouncilInput,
  tenantId: string = DEFAULT_TENANT_ID,
): Council | null {
  const existing = getCouncil(db, id, tenantId);
  if (!existing) return null;

  writeTransaction(db, (db) => {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push('description = ?');
      values.push(input.description);
    }
    if (input.chairmanAgentId !== undefined) {
      fields.push('chairman_agent_id = ?');
      values.push(input.chairmanAgentId);
    }
    if (input.discussionRounds !== undefined) {
      fields.push('discussion_rounds = ?');
      values.push(input.discussionRounds);
    }
    if (input.onChainMode !== undefined) {
      fields.push('on_chain_mode = ?');
      values.push(input.onChainMode);
    }
    if (input.quorumType !== undefined) {
      fields.push('quorum_type = ?');
      values.push(input.quorumType);
    }
    if (input.quorumThreshold !== undefined) {
      fields.push('quorum_threshold = ?');
      values.push(input.quorumThreshold);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      db.query(`UPDATE councils SET ${fields.join(', ')} WHERE id = ?`).run(...(values as SQLQueryBindings[]));
    }

    if (input.agentIds !== undefined) {
      db.query('DELETE FROM council_members WHERE council_id = ?').run(id);
      for (let i = 0; i < input.agentIds.length; i++) {
        db.query('INSERT INTO council_members (council_id, agent_id, sort_order) VALUES (?, ?, ?)').run(
          id,
          input.agentIds[i],
          i,
        );
      }
    }
  });

  return getCouncil(db, id, tenantId);
}

export function deleteCouncil(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
  if (tenantId !== DEFAULT_TENANT_ID && !validateTenantOwnership(db, 'councils', id, tenantId)) return false;
  const result = writeTransaction(db, (db) => {
    // council_launch_logs and council_discussion_messages cascade from council_launches
    // Sessions may reference council_launches via council_launch_id
    db.query(`UPDATE sessions SET council_launch_id = NULL WHERE council_launch_id IN
            (SELECT id FROM council_launches WHERE council_id = ?)`).run(id);
    db.query('DELETE FROM council_launches WHERE council_id = ?').run(id);
    // council_members has ON DELETE CASCADE, handled automatically
    return db.query('DELETE FROM councils WHERE id = ?').run(id);
  });
  return result.changes > 0;
}

// MARK: - Council Launches

export function createCouncilLaunch(
  db: Database,
  params: {
    id: string;
    councilId: string;
    projectId: string;
    prompt: string;
    voteType?: string;
    governanceTier?: number | null;
  },
  tenantId: string = DEFAULT_TENANT_ID,
): CouncilLaunchRow {
  db.query(
    `INSERT INTO council_launches (id, council_id, project_id, prompt, vote_type, governance_tier, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.councilId,
    params.projectId,
    params.prompt,
    params.voteType ?? 'standard',
    params.governanceTier ?? null,
    tenantId,
  );

  return db.query('SELECT * FROM council_launches WHERE id = ?').get(params.id) as CouncilLaunchRow;
}

export function getCouncilLaunch(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): CouncilLaunch | null {
  if (tenantId !== DEFAULT_TENANT_ID && !validateTenantOwnership(db, 'council_launches', id, tenantId)) return null;
  const row = db.query('SELECT * FROM council_launches WHERE id = ?').get(id) as CouncilLaunchRow | null;
  if (!row) return null;

  const sessionRows = db
    .query('SELECT id FROM sessions WHERE council_launch_id = ? ORDER BY created_at ASC')
    .all(id) as { id: string }[];
  const sessionIds = sessionRows.map((r) => r.id);

  return rowToLaunch(row, sessionIds);
}

export function listCouncilLaunches(
  db: Database,
  councilId?: string,
  tenantId: string = DEFAULT_TENANT_ID,
): CouncilLaunch[] {
  let rows: CouncilLaunchRow[];
  if (councilId) {
    const { query, bindings } = withTenantFilter(
      'SELECT * FROM council_launches WHERE council_id = ? ORDER BY created_at DESC',
      tenantId,
    );
    rows = db.query(query).all(councilId, ...bindings) as CouncilLaunchRow[];
  } else {
    const { query, bindings } = withTenantFilter('SELECT * FROM council_launches ORDER BY created_at DESC', tenantId);
    rows = db.query(query).all(...bindings) as CouncilLaunchRow[];
  }

  return rows.map((row) => {
    const sessionRows = db
      .query('SELECT id FROM sessions WHERE council_launch_id = ? ORDER BY created_at ASC')
      .all(row.id) as { id: string }[];
    return rowToLaunch(
      row,
      sessionRows.map((r) => r.id),
    );
  });
}

export function updateCouncilLaunchStage(db: Database, id: string, stage: CouncilStage, synthesis?: string): void {
  if (synthesis !== undefined) {
    db.query('UPDATE council_launches SET stage = ?, synthesis = ? WHERE id = ?').run(stage, synthesis, id);
  } else {
    db.query('UPDATE council_launches SET stage = ? WHERE id = ?').run(stage, id);
  }
}

// MARK: - Council Launch Logs

interface CouncilLaunchLogRow {
  id: number;
  launch_id: string;
  level: string;
  message: string;
  detail: string | null;
  created_at: string;
}

function rowToLog(row: CouncilLaunchLogRow): CouncilLaunchLog {
  return {
    id: row.id,
    launchId: row.launch_id,
    level: row.level as CouncilLogLevel,
    message: row.message,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export function addCouncilLaunchLog(
  db: Database,
  launchId: string,
  level: CouncilLogLevel,
  message: string,
  detail?: string,
): CouncilLaunchLog {
  const result = db
    .query('INSERT INTO council_launch_logs (launch_id, level, message, detail) VALUES (?, ?, ?, ?)')
    .run(launchId, level, message, detail ?? null);

  const row = db
    .query('SELECT * FROM council_launch_logs WHERE id = ?')
    .get(result.lastInsertRowid) as CouncilLaunchLogRow;
  return rowToLog(row);
}

export function getCouncilLaunchLogs(db: Database, launchId: string): CouncilLaunchLog[] {
  const rows = db
    .query('SELECT * FROM council_launch_logs WHERE launch_id = ? ORDER BY created_at ASC, id ASC')
    .all(launchId) as CouncilLaunchLogRow[];
  return rows.map(rowToLog);
}

// MARK: - Council Discussion Messages

interface CouncilDiscussionMessageRow {
  id: number;
  launch_id: string;
  agent_id: string;
  agent_name: string;
  round: number;
  content: string;
  txid: string | null;
  session_id: string | null;
  created_at: string;
}

function rowToDiscussionMessage(row: CouncilDiscussionMessageRow): CouncilDiscussionMessage {
  return {
    id: row.id,
    launchId: row.launch_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    round: row.round,
    content: row.content,
    txid: row.txid,
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}

export function insertDiscussionMessage(
  db: Database,
  params: {
    launchId: string;
    agentId: string;
    agentName: string;
    round: number;
    content: string;
    txid?: string | null;
    sessionId?: string | null;
  },
): CouncilDiscussionMessage {
  const result = db
    .query(
      `INSERT INTO council_discussion_messages (launch_id, agent_id, agent_name, round, content, txid, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.launchId,
      params.agentId,
      params.agentName,
      params.round,
      params.content,
      params.txid ?? null,
      params.sessionId ?? null,
    );

  const row = db
    .query('SELECT * FROM council_discussion_messages WHERE id = ?')
    .get(result.lastInsertRowid) as CouncilDiscussionMessageRow;
  return rowToDiscussionMessage(row);
}

export function getDiscussionMessages(db: Database, launchId: string): CouncilDiscussionMessage[] {
  const rows = db
    .query('SELECT * FROM council_discussion_messages WHERE launch_id = ? ORDER BY round ASC, id ASC')
    .all(launchId) as CouncilDiscussionMessageRow[];
  return rows.map(rowToDiscussionMessage);
}

export function updateCouncilLaunchDiscussionRound(
  db: Database,
  launchId: string,
  round: number,
  totalRounds?: number,
): void {
  if (totalRounds !== undefined) {
    db.query('UPDATE council_launches SET current_discussion_round = ?, total_discussion_rounds = ? WHERE id = ?').run(
      round,
      totalRounds,
      launchId,
    );
  } else {
    db.query('UPDATE council_launches SET current_discussion_round = ? WHERE id = ?').run(round, launchId);
  }
}

export function updateDiscussionMessageTxid(db: Database, messageId: number, txid: string): void {
  db.query('UPDATE council_discussion_messages SET txid = ? WHERE id = ?').run(txid, messageId);
}

export function updateCouncilLaunchSynthesisTxid(db: Database, launchId: string, synthesisTxid: string): void {
  db.query('UPDATE council_launches SET synthesis_txid = ? WHERE id = ?').run(synthesisTxid, launchId);
}

export function updateCouncilLaunchChatSession(db: Database, launchId: string, chatSessionId: string): void {
  db.query('UPDATE council_launches SET chat_session_id = ? WHERE id = ?').run(chatSessionId, launchId);
}

// MARK: - Governance Votes

interface GovernanceVoteRow {
  id: number;
  launch_id: string;
  governance_tier: number;
  affected_paths: string;
  status: string;
  human_approved: number;
  human_approved_by: string | null;
  human_approved_at: string | null;
  tenant_id: string;
  created_at: string;
  resolved_at: string | null;
}

interface GovernanceMemberVoteRow {
  id: number;
  governance_vote_id: number;
  agent_id: string;
  vote: string;
  reason: string;
  created_at: string;
}

export function createGovernanceVote(
  db: Database,
  params: {
    launchId: string;
    governanceTier: number;
    affectedPaths: string[];
    tenantId?: string;
  },
): GovernanceVoteRow {
  const result = db
    .query(`
        INSERT INTO governance_votes (launch_id, governance_tier, affected_paths, tenant_id)
        VALUES (?, ?, ?, ?)
    `)
    .run(
      params.launchId,
      params.governanceTier,
      JSON.stringify(params.affectedPaths),
      params.tenantId ?? DEFAULT_TENANT_ID,
    );

  return db.query('SELECT * FROM governance_votes WHERE id = ?').get(result.lastInsertRowid) as GovernanceVoteRow;
}

export function getGovernanceVote(db: Database, launchId: string): GovernanceVoteRow | null {
  return db.query('SELECT * FROM governance_votes WHERE launch_id = ?').get(launchId) as GovernanceVoteRow | null;
}

export function castGovernanceMemberVote(
  db: Database,
  params: {
    governanceVoteId: number;
    agentId: string;
    vote: 'approve' | 'reject' | 'abstain';
    reason?: string;
  },
): GovernanceMemberVoteRow {
  const result = db
    .query(`
        INSERT INTO governance_member_votes (governance_vote_id, agent_id, vote, reason)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(governance_vote_id, agent_id) DO UPDATE SET
            vote = excluded.vote,
            reason = excluded.reason,
            created_at = datetime('now')
    `)
    .run(params.governanceVoteId, params.agentId, params.vote, params.reason ?? '');

  return db
    .query('SELECT * FROM governance_member_votes WHERE id = ?')
    .get(result.lastInsertRowid) as GovernanceMemberVoteRow;
}

export function getGovernanceMemberVotes(db: Database, governanceVoteId: number): GovernanceMemberVoteRow[] {
  return db
    .query('SELECT * FROM governance_member_votes WHERE governance_vote_id = ? ORDER BY created_at ASC')
    .all(governanceVoteId) as GovernanceMemberVoteRow[];
}

export function updateGovernanceVoteStatus(db: Database, voteId: number, status: string, resolvedAt?: string): void {
  if (resolvedAt) {
    db.query('UPDATE governance_votes SET status = ?, resolved_at = ? WHERE id = ?').run(status, resolvedAt, voteId);
  } else {
    db.query('UPDATE governance_votes SET status = ? WHERE id = ?').run(status, voteId);
  }
}

export function approveGovernanceVoteHuman(db: Database, voteId: number, approvedBy: string): void {
  db.query(`
        UPDATE governance_votes
        SET human_approved = 1, human_approved_by = ?, human_approved_at = datetime('now')
        WHERE id = ?
    `).run(approvedBy, voteId);
}
