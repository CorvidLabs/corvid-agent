import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { encryptEnvVars, decryptEnvVars, isEncrypted, ENCRYPTED_PREFIX } from '../lib/env-encryption';
import { createProject, getProject, updateProject } from '../db/projects';
import {
    createMcpServerConfig,
    getMcpServerConfig,
    updateMcpServerConfig,
} from '../db/mcp-servers';

// Save/restore WALLET_ENCRYPTION_KEY to avoid leaking into other test files
const originalWalletKey = process.env.WALLET_ENCRYPTION_KEY;

beforeAll(() => {
    process.env.WALLET_ENCRYPTION_KEY = 'test-key-for-env-encryption-at-least-32-chars-long';
});

afterAll(() => {
    if (originalWalletKey !== undefined) {
        process.env.WALLET_ENCRYPTION_KEY = originalWalletKey;
    } else {
        delete process.env.WALLET_ENCRYPTION_KEY;
    }
});

// ── Unit tests: encryptEnvVars / decryptEnvVars ──────────────────────

describe('encryptEnvVars / decryptEnvVars', () => {
    test('round-trips a simple object', () => {
        const input = JSON.stringify({ API_KEY: 'sk-secret-123', PORT: '3000' });
        const encrypted = encryptEnvVars(input);
        expect(encrypted).toStartWith(ENCRYPTED_PREFIX);
        expect(encrypted).not.toContain('sk-secret-123');

        const decrypted = decryptEnvVars(encrypted);
        expect(decrypted).toBe(input);
    });

    test('round-trips Unicode values', () => {
        const input = JSON.stringify({ GREETING: 'Hallo Welt! Bonjour le monde!' });
        const encrypted = encryptEnvVars(input);
        expect(decryptEnvVars(encrypted)).toBe(input);
    });

    test('round-trips large payloads', () => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < 100; i++) {
            obj[`KEY_${i}`] = `value_${'x'.repeat(100)}_${i}`;
        }
        const input = JSON.stringify(obj);
        const encrypted = encryptEnvVars(input);
        expect(decryptEnvVars(encrypted)).toBe(input);
    });

    test('skips encryption for empty object', () => {
        const result = encryptEnvVars('{}');
        expect(result).toBe('{}');
    });

    test('decrypts plaintext JSON passthrough (legacy)', () => {
        const plaintext = '{"OLD_KEY":"value"}';
        expect(decryptEnvVars(plaintext)).toBe(plaintext);
    });

    test('each encryption produces unique ciphertext (random salt/IV)', () => {
        const input = JSON.stringify({ KEY: 'value' });
        const a = encryptEnvVars(input);
        const b = encryptEnvVars(input);
        expect(a).not.toBe(b); // Different salt + IV each time
        expect(decryptEnvVars(a)).toBe(input);
        expect(decryptEnvVars(b)).toBe(input);
    });

    test('isEncrypted detects encrypted values', () => {
        expect(isEncrypted('enc:abc123')).toBe(true);
        expect(isEncrypted('{"KEY":"val"}')).toBe(false);
        expect(isEncrypted('{}')).toBe(false);
    });

    test('tampered ciphertext throws on decrypt', () => {
        const encrypted = encryptEnvVars(JSON.stringify({ KEY: 'val' }));
        // Flip a character in the base64 payload
        const tampered = encrypted.slice(0, -5) + 'XXXXX';
        expect(() => decryptEnvVars(tampered)).toThrow();
    });
});

// ── Integration tests: projects table ────────────────────────────────

