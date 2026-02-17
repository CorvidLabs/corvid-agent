import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../../shared/types';

interface AgentRow {
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    append_prompt: string;
    model: string;
    provider: string;
    allowed_tools: string;
    disallowed_tools: string;
    permission_mode: string;
    max_budget_usd: number | null;
    algochat_enabled: number;
    algochat_auto: number;
    custom_flags: string;
    default_project_id: string | null;
    mcp_tool_permissions: string | null;
    wallet_address: string | null;
    wallet_mnemonic_encrypted: string | null;
    wallet_funded_algo: number;
    created_at: string;
    updated_at: string;
}

function rowToAgent(row: AgentRow): Agent {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        systemPrompt: row.system_prompt,
        appendPrompt: row.append_prompt,
        model: row.model,
        provider: row.provider || undefined,
        allowedTools: row.allowed_tools,
        disallowedTools: row.disallowed_tools,
        permissionMode: row.permission_mode as Agent['permissionMode'],
        maxBudgetUsd: row.max_budget_usd,
        algochatEnabled: row.algochat_enabled === 1,
        algochatAuto: row.algochat_auto === 1,
        customFlags: JSON.parse(row.custom_flags),
        defaultProjectId: row.default_project_id ?? null,
        mcpToolPermissions: row.mcp_tool_permissions ? JSON.parse(row.mcp_tool_permissions) : null,
        walletAddress: row.wallet_address ?? null,
        walletFundedAlgo: row.wallet_funded_algo ?? 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function listAgents(db: Database): Agent[] {
    const rows = db.query('SELECT * FROM agents ORDER BY updated_at DESC').all() as AgentRow[];
    return rows.map(rowToAgent);
}

export function getAgent(db: Database, id: string): Agent | null {
    const row = db.query('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | null;
    return row ? rowToAgent(row) : null;
}

export function createAgent(db: Database, input: CreateAgentInput): Agent {
    const id = crypto.randomUUID();
    const customFlags = JSON.stringify(input.customFlags ?? {});

    const mcpToolPermissions = input.mcpToolPermissions ? JSON.stringify(input.mcpToolPermissions) : null;

    db.query(
        `INSERT INTO agents (id, name, description, system_prompt, append_prompt, model, provider,
         allowed_tools, disallowed_tools, permission_mode, max_budget_usd,
         algochat_enabled, algochat_auto, custom_flags, default_project_id, mcp_tool_permissions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        input.name,
        input.description ?? '',
        input.systemPrompt ?? '',
        input.appendPrompt ?? '',
        input.model ?? '',
        input.provider ?? '',
        input.allowedTools ?? '',
        input.disallowedTools ?? '',
        input.permissionMode ?? 'default',
        input.maxBudgetUsd ?? null,
        input.algochatEnabled ? 1 : 0,
        input.algochatAuto ? 1 : 0,
        customFlags,
        input.defaultProjectId ?? null,
        mcpToolPermissions,
    );

    const created = getAgent(db, id);
    if (!created) throw new Error(`createAgent: INSERT succeeded but SELECT returned null for id=${id}`);
    return created;
}

export function updateAgent(db: Database, id: string, input: UpdateAgentInput): Agent | null {
    const existing = getAgent(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    const stringFields: Array<[keyof UpdateAgentInput, string]> = [
        ['name', 'name'],
        ['description', 'description'],
        ['systemPrompt', 'system_prompt'],
        ['appendPrompt', 'append_prompt'],
        ['model', 'model'],
        ['provider', 'provider'],
        ['allowedTools', 'allowed_tools'],
        ['disallowedTools', 'disallowed_tools'],
        ['permissionMode', 'permission_mode'],
    ];

    for (const [inputKey, dbCol] of stringFields) {
        if (input[inputKey] !== undefined) {
            fields.push(`${dbCol} = ?`);
            values.push(input[inputKey]);
        }
    }

    if (input.maxBudgetUsd !== undefined) {
        fields.push('max_budget_usd = ?');
        values.push(input.maxBudgetUsd);
    }
    if (input.algochatEnabled !== undefined) {
        fields.push('algochat_enabled = ?');
        values.push(input.algochatEnabled ? 1 : 0);
    }
    if (input.algochatAuto !== undefined) {
        fields.push('algochat_auto = ?');
        values.push(input.algochatAuto ? 1 : 0);
    }
    if (input.customFlags !== undefined) {
        fields.push('custom_flags = ?');
        values.push(JSON.stringify(input.customFlags));
    }
    if (input.defaultProjectId !== undefined) {
        fields.push('default_project_id = ?');
        values.push(input.defaultProjectId);
    }
    if (input.mcpToolPermissions !== undefined) {
        fields.push('mcp_tool_permissions = ?');
        values.push(input.mcpToolPermissions ? JSON.stringify(input.mcpToolPermissions) : null);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...(values as SQLQueryBindings[]));
    return getAgent(db, id);
}

export function deleteAgent(db: Database, id: string): boolean {
    const existing = getAgent(db, id);
    if (!existing) return false;

    db.transaction(() => {
        // Delete dependent records that reference this agent
        // Order matters: delete children before parents

        // work_tasks (required FK, no cascade)
        db.query('DELETE FROM work_tasks WHERE agent_id = ?').run(id);

        // agent_messages (from/to agent, no explicit FK but logically linked)
        db.query('DELETE FROM agent_messages WHERE from_agent_id = ? OR to_agent_id = ?').run(id, id);

        // Nullify optional FKs rather than delete entire records
        db.query('UPDATE councils SET chairman_agent_id = NULL WHERE chairman_agent_id = ?').run(id);
        db.query('UPDATE algochat_conversations SET agent_id = NULL WHERE agent_id = ?').run(id);

        // session_messages (child of sessions that reference this agent)
        db.query(`DELETE FROM session_messages WHERE session_id IN
            (SELECT id FROM sessions WHERE agent_id = ?)`).run(id);

        // sessions (optional FK but still blocks deletion)
        db.query('DELETE FROM sessions WHERE agent_id = ?').run(id);

        // The following have ON DELETE CASCADE and will auto-delete:
        //   agent_memories, council_members, council_discussion_messages
        // But we delete the agent itself which triggers those cascades

        // Finally delete the agent
        db.query('DELETE FROM agents WHERE id = ?').run(id);
    })();

    return true;
}

export function setAgentWallet(
    db: Database,
    agentId: string,
    walletAddress: string,
    encryptedMnemonic: string,
): void {
    db.query(
        `UPDATE agents SET wallet_address = ?, wallet_mnemonic_encrypted = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(walletAddress, encryptedMnemonic, agentId);
}

export function getAgentWalletMnemonic(db: Database, agentId: string): string | null {
    const row = db.query(
        'SELECT wallet_mnemonic_encrypted FROM agents WHERE id = ?'
    ).get(agentId) as { wallet_mnemonic_encrypted: string | null } | null;
    return row?.wallet_mnemonic_encrypted ?? null;
}

export function addAgentFunding(db: Database, agentId: string, algoAmount: number): void {
    db.query(
        `UPDATE agents SET wallet_funded_algo = wallet_funded_algo + ?, updated_at = datetime('now') WHERE id = ?`
    ).run(algoAmount, agentId);
}

export function getAlgochatEnabledAgents(db: Database): Agent[] {
    const rows = db.query(
        'SELECT * FROM agents WHERE algochat_enabled = 1 ORDER BY updated_at DESC'
    ).all() as AgentRow[];
    return rows.map(rowToAgent);
}
