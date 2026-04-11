/** Telegram bridge runtime configuration table. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS telegram_config (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [];