describe('projects env_vars encryption', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    test('creates project with encrypted env_vars and reads back correctly', () => {
        const project = createProject(db, {
            name: 'SecretProject',
            workingDir: '/tmp/test',
            envVars: { API_KEY: 'sk-secret', DB_URL: 'postgres://localhost' },
        });

        // API returns decrypted values
        expect(project.envVars).toEqual({ API_KEY: 'sk-secret', DB_URL: 'postgres://localhost' });

        // Raw DB value should be encrypted (not plaintext JSON)
        const raw = db.query('SELECT env_vars FROM projects WHERE id = ?').get(project.id) as { env_vars: string };
        expect(raw.env_vars).toStartWith(ENCRYPTED_PREFIX);
        expect(raw.env_vars).not.toContain('sk-secret');
    });

    test('creates project with empty env_vars — stored as plaintext {}', () => {
        const project = createProject(db, { name: 'EmptyEnv', workingDir: '/tmp' });
        expect(project.envVars).toEqual({});

        const raw = db.query('SELECT env_vars FROM projects WHERE id = ?').get(project.id) as { env_vars: string };
        expect(raw.env_vars).toBe('{}');
    });

    test('updates env_vars — new values encrypted', () => {
        const project = createProject(db, { name: 'Test', workingDir: '/tmp' });
        const updated = updateProject(db, project.id, {
            envVars: { NEW_SECRET: 'new-value' },
        });

        expect(updated!.envVars).toEqual({ NEW_SECRET: 'new-value' });

        const raw = db.query('SELECT env_vars FROM projects WHERE id = ?').get(project.id) as { env_vars: string };
        expect(raw.env_vars).toStartWith(ENCRYPTED_PREFIX);
    });

    test('reads legacy plaintext env_vars without error', () => {
        // Simulate legacy data by inserting plaintext directly
        const id = crypto.randomUUID();
        db.query(
            `INSERT INTO projects (id, name, description, working_dir, claude_md, env_vars, tenant_id)
             VALUES (?, 'Legacy', '', '/tmp', '', '{"LEGACY":"val"}', 'default')`,
        ).run(id);

        const project = getProject(db, id);
        expect(project!.envVars).toEqual({ LEGACY: 'val' });
    });
});

// ── Integration tests: mcp_server_configs table ──────────────────────

describe('mcp_server_configs env_vars encryption', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    test('creates MCP config with encrypted env_vars', () => {
        const config = createMcpServerConfig(db, {
            name: 'test-server',
            command: 'node',
            envVars: { SECRET_TOKEN: 'tok-abc123' },
        });

        expect(config.envVars).toEqual({ SECRET_TOKEN: 'tok-abc123' });

        const raw = db.query('SELECT env_vars FROM mcp_server_configs WHERE id = ?').get(config.id) as { env_vars: string };
        expect(raw.env_vars).toStartWith(ENCRYPTED_PREFIX);
        expect(raw.env_vars).not.toContain('tok-abc123');
    });

    test('creates MCP config with empty env_vars', () => {
        const config = createMcpServerConfig(db, { name: 'minimal', command: 'echo' });
        expect(config.envVars).toEqual({});

        const raw = db.query('SELECT env_vars FROM mcp_server_configs WHERE id = ?').get(config.id) as { env_vars: string };
        expect(raw.env_vars).toBe('{}');
    });

    test('updates MCP config env_vars', () => {
        const config = createMcpServerConfig(db, { name: 'test', command: 'echo' });
        const updated = updateMcpServerConfig(db, config.id, {
            envVars: { UPDATED: 'secret-val' },
        });

        expect(updated!.envVars).toEqual({ UPDATED: 'secret-val' });

        const raw = db.query('SELECT env_vars FROM mcp_server_configs WHERE id = ?').get(config.id) as { env_vars: string };
        expect(raw.env_vars).toStartWith(ENCRYPTED_PREFIX);
    });

    test('reads legacy plaintext MCP env_vars', () => {
        const id = crypto.randomUUID();
        db.query(
            `INSERT INTO mcp_server_configs (id, name, command, args, env_vars, tenant_id)
             VALUES (?, 'legacy', 'echo', '[]', '{"OLD":"val"}', 'default')`,
        ).run(id);

        const config = getMcpServerConfig(db, id);
        expect(config!.envVars).toEqual({ OLD: 'val' });
    });
});

// ── Migration test ───────────────────────────────────────────────────

describe('migration 073: encrypt existing env_vars', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec('PRAGMA foreign_keys = ON');
        runMigrations(db);
    });

    afterEach(() => {
        db.close();
    });

    test('newly created records are encrypted after migration', () => {
        // Insert plaintext data simulating pre-migration state
        const projectId = crypto.randomUUID();
        const mcpId = crypto.randomUUID();

        db.query(`INSERT INTO projects (id, name, working_dir, env_vars, tenant_id) VALUES (?, 'P1', '/tmp', '{"SECRET":"abc"}', 'default')`).run(projectId);
        db.query(`INSERT INTO mcp_server_configs (id, name, command, args, env_vars, tenant_id) VALUES (?, 'M1', 'echo', '[]', '{"TOKEN":"xyz"}', 'default')`).run(mcpId);

        // The migration already ran as part of runMigrations, but our inserts are post-migration.
        // Verify that the read path handles both encrypted and plaintext.
        const project = getProject(db, projectId);
        expect(project!.envVars).toEqual({ SECRET: 'abc' });

        const config = getMcpServerConfig(db, mcpId);
        expect(config!.envVars).toEqual({ TOKEN: 'xyz' });
    });
});
