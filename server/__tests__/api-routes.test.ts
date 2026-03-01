import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { handleProjectRoutes } from '../routes/projects';
import { handleAgentRoutes } from '../routes/agents';
import { handleAllowlistRoutes } from '../routes/allowlist';
import { createRequestContext } from '../middleware/guards';
import { CreditGrantSchema } from '../lib/validation';

/**
 * API Route Integration Tests
 *
 * Tests that route handlers correctly reject malformed input with 400 errors
 * and handle CRUD operations properly.
 */

let db: Database;
const defaultContext = createRequestContext();

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

async function getJson(res: Response | Promise<Response>): Promise<Record<string, unknown>> {
    const resolved = await res;
    return resolved.json();
}

beforeAll(() => {
    db = new Database(':memory:');
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            working_dir TEXT NOT NULL,
            allowed_tools TEXT DEFAULT '[]',
            custom_instructions TEXT DEFAULT '',
            mcp_servers TEXT DEFAULT '[]',
            claude_md TEXT DEFAULT '',
            env_vars TEXT DEFAULT '{}',
            tenant_id TEXT NOT NULL DEFAULT 'default',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            system_prompt TEXT DEFAULT '',
            append_prompt TEXT DEFAULT '',
            model TEXT DEFAULT '',
            provider TEXT DEFAULT '',
            allowed_tools TEXT DEFAULT '',
            disallowed_tools TEXT DEFAULT '',
            permission_mode TEXT DEFAULT 'default',
            max_budget_usd REAL DEFAULT NULL,
            algochat_enabled INTEGER DEFAULT 0,
            algochat_auto INTEGER DEFAULT 0,
            custom_flags TEXT DEFAULT '{}',
            default_project_id TEXT DEFAULT NULL,
            wallet_address TEXT DEFAULT NULL,
            wallet_mnemonic_encrypted TEXT DEFAULT NULL,
            wallet_funded_algo REAL DEFAULT 0,
            mcp_tool_permissions TEXT DEFAULT NULL,
            voice_enabled INTEGER DEFAULT 0,
            voice_preset TEXT DEFAULT 'alloy',
            tenant_id TEXT NOT NULL DEFAULT 'default',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS algochat_allowlist (
            address TEXT PRIMARY KEY,
            label TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);
});

afterAll(() => {
    db.close();
});

// ─── Project Routes ───────────────────────────────────────────────────────────

describe('Project Routes', () => {
    it('GET /api/projects returns empty list initially', async () => {
        const { req, url } = fakeReq('GET', '/api/projects');
        const res = handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await getJson(res!);
        expect(Array.isArray(data)).toBe(true);
    });

    it('POST /api/projects rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', {});
        const res = handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        const resolved = await res!;
        expect(resolved.status).toBe(400);
        const data = await resolved.json();
        expect(data.error).toContain('Validation failed');
    });

    it('POST /api/projects rejects missing workingDir', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', { name: 'Test' });
        const res = handleProjectRoutes(req, url, db);
        const resolved = await res!;
        expect(resolved.status).toBe(400);
    });

    it('POST /api/projects rejects non-JSON body', async () => {
        const url = new URL('http://localhost:3000/api/projects');
        const req = new Request(url.toString(), {
            method: 'POST',
            body: 'not json',
            headers: { 'Content-Type': 'text/plain' },
        });
        const res = handleProjectRoutes(req, url, db);
        const resolved = await res!;
        expect(resolved.status).toBe(400);
        const data = await resolved.json();
        expect(data.error).toContain('Invalid JSON');
    });

    it('POST /api/projects creates project with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/projects', {
            name: 'Test Project',
            workingDir: '/tmp/test',
        });
        const res = handleProjectRoutes(req, url, db);
        const resolved = await res!;
        expect(resolved.status).toBe(201);
        const data = await resolved.json();
        expect(data.name).toBe('Test Project');
        expect(data.id).toBeDefined();
    });

    it('GET /api/projects/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/projects/nonexistent');
        const res = handleProjectRoutes(req, url, db);
        expect(res).not.toBeNull();
        const resolved = await res!;
        expect(resolved.status).toBe(404);
    });

    it('returns null for unmatched paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleProjectRoutes(req, url, db);
        expect(res).toBeNull();
    });
});

