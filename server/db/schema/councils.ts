/** Councils, governance proposals, and voting tables. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS council_discussion_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        launch_id  TEXT NOT NULL REFERENCES council_launches(id) ON DELETE CASCADE,
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        agent_name TEXT NOT NULL,
        round      INTEGER NOT NULL,
        content    TEXT NOT NULL,
        txid       TEXT DEFAULT NULL,
        session_id TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS council_launch_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        launch_id  TEXT NOT NULL REFERENCES council_launches(id) ON DELETE CASCADE,
        level      TEXT DEFAULT 'info',
        message    TEXT NOT NULL,
        detail     TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS council_launches (
        id                       TEXT PRIMARY KEY,
        council_id               TEXT NOT NULL REFERENCES councils(id),
        project_id               TEXT NOT NULL REFERENCES projects(id),
        prompt                   TEXT NOT NULL,
        stage                    TEXT DEFAULT 'responding',
        synthesis                TEXT DEFAULT NULL,
        current_discussion_round INTEGER DEFAULT 0,
        total_discussion_rounds  INTEGER DEFAULT 0,
        chat_session_id          TEXT DEFAULT NULL,
        vote_type                TEXT NOT NULL DEFAULT 'standard',
        governance_tier          INTEGER DEFAULT NULL,
        synthesis_txid           TEXT DEFAULT NULL,
        tenant_id                TEXT NOT NULL DEFAULT 'default',
        created_at               TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS council_members (
        council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
        agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (council_id, agent_id)
    )`,

  `CREATE TABLE IF NOT EXISTS councils (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        description       TEXT DEFAULT '',
        chairman_agent_id TEXT DEFAULT NULL REFERENCES agents(id),
        discussion_rounds INTEGER DEFAULT 2,
        on_chain_mode     TEXT NOT NULL DEFAULT 'full',
        quorum_type       TEXT DEFAULT 'majority',
        quorum_threshold  REAL DEFAULT NULL,
        tenant_id         TEXT NOT NULL DEFAULT 'default',
        created_at        TEXT DEFAULT (datetime('now')),
        updated_at        TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS governance_member_votes (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        governance_vote_id INTEGER NOT NULL REFERENCES governance_votes(id) ON DELETE CASCADE,
        agent_id           TEXT NOT NULL,
        vote               TEXT NOT NULL CHECK(vote IN ('approve', 'reject', 'abstain')),
        reason             TEXT NOT NULL DEFAULT '',
        created_at         TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(governance_vote_id, agent_id)
    )`,

  `CREATE TABLE IF NOT EXISTS governance_proposals (
        id                TEXT PRIMARY KEY,
        council_id        TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
        title             TEXT NOT NULL,
        description       TEXT NOT NULL DEFAULT '',
        author_id         TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'draft',
        decision          TEXT DEFAULT NULL,
        governance_tier   INTEGER NOT NULL DEFAULT 2,
        affected_paths    TEXT NOT NULL DEFAULT '[]',
        quorum_threshold  REAL DEFAULT NULL,
        minimum_voters    INTEGER DEFAULT NULL,
        launch_id         TEXT DEFAULT NULL,
        tenant_id         TEXT NOT NULL DEFAULT 'default',
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
        decided_at        TEXT DEFAULT NULL,
        enacted_at        TEXT DEFAULT NULL,
        voting_opened_at  TEXT DEFAULT NULL,
        voting_deadline   TEXT DEFAULT NULL
    )`,

  `CREATE TABLE IF NOT EXISTS proposal_vetoes (
        id          TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
        vetoer_id   TEXT NOT NULL,
        reason      TEXT NOT NULL DEFAULT '',
        vetoed_at   TEXT NOT NULL DEFAULT (datetime('now')),
        tenant_id   TEXT NOT NULL DEFAULT 'default',
        UNIQUE(proposal_id, vetoer_id)
    )`,

  `CREATE TABLE IF NOT EXISTS governance_votes (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        launch_id         TEXT NOT NULL REFERENCES council_launches(id) ON DELETE CASCADE,
        governance_tier   INTEGER NOT NULL,
        affected_paths    TEXT NOT NULL DEFAULT '[]',
        status            TEXT NOT NULL DEFAULT 'pending',
        human_approved    INTEGER NOT NULL DEFAULT 0,
        human_approved_by TEXT DEFAULT NULL,
        human_approved_at TEXT DEFAULT NULL,
        tenant_id         TEXT NOT NULL DEFAULT 'default',
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at       TEXT DEFAULT NULL
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_cdm_launch ON council_discussion_messages(launch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_council_launch_logs_launch ON council_launch_logs(launch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_council_launches_council ON council_launches(council_id)`,
  `CREATE INDEX IF NOT EXISTS idx_council_launches_council_created ON council_launches(council_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_council_launches_tenant ON council_launches(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_council_members_council ON council_members(council_id)`,
  `CREATE INDEX IF NOT EXISTS idx_councils_tenant ON councils(tenant_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_member_votes_unique ON governance_member_votes(governance_vote_id, agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gov_member_votes_vote ON governance_member_votes(governance_vote_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gov_votes_launch ON governance_votes(launch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gov_votes_status ON governance_votes(status)`,
  `CREATE INDEX IF NOT EXISTS idx_gov_votes_tenant ON governance_votes(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_governance_proposals_council ON governance_proposals(council_id)`,
  `CREATE INDEX IF NOT EXISTS idx_governance_proposals_status ON governance_proposals(status)`,
  `CREATE INDEX IF NOT EXISTS idx_governance_proposals_tenant ON governance_proposals(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_vetoes_proposal ON proposal_vetoes(proposal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_vetoes_tenant ON proposal_vetoes(tenant_id)`,
];
