/**
 * Schema definitions for the AlgoChat domain.
 *
 * Tables: algochat_allowlist, algochat_conversations, algochat_messages,
 *         algochat_psk_state, psk_contacts
 */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS algochat_allowlist (
        address    TEXT PRIMARY KEY,
        label      TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS algochat_conversations (
        id               TEXT PRIMARY KEY,
        participant_addr TEXT NOT NULL,
        agent_id         TEXT REFERENCES agents(id),
        session_id       TEXT REFERENCES sessions(id),
        last_round       INTEGER DEFAULT 0,
        created_at       TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS algochat_messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        participant TEXT NOT NULL,
        content     TEXT NOT NULL,
        direction   TEXT NOT NULL DEFAULT 'inbound',
        fee         INTEGER DEFAULT 0,
        provider    TEXT DEFAULT '',
        model       TEXT DEFAULT '',
        created_at  TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS algochat_psk_state (
        address           TEXT NOT NULL,
        network           TEXT NOT NULL DEFAULT 'testnet',
        initial_psk       BLOB NOT NULL,
        label             TEXT DEFAULT '',
        send_counter      INTEGER DEFAULT 0,
        peer_last_counter INTEGER DEFAULT 0,
        seen_counters     TEXT DEFAULT '[]',
        last_round        INTEGER DEFAULT 0,
        created_at        TEXT DEFAULT (datetime('now')),
        updated_at        TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (address, network)
    )`,

    `CREATE TABLE IF NOT EXISTS psk_contacts (
        id             TEXT PRIMARY KEY,
        nickname       TEXT NOT NULL,
        network        TEXT NOT NULL,
        initial_psk    BLOB NOT NULL,
        mobile_address TEXT DEFAULT NULL,
        active         INTEGER DEFAULT 1,
        created_at     TEXT DEFAULT (datetime('now')),
        updated_at     TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_algochat_messages_created ON algochat_messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_algochat_messages_participant ON algochat_messages(participant)`,
    `CREATE INDEX IF NOT EXISTS idx_algochat_conversations_created ON algochat_conversations(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_algochat_participant ON algochat_conversations(participant_addr)`,
    `CREATE INDEX IF NOT EXISTS idx_psk_contacts_active ON psk_contacts(active, network)`,
    `CREATE INDEX IF NOT EXISTS idx_psk_contacts_network ON psk_contacts(network)`,
];
