import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../../shared/types';

interface AgentRow {
    id: string;
    name: string;
    description: string;
    system_prompt: string;
    append_prompt: string;
    model: string;
    allowed_tools: string;
    disallowed_tools: string;
    permission_mode: string;
    max_budget_usd: number | null;
    algochat_enabled: number;
    algochat_auto: number;
    custom_flags: string;
    default_project_id: string | null;
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
        allowedTools: row.allowed_tools,
        disallowedTools: row.disallowed_tools,
        permissionMode: row.permission_mode as Agent['permissionMode'],
        maxBudgetUsd: row.max_budget_usd,
        algochatEnabled: row.algochat_enabled === 1,
        algochatAuto: row.algochat_auto === 1,
        customFlags: JSON.parse(row.custom_flags),
        defaultProjectId: row.default_project_id ?? null,
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

    db.query(
        `INSERT INTO agents (id, name, description, system_prompt, append_prompt, model,
         allowed_tools, disallowed_tools, permission_mode, max_budget_usd,
         algochat_enabled, algochat_auto, custom_flags, default_project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        input.name,
        input.description ?? '',
        input.systemPrompt ?? '',
        input.appendPrompt ?? '',
        input.model ?? '',
        input.allowedTools ?? '',
        input.disallowedTools ?? '',
        input.permissionMode ?? 'default',
        input.maxBudgetUsd ?? null,
        input.algochatEnabled ? 1 : 0,
        input.algochatAuto ? 1 : 0,
        customFlags,
        input.defaultProjectId ?? null,
    );

    return getAgent(db, id) as Agent;
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

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...(values as SQLQueryBindings[]));
    return getAgent(db, id);
}

export function deleteAgent(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM agents WHERE id = ?').run(id);
    return result.changes > 0;
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
