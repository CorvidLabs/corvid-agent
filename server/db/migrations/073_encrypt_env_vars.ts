/**
 * Migration 073: Encrypt env_vars at rest using AES-256-GCM.
 *
 * Reads all existing plaintext env_vars from `projects` and `mcp_server_configs`,
 * encrypts them, and writes them back. Skips empty objects ("{}") and already-
 * encrypted values (prefixed with "enc:").
 */

import { Database } from 'bun:sqlite';
import { encryptEnvVars, isEncrypted } from '../../lib/env-encryption';

interface EnvVarsRow {
    id: string;
    env_vars: string;
}

function encryptTable(db: Database, table: string): number {
    const rows = db.query(`SELECT id, env_vars FROM ${table}`).all() as EnvVarsRow[];
    let count = 0;

    for (const row of rows) {
        // Skip empty objects and already-encrypted values
        if (row.env_vars === '{}' || isEncrypted(row.env_vars)) continue;

        // Validate it's actually JSON before encrypting
        try {
            JSON.parse(row.env_vars);
        } catch {
            continue;
        }

        const encrypted = encryptEnvVars(row.env_vars);
        db.query(`UPDATE ${table} SET env_vars = ? WHERE id = ?`).run(encrypted, row.id);
        count++;
    }

    return count;
}

export function up(db: Database): void {
    const projectCount = encryptTable(db, 'projects');
    const mcpCount = encryptTable(db, 'mcp_server_configs');

    if (projectCount > 0 || mcpCount > 0) {
        console.log(`[Migration 073] Encrypted env_vars: ${projectCount} projects, ${mcpCount} MCP server configs`);
    }
}

export function down(_db: Database): void {
    // Down migration is intentionally a no-op.
    // Decryption on read handles both encrypted and plaintext transparently,
    // so rolling back the schema version is safe without data changes.
}
