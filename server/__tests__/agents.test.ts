import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    createAgent,
    getAgent,
    listAgents,
    updateAgent,
    deleteAgent,
    setAgentWallet,
    getAgentWalletMnemonic,
    addAgentFunding,
    getAlgochatEnabledAgents,
} from '../db/agents';

let db: Database;

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

function makeAgent(overrides: Record<string, unknown> = {}) {
    return createAgent(db, { name: 'TestAgent', model: 'test-model', ...overrides });
}

// ── createAgent ──────────────────────────────────────────────────────

describe('createAgent', () => {
    test('creates with defaults', () => {
        const agent = makeAgent();
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBe('TestAgent');
        expect(agent.model).toBe('test-model');
        expect(agent.description).toBe('');
        expect(agent.systemPrompt).toBe('');
        expect(agent.appendPrompt).toBe('');
        expect(agent.permissionMode).toBe('default');
        expect(agent.maxBudgetUsd).toBeNull();
        expect(agent.algochatEnabled).toBe(true);
        expect(agent.algochatAuto).toBe(true);
        expect(agent.customFlags).toEqual({});
        expect(agent.defaultProjectId).toBeNull();
        expect(agent.mcpToolPermissions).toBeNull();
        expect(agent.voiceEnabled).toBe(false);
        expect(agent.voicePreset).toBe('alloy');
        expect(agent.walletAddress).toBeNull();
        expect(agent.walletFundedAlgo).toBe(0);
    });

    test('creates with all custom fields', () => {
        const agent = makeAgent({
            description: 'A test agent',
            systemPrompt: 'You are helpful',
            appendPrompt: 'Be concise',
            provider: 'anthropic',
            allowedTools: 'Read,Write',
            disallowedTools: 'Bash',
            permissionMode: 'full-auto',
            maxBudgetUsd: 5.0,
            algochatEnabled: true,
            algochatAuto: true,
            customFlags: { fast: 'true' },
            mcpToolPermissions: ['tool1', 'tool2'],
            voiceEnabled: true,
            voicePreset: 'nova',
        });
        expect(agent.description).toBe('A test agent');
        expect(agent.systemPrompt).toBe('You are helpful');
        expect(agent.appendPrompt).toBe('Be concise');
        expect(agent.permissionMode).toBe('full-auto');
        expect(agent.maxBudgetUsd).toBe(5.0);
        expect(agent.algochatEnabled).toBe(true);
        expect(agent.algochatAuto).toBe(true);
        expect(agent.customFlags).toEqual({ fast: 'true' });
        expect(agent.mcpToolPermissions).toEqual(['tool1', 'tool2']);
        expect(agent.voiceEnabled).toBe(true);
        expect(agent.voicePreset).toBe('nova');
    });

    test('creates with display customization fields', () => {
        const agent = makeAgent({
            displayColor: '#FF5733',
            displayIcon: 'robot',
            avatarUrl: 'https://example.com/avatar.png',
        });
        expect(agent.displayColor).toBe('#FF5733');
        expect(agent.displayIcon).toBe('robot');
        expect(agent.avatarUrl).toBe('https://example.com/avatar.png');
        expect(agent.disabled).toBe(false);
    });

    test('display fields default to null when not provided', () => {
        const agent = makeAgent();
        expect(agent.displayColor).toBeNull();
        expect(agent.displayIcon).toBeNull();
        expect(agent.avatarUrl).toBeNull();
        expect(agent.disabled).toBe(false);
    });
});

// ── getAgent / listAgents ────────────────────────────────────────────

