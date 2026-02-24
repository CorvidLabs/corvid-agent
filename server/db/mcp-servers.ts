import type { Database, SQLQueryBindings } from 'bun:sqlite';
import type { McpServerConfig, CreateMcpServerConfigInput, UpdateMcpServerConfigInput } from '../../shared/types';
import { NotFoundError } from '../lib/errors';

interface McpServerConfigRow {
    id: string;
    agent_id: string | null;
    name: string;
    command: string;
    args: string;
    env_vars: string;
    cwd: string | null;
    enabled: number;
    created_at: string;
    updated_at: string;
}

function rowToConfig(row: McpServerConfigRow): McpServerConfig {
    return {
        id: row.id,
        agentId: row.agent_id,
        name: row.name,
        command: row.command,
        args: JSON.parse(row.args),
        envVars: JSON.parse(row.env_vars),
        cwd: row.cwd,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/** List all MCP server configs, optionally filtered by agent. */
export function listMcpServerConfigs(db: Database, agentId?: string): McpServerConfig[] {
    let rows: McpServerConfigRow[];
    if (agentId) {
        rows = db.query(
            'SELECT * FROM mcp_server_configs WHERE agent_id = ? ORDER BY name',
        ).all(agentId) as McpServerConfigRow[];
    } else {
        rows = db.query(
            'SELECT * FROM mcp_server_configs ORDER BY name',
        ).all() as McpServerConfigRow[];
    }
    return rows.map(rowToConfig);
}

/** Get a single MCP server config by ID. */
export function getMcpServerConfig(db: Database, id: string): McpServerConfig | null {
    const row = db.query(
        'SELECT * FROM mcp_server_configs WHERE id = ?',
    ).get(id) as McpServerConfigRow | null;
    return row ? rowToConfig(row) : null;
}

/**
 * Get all active (enabled) MCP server configs for a given agent.
 * Returns global configs (agent_id IS NULL) plus agent-specific ones.
 */
export function getActiveServersForAgent(db: Database, agentId: string): McpServerConfig[] {
    const rows = db.query(
        'SELECT * FROM mcp_server_configs WHERE enabled = 1 AND (agent_id IS NULL OR agent_id = ?) ORDER BY name',
    ).all(agentId) as McpServerConfigRow[];
    return rows.map(rowToConfig);
}

/** Create a new MCP server config. */
export function createMcpServerConfig(db: Database, input: CreateMcpServerConfigInput): McpServerConfig {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO mcp_server_configs (id, agent_id, name, command, args, env_vars, cwd, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        input.agentId ?? null,
        input.name,
        input.command,
        JSON.stringify(input.args ?? []),
        JSON.stringify(input.envVars ?? {}),
        input.cwd ?? null,
        input.enabled !== false ? 1 : 0,
    );

    const created = getMcpServerConfig(db, id);
    if (!created) throw new NotFoundError('MCP server config', id);
    return created;
}

/** Update an existing MCP server config. Returns null if not found. */
export function updateMcpServerConfig(db: Database, id: string, input: UpdateMcpServerConfigInput): McpServerConfig | null {
    const existing = getMcpServerConfig(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
        fields.push('name = ?');
        values.push(input.name);
    }
    if (input.command !== undefined) {
        fields.push('command = ?');
        values.push(input.command);
    }
    if (input.args !== undefined) {
        fields.push('args = ?');
        values.push(JSON.stringify(input.args));
    }
    if (input.envVars !== undefined) {
        fields.push('env_vars = ?');
        values.push(JSON.stringify(input.envVars));
    }
    if (input.cwd !== undefined) {
        fields.push('cwd = ?');
        values.push(input.cwd);
    }
    if (input.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(input.enabled ? 1 : 0);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE mcp_server_configs SET ${fields.join(', ')} WHERE id = ?`).run(...(values as SQLQueryBindings[]));
    return getMcpServerConfig(db, id);
}

/** Delete an MCP server config. Returns true if deleted, false if not found. */
export function deleteMcpServerConfig(db: Database, id: string): boolean {
    const existing = getMcpServerConfig(db, id);
    if (!existing) return false;
    db.query('DELETE FROM mcp_server_configs WHERE id = ?').run(id);
    return true;
}