// ─── Agent Routes ─────────────────────────────────────────────────────────────

describe('Agent Routes', () => {
    it('GET /api/agents returns empty list', async () => {
        const { req, url } = fakeReq('GET', '/api/agents');
        const res = handleAgentRoutes(req, url, db, defaultContext);
        expect(res).not.toBeNull();
        const data = await getJson(res!);
        expect(Array.isArray(data)).toBe(true);
    });

    it('POST /api/agents rejects empty body', async () => {
        const { req, url } = fakeReq('POST', '/api/agents', {});
        const res = handleAgentRoutes(req, url, db, defaultContext);
        const resolved = await res!;
        expect(resolved.status).toBe(400);
    });

    it('POST /api/agents rejects invalid permissionMode', async () => {
        const { req, url } = fakeReq('POST', '/api/agents', {
            name: 'BadAgent',
            permissionMode: 'super-auto',
        });
        const res = handleAgentRoutes(req, url, db, defaultContext);
        const resolved = await res!;
        expect(resolved.status).toBe(400);
    });

    it('POST /api/agents creates agent with valid input', async () => {
        const { req, url } = fakeReq('POST', '/api/agents', {
            name: 'TestAgent',
            description: 'A test agent',
        });
        const res = handleAgentRoutes(req, url, db, defaultContext);
        const resolved = await res!;
        expect(resolved.status).toBe(201);
        const data = await resolved.json();
        expect(data.name).toBe('TestAgent');
    });

    it('GET /api/agents/:id returns 404 for unknown', async () => {
        const { req, url } = fakeReq('GET', '/api/agents/nonexistent');
        const res = handleAgentRoutes(req, url, db, defaultContext);
        const resolved = await res!;
        expect(resolved.status).toBe(404);
    });
});

// ─── Allowlist Routes ─────────────────────────────────────────────────────────

describe('Allowlist Routes', () => {
    it('GET /api/allowlist returns empty list', async () => {
        const { req, url } = fakeReq('GET', '/api/allowlist');
        const res = handleAllowlistRoutes(req, url, db);
        expect(res).not.toBeNull();
        const data = await getJson(res!);
        expect(Array.isArray(data)).toBe(true);
    });

    it('POST /api/allowlist rejects empty address', async () => {
        const { req, url } = fakeReq('POST', '/api/allowlist', { address: '' });
        const res = handleAllowlistRoutes(req, url, db);
        const resolved = await res!;
        expect(resolved.status).toBe(400);
    });

    it('POST /api/allowlist rejects invalid Algorand address', async () => {
        const { req, url } = fakeReq('POST', '/api/allowlist', {
            address: 'NOT_A_VALID_ALGO_ADDRESS',
            label: 'Test Wallet',
        });
        const res = handleAllowlistRoutes(req, url, db);
        const resolved = await res!;
        expect(resolved.status).toBe(400);
        const data = await resolved.json();
        expect(data.error).toContain('Invalid Algorand address');
    });
});

// ─── Credit Grant Schema Validation ──────────────────────────────────────────

describe('CreditGrantSchema', () => {
    it('rejects non-numeric amount', () => {
        const result = CreditGrantSchema.safeParse({ amount: 'abc' });
        expect(result.success).toBe(false);
    });

    it('rejects missing amount', () => {
        const result = CreditGrantSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('rejects negative amount', () => {
        const result = CreditGrantSchema.safeParse({ amount: -10 });
        expect(result.success).toBe(false);
    });

    it('rejects zero amount', () => {
        const result = CreditGrantSchema.safeParse({ amount: 0 });
        expect(result.success).toBe(false);
    });

    it('rejects Infinity', () => {
        const result = CreditGrantSchema.safeParse({ amount: Infinity });
        expect(result.success).toBe(false);
    });

    it('accepts valid positive amount', () => {
        const result = CreditGrantSchema.safeParse({ amount: 100 });
        expect(result.success).toBe(true);
        expect(result.data!.amount).toBe(100);
    });

    it('accepts valid amount with reference', () => {
        const result = CreditGrantSchema.safeParse({ amount: 50, reference: 'bonus' });
        expect(result.success).toBe(true);
        expect(result.data!.reference).toBe('bonus');
    });
});