describe('getAgent and listAgents', () => {
    test('getAgent returns by id', () => {
        const agent = makeAgent();
        const fetched = getAgent(db, agent.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe(agent.id);
    });

    test('getAgent returns null for unknown id', () => {
        expect(getAgent(db, 'nonexistent')).toBeNull();
    });

    test('listAgents returns all agents', () => {
        makeAgent({ name: 'Agent1' });
        makeAgent({ name: 'Agent2' });
        const agents = listAgents(db);
        expect(agents).toHaveLength(2);
    });

    test('getAgent maps display fields from row (rowToAgent)', () => {
        const agent = makeAgent({
            displayColor: '#123456',
            displayIcon: 'bolt',
            avatarUrl: 'https://example.com/bolt.png',
        });
        const fetched = getAgent(db, agent.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.displayColor).toBe('#123456');
        expect(fetched!.displayIcon).toBe('bolt');
        expect(fetched!.avatarUrl).toBe('https://example.com/bolt.png');
        expect(fetched!.disabled).toBe(false);
    });

    test('listAgents returns agents ordered by updated_at', () => {
        makeAgent({ name: 'First' });
        makeAgent({ name: 'Second' });
        const agents = listAgents(db);
        expect(agents).toHaveLength(2);
        const names = agents.map(a => a.name);
        expect(names).toContain('First');
        expect(names).toContain('Second');
    });
});

// ── updateAgent ──────────────────────────────────────────────────────

describe('updateAgent', () => {
    test('updates name', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, { name: 'NewName' });
        expect(updated).not.toBeNull();
        expect(updated!.name).toBe('NewName');
    });

    test('updates multiple fields', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, {
            description: 'Updated desc',
            permissionMode: 'plan',
            maxBudgetUsd: 10,
            algochatEnabled: true,
            voiceEnabled: true,
            voicePreset: 'echo',
            customFlags: { debug: 'yes' },
            mcpToolPermissions: ['tool_x'],
        });
        expect(updated!.description).toBe('Updated desc');
        expect(updated!.permissionMode).toBe('plan');
        expect(updated!.maxBudgetUsd).toBe(10);
        expect(updated!.algochatEnabled).toBe(true);
        expect(updated!.voiceEnabled).toBe(true);
        expect(updated!.voicePreset).toBe('echo');
        expect(updated!.customFlags).toEqual({ debug: 'yes' });
        expect(updated!.mcpToolPermissions).toEqual(['tool_x']);
    });

    test('returns existing when no fields provided', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, {});
        expect(updated).not.toBeNull();
        expect(updated!.name).toBe(agent.name);
    });

    test('returns null for unknown id', () => {
        expect(updateAgent(db, 'nonexistent', { name: 'X' })).toBeNull();
    });

    test('updates displayColor', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, { displayColor: '#00FF00' });
        expect(updated).not.toBeNull();
        expect(updated!.displayColor).toBe('#00FF00');
    });

    test('updates displayIcon', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, { displayIcon: 'shield' });
        expect(updated).not.toBeNull();
        expect(updated!.displayIcon).toBe('shield');
    });

    test('updates avatarUrl', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, { avatarUrl: 'https://example.com/new-avatar.png' });
        expect(updated).not.toBeNull();
        expect(updated!.avatarUrl).toBe('https://example.com/new-avatar.png');
    });

    test('updates disabled flag', () => {
        const agent = makeAgent();
        expect(agent.disabled).toBe(false);
        const updated = updateAgent(db, agent.id, { disabled: true });
        expect(updated).not.toBeNull();
        expect(updated!.disabled).toBe(true);

        const reEnabled = updateAgent(db, agent.id, { disabled: false });
        expect(reEnabled!.disabled).toBe(false);
    });

    test('updates all display fields together', () => {
        const agent = makeAgent();
        const updated = updateAgent(db, agent.id, {
            displayColor: '#AABBCC',
            displayIcon: 'star',
            avatarUrl: 'https://example.com/star.png',
            disabled: true,
        });
        expect(updated).not.toBeNull();
        expect(updated!.displayColor).toBe('#AABBCC');
        expect(updated!.displayIcon).toBe('star');
        expect(updated!.avatarUrl).toBe('https://example.com/star.png');
        expect(updated!.disabled).toBe(true);
    });

    test('clears display fields by setting to null', () => {
        const agent = makeAgent({
            displayColor: '#FF0000',
            displayIcon: 'fire',
            avatarUrl: 'https://example.com/fire.png',
        });
        expect(agent.displayColor).toBe('#FF0000');

        const updated = updateAgent(db, agent.id, {
            displayColor: null as unknown as string,
            displayIcon: null as unknown as string,
            avatarUrl: null as unknown as string,
        });
        expect(updated).not.toBeNull();
        expect(updated!.displayColor).toBeNull();
        expect(updated!.displayIcon).toBeNull();
        expect(updated!.avatarUrl).toBeNull();
    });
});

// ── deleteAgent ──────────────────────────────────────────────────────

describe('deleteAgent', () => {
    test('deletes an agent', () => {
        const agent = makeAgent();
        expect(deleteAgent(db, agent.id)).toBe(true);
        expect(getAgent(db, agent.id)).toBeNull();
    });

    test('returns false for unknown id', () => {
        expect(deleteAgent(db, 'nonexistent')).toBe(false);
    });
});

// ── Wallet operations ────────────────────────────────────────────────

describe('wallet operations', () => {
    test('setAgentWallet and getAgentWalletMnemonic', () => {
        const agent = makeAgent();
        setAgentWallet(db, agent.id, 'ALGO_ADDR_123', 'encrypted-mnemonic');

        const mnemonic = getAgentWalletMnemonic(db, agent.id);
        expect(mnemonic).toBe('encrypted-mnemonic');

        const updated = getAgent(db, agent.id)!;
        expect(updated.walletAddress).toBe('ALGO_ADDR_123');
    });

    test('getAgentWalletMnemonic returns null when no wallet', () => {
        const agent = makeAgent();
        expect(getAgentWalletMnemonic(db, agent.id)).toBeNull();
    });

    test('addAgentFunding increments wallet_funded_algo', () => {
        const agent = makeAgent();
        addAgentFunding(db, agent.id, 1000);
        addAgentFunding(db, agent.id, 500);
        const updated = getAgent(db, agent.id)!;
        expect(updated.walletFundedAlgo).toBe(1500);
    });
});

// ── getAlgochatEnabledAgents ─────────────────────────────────────────

describe('getAlgochatEnabledAgents', () => {
    test('returns only algochat-enabled agents', () => {
        makeAgent({ name: 'Enabled', algochatEnabled: true });
        makeAgent({ name: 'Disabled', algochatEnabled: false });
        const enabled = getAlgochatEnabledAgents(db);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('Enabled');
    });

    test('returns empty when none enabled', () => {
        makeAgent({ algochatEnabled: false });
        expect(getAlgochatEnabledAgents(db)).toHaveLength(0);
    });
});
