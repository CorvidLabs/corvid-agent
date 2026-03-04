import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import {
    listMcpServerConfigs,
    getMcpServerConfig,
    getActiveServersForAgent,
    createMcpServerConfig,
    updateMcpServerConfig,
    deleteMcpServerConfig,
} from '../db/mcp-servers';

let db: Database;

// Helper to create a test agent for FK constraints
function createTestAgent(id: string = 'agent-1'): void {
    db.query(
        `INSERT INTO agents (id, name, model, system_prompt, tenant_id)
         VALUES (?, ?, ?, ?, 'default')`,
    ).run(id, 'Test Agent', 'test-model', 'Test prompt');
}

beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
});

afterEach(() => {
    db.close();
});

// ── CRUD ─────────────────────────────────────────────────────────────

describe('MCP Server Config CRUD', () => {
    test('listMcpServerConfigs returns empty on fresh db', () => {
        expect(listMcpServerConfigs(db)).toEqual([]);
    });

    test('createMcpServerConfig creates a global server config', () => {
        const config = createMcpServerConfig(db, {
            name: 'test-server',
            command: 'node',
            args: ['server.js'],
            envVars: { PORT: '3000' },
        });

        expect(config.id).toBeTruthy();
        expect(config.name).toBe('test-server');
        expect(config.command).toBe('node');
        expect(config.args).toEqual(['server.js']);
        expect(config.envVars).toEqual({ PORT: '3000' });
        expect(config.agentId).toBeNull();
        expect(config.enabled).toBe(true);
        expect(config.cwd).toBeNull();
    });

    test('createMcpServerConfig creates agent-specific config', () => {
        createTestAgent();
        const config = createMcpServerConfig(db, {
            name: 'agent-server',
            command: 'python',
            agentId: 'agent-1',
        });

        expect(config.agentId).toBe('agent-1');
    });

    test('createMcpServerConfig defaults args and envVars to empty', () => {
        const config = createMcpServerConfig(db, {
            name: 'minimal',
            command: 'echo',
        });

        expect(config.args).toEqual([]);
        expect(config.envVars).toEqual({});
    });

    test('createMcpServerConfig respects enabled=false', () => {
        const config = createMcpServerConfig(db, {
            name: 'disabled-server',
            command: 'echo',
            enabled: false,
        });

        expect(config.enabled).toBe(false);
    });

    test('getMcpServerConfig returns config by id', () => {
        const created = createMcpServerConfig(db, {
            name: 'test',
            command: 'node',
        });

        const fetched = getMcpServerConfig(db, created.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.name).toBe('test');
    });

    test('getMcpServerConfig returns null for missing id', () => {
        expect(getMcpServerConfig(db, 'nonexistent')).toBeNull();
    });

    test('listMcpServerConfigs returns all configs ordered by name', () => {
        createMcpServerConfig(db, { name: 'zeta', command: 'z' });
        createMcpServerConfig(db, { name: 'alpha', command: 'a' });
        createMcpServerConfig(db, { name: 'mid', command: 'm' });

        const list = listMcpServerConfigs(db);
        expect(list).toHaveLength(3);
        expect(list[0].name).toBe('alpha');
        expect(list[1].name).toBe('mid');
        expect(list[2].name).toBe('zeta');
    });

    test('listMcpServerConfigs filters by agentId', () => {
        createTestAgent();
        createTestAgent('agent-2');

        createMcpServerConfig(db, { name: 'global', command: 'g' });
        createMcpServerConfig(db, { name: 'a1-server', command: 'a', agentId: 'agent-1' });
        createMcpServerConfig(db, { name: 'a2-server', command: 'b', agentId: 'agent-2' });

        const a1Configs = listMcpServerConfigs(db, 'agent-1');
        expect(a1Configs).toHaveLength(1);
        expect(a1Configs[0].name).toBe('a1-server');
    });
});

// ── Update ───────────────────────────────────────────────────────────

describe('updateMcpServerConfig', () => {
    test('updates name', () => {
        const config = createMcpServerConfig(db, { name: 'old', command: 'echo' });
        const updated = updateMcpServerConfig(db, config.id, { name: 'new' });
        expect(updated!.name).toBe('new');
    });

    test('updates command and args', () => {
        const config = createMcpServerConfig(db, { name: 'test', command: 'node' });
        const updated = updateMcpServerConfig(db, config.id, {
            command: 'python',
            args: ['-m', 'server'],
        });
        expect(updated!.command).toBe('python');
        expect(updated!.args).toEqual(['-m', 'server']);
    });

    test('updates enabled flag', () => {
        const config = createMcpServerConfig(db, { name: 'test', command: 'echo' });
        const updated = updateMcpServerConfig(db, config.id, { enabled: false });
        expect(updated!.enabled).toBe(false);
    });

    test('updates envVars', () => {
        const config = createMcpServerConfig(db, { name: 'test', command: 'echo' });
        const updated = updateMcpServerConfig(db, config.id, { envVars: { KEY: 'value' } });
        expect(updated!.envVars).toEqual({ KEY: 'value' });
    });

    test('returns null for missing id', () => {
        expect(updateMcpServerConfig(db, 'nonexistent', { name: 'x' })).toBeNull();
    });

    test('returns existing config when no fields to update', () => {
        const config = createMcpServerConfig(db, { name: 'test', command: 'echo' });
        const result = updateMcpServerConfig(db, config.id, {});
        expect(result!.name).toBe('test');
    });
});

// ── Delete ───────────────────────────────────────────────────────────

describe('deleteMcpServerConfig', () => {
    test('deletes existing config', () => {
        const config = createMcpServerConfig(db, { name: 'test', command: 'echo' });
        expect(deleteMcpServerConfig(db, config.id)).toBe(true);
        expect(getMcpServerConfig(db, config.id)).toBeNull();
    });

    test('returns false for missing id', () => {
        expect(deleteMcpServerConfig(db, 'nonexistent')).toBe(false);
    });
});

// ── getActiveServersForAgent ─────────────────────────────────────────

describe('getActiveServersForAgent', () => {
    test('returns global and agent-specific enabled configs', () => {
        createTestAgent();

        createMcpServerConfig(db, { name: 'global', command: 'g' });
        createMcpServerConfig(db, { name: 'agent-specific', command: 'a', agentId: 'agent-1' });
        createMcpServerConfig(db, { name: 'disabled', command: 'd', enabled: false });

        const active = getActiveServersForAgent(db, 'agent-1');
        expect(active).toHaveLength(2);
        expect(active.map(c => c.name).sort()).toEqual(['agent-specific', 'global']);
    });

    test('excludes configs for other agents', () => {
        createTestAgent();
        createTestAgent('agent-2');

        createMcpServerConfig(db, { name: 'a1-server', command: 'a', agentId: 'agent-1' });
        createMcpServerConfig(db, { name: 'a2-server', command: 'b', agentId: 'agent-2' });

        const active = getActiveServersForAgent(db, 'agent-1');
        expect(active).toHaveLength(1);
        expect(active[0].name).toBe('a1-server');
    });

    test('returns empty when no matching configs', () => {
        createTestAgent();
        expect(getActiveServersForAgent(db, 'agent-1')).toEqual([]);
    });
});
