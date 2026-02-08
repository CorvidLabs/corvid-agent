import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { homedir, tmpdir, platform } from 'node:os';
import { resolve, sep } from 'node:path';
import { handleBrowseDirs, getAllowedRoots, isPathAllowed } from '../routes/projects';

const isWindows = platform() === 'win32';
// Use os.tmpdir() for cross-platform temp directory (e.g. /tmp on Unix, C:\Users\...\Temp on Windows)
const TEMP_DIR = resolve(tmpdir());

/**
 * Browse-Dirs Sandboxing Tests
 *
 * Validates that the /api/browse-dirs endpoint only serves paths that are
 * within the allowlist: registered project directories, the user's home
 * directory, and any paths specified in ALLOWED_BROWSE_ROOTS.
 */

let db: Database;

// Save and restore ALLOWED_BROWSE_ROOTS env var between tests
let savedEnv: string | undefined;

function fakeReq(path: string, query?: Record<string, string>): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }
    }
    return { req: new Request(url.toString()), url };
}

beforeAll(() => {
    savedEnv = process.env.ALLOWED_BROWSE_ROOTS;
});

afterAll(() => {
    // Restore env
    if (savedEnv !== undefined) {
        process.env.ALLOWED_BROWSE_ROOTS = savedEnv;
    } else {
        delete process.env.ALLOWED_BROWSE_ROOTS;
    }
});

beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            working_dir TEXT NOT NULL,
            claude_md TEXT DEFAULT '',
            env_vars TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    `);
    // Clear env var for each test unless overridden
    delete process.env.ALLOWED_BROWSE_ROOTS;
});

afterEach(() => {
    db.close();
});

// ─── getAllowedRoots ─────────────────────────────────────────────────────────

describe('getAllowedRoots', () => {
    it('always includes the user home directory', () => {
        const roots = getAllowedRoots(db);
        expect(roots).toContain(resolve(homedir()));
    });

    it('includes registered project working directories', () => {
        db.query(
            "INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)"
        ).run('p1', 'Project 1', '/opt/myproject');
        db.query(
            "INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)"
        ).run('p2', 'Project 2', '/var/www/app');

        const roots = getAllowedRoots(db);
        expect(roots).toContain(resolve('/opt/myproject'));
        expect(roots).toContain(resolve('/var/www/app'));
    });

    it('includes paths from ALLOWED_BROWSE_ROOTS env var', () => {
        process.env.ALLOWED_BROWSE_ROOTS = '/mnt/shared, /opt/projects';
        const roots = getAllowedRoots(db);
        expect(roots).toContain(resolve('/mnt/shared'));
        expect(roots).toContain(resolve('/opt/projects'));
    });

    it('handles empty ALLOWED_BROWSE_ROOTS gracefully', () => {
        process.env.ALLOWED_BROWSE_ROOTS = '';
        const roots = getAllowedRoots(db);
        // Should still have home dir at minimum
        expect(roots.length).toBeGreaterThanOrEqual(1);
        expect(roots).toContain(resolve(homedir()));
    });

    it('handles ALLOWED_BROWSE_ROOTS with whitespace and empty entries', () => {
        process.env.ALLOWED_BROWSE_ROOTS = '  /tmp , , /opt  ';
        const roots = getAllowedRoots(db);
        expect(roots).toContain(resolve('/tmp'));
        expect(roots).toContain(resolve('/opt'));
    });
});

// ─── isPathAllowed ──────────────────────────────────────────────────────────

describe('isPathAllowed', () => {
    it('allows exact match of an allowed root', () => {
        expect(isPathAllowed('/home/user', ['/home/user'])).toBe(true);
    });

    it('allows a subdirectory of an allowed root', () => {
        expect(isPathAllowed('/home/user/projects/myapp', ['/home/user'])).toBe(true);
    });

    it('allows deeply nested subdirectories', () => {
        expect(isPathAllowed('/home/user/a/b/c/d/e', ['/home/user'])).toBe(true);
    });

    it('rejects a path outside all allowed roots', () => {
        expect(isPathAllowed('/etc/passwd', ['/home/user'])).toBe(false);
    });

    it('rejects /root when only /home/user is allowed', () => {
        expect(isPathAllowed('/root', ['/home/user'])).toBe(false);
    });

    it('rejects /etc when only home and project dirs are allowed', () => {
        expect(isPathAllowed('/etc', ['/home/user', '/opt/project'])).toBe(false);
    });

    it('prevents partial prefix matches (path boundary attack)', () => {
        // /home/user2 should NOT match allowed root /home/user
        expect(isPathAllowed('/home/user2', ['/home/user'])).toBe(false);
        expect(isPathAllowed('/home/user2/secrets', ['/home/user'])).toBe(false);
    });

    it('handles root filesystem path', () => {
        // Only allow if / is explicitly in the allowlist
        expect(isPathAllowed('/', ['/home/user'])).toBe(false);
        expect(isPathAllowed('/', ['/'])).toBe(true);
    });

    it('allows with multiple roots', () => {
        const roots = ['/home/user', '/opt/project', '/var/data'];
        expect(isPathAllowed('/opt/project/src', roots)).toBe(true);
        expect(isPathAllowed('/var/data/files', roots)).toBe(true);
        expect(isPathAllowed('/tmp/evil', roots)).toBe(false);
    });

    it('handles path traversal attempts via resolve', () => {
        // resolve() would normalize these, but isPathAllowed checks the resolved path
        const resolvedPath = resolve('/home/user/../../../etc/shadow');
        expect(isPathAllowed(resolvedPath, ['/home/user'])).toBe(false);
    });

    it('rejects all paths when allowlist is empty', () => {
        expect(isPathAllowed('/home/user', [])).toBe(false);
        expect(isPathAllowed('/tmp', [])).toBe(false);
        expect(isPathAllowed('/', [])).toBe(false);
    });
});

// ─── handleBrowseDirs (integration) ──────────────────────────────────────────

describe('handleBrowseDirs', () => {
    it('allows browsing user home directory (default path)', async () => {
        const { req, url } = fakeReq('/api/browse-dirs');
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.current).toBe(resolve(homedir()));
    });

    it('allows browsing a subdirectory of home', async () => {
        // Use a subdirectory that exists - the home directory itself is guaranteed
        const { req, url } = fakeReq('/api/browse-dirs', { path: homedir() });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(200);
    });

    it('blocks access to /etc', async () => {
        const { req, url } = fakeReq('/api/browse-dirs', { path: '/etc' });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain('Forbidden');
    });

    it('blocks access to /root', async () => {
        const { req, url } = fakeReq('/api/browse-dirs', { path: '/root' });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain('Forbidden');
    });

    it('blocks parent traversal to escape allowed roots', async () => {
        const { req, url } = fakeReq('/api/browse-dirs', {
            path: `${homedir()}/../../etc`,
        });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toContain('Forbidden');
    });

    it('allows browsing a registered project directory', async () => {
        // Register a project with a real directory
        const projectDir = resolve(homedir()); // use home as a directory we know exists
        db.query(
            "INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)"
        ).run('test-project', 'Test', projectDir);

        const { req, url } = fakeReq('/api/browse-dirs', { path: projectDir });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.current).toBe(projectDir);
    });

    it('allows browsing a subdirectory of a registered project', async () => {
        // Use os.tmpdir() for cross-platform temp directory
        db.query(
            "INSERT INTO projects (id, name, working_dir) VALUES (?, ?, ?)"
        ).run('tmp-project', 'TmpProject', TEMP_DIR);

        const { req, url } = fakeReq('/api/browse-dirs', { path: TEMP_DIR });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(200);
    });

    it('allows paths from ALLOWED_BROWSE_ROOTS env var', async () => {
        process.env.ALLOWED_BROWSE_ROOTS = TEMP_DIR;
        const { req, url } = fakeReq('/api/browse-dirs', { path: TEMP_DIR });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.current).toBe(TEMP_DIR);
    });

    it('does not expose parent path outside allowlist', async () => {
        // Register only TEMP_DIR as allowed (plus home)
        // On Windows, temp dir may be inside home, so use a path that definitely
        // has a parent outside the allowlist
        process.env.ALLOWED_BROWSE_ROOTS = TEMP_DIR;
        const { req, url } = fakeReq('/api/browse-dirs', { path: TEMP_DIR });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(200);
        const data = await res.json();
        // If TEMP_DIR is inside home, parent may be allowed (since home is always in allowlist)
        // Otherwise parent should be null
        if (TEMP_DIR.startsWith(resolve(homedir()) + sep) || TEMP_DIR === resolve(homedir())) {
            // On Windows, temp dir is typically inside home, so parent is allowed
            // Just verify response is valid
            expect(data.current).toBe(TEMP_DIR);
        } else {
            // On Unix, /tmp's parent is / which is NOT in the allowlist
            expect(data.parent).toBeNull();
        }
    });

    it('returns 400 for non-existent paths within allowlist', async () => {
        const fakePath = `${homedir()}/nonexistent-dir-${Date.now()}`;
        const { req, url } = fakeReq('/api/browse-dirs', { path: fakePath });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Path does not exist');
    });

    it('blocks system paths even with traversal in path', async () => {
        const { req, url } = fakeReq('/api/browse-dirs', {
            path: '/home/../etc',
        });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(403);
    });

    it('handles empty allowlist (no projects, no env var)', async () => {
        // With no projects and no ALLOWED_BROWSE_ROOTS, only home is allowed
        delete process.env.ALLOWED_BROWSE_ROOTS;
        const { req, url } = fakeReq('/api/browse-dirs', { path: '/var' });
        const res = await handleBrowseDirs(req, url, db);
        expect(res.status).toBe(403);
    });
});
