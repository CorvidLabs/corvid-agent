import type { Database } from 'bun:sqlite';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../db/projects';
import { parseBodyOrThrow, ValidationError, CreateProjectSchema, UpdateProjectSchema } from '../lib/validation';
import { createLogger } from '../lib/logger';

const log = createLogger('BrowseDirs');

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function handleProjectRoutes(
    req: Request,
    url: URL,
    db: Database,
): Response | Promise<Response> | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/projects' && method === 'GET') {
        return json(listProjects(db));
    }

    if (path === '/api/projects' && method === 'POST') {
        return handleCreate(req, db);
    }

    const match = path.match(/^\/api\/projects\/([^/]+)$/);
    if (!match) return null;

    const id = match[1];

    if (method === 'GET') {
        const project = getProject(db, id);
        return project ? json(project) : json({ error: 'Not found' }, 404);
    }

    if (method === 'PUT') {
        return handleUpdate(req, db, id);
    }

    if (method === 'DELETE') {
        const deleted = deleteProject(db, id);
        return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
    }

    return null;
}

async function handleCreate(req: Request, db: Database): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, CreateProjectSchema);
        const project = createProject(db, data);
        return json(project, 201);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

async function handleUpdate(req: Request, db: Database, id: string): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, UpdateProjectSchema);
        const project = updateProject(db, id, data);
        return project ? json(project) : json({ error: 'Not found' }, 404);
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.message }, 400);
        throw err;
    }
}

/**
 * Build the allowlist of root directories that the browse-dirs endpoint may serve.
 *
 * Allowed roots (all normalized to absolute paths with trailing separator):
 *   1. The user's home directory — needed for initial project selection UX.
 *   2. Every registered project `working_dir` from the database.
 *   3. Any additional paths listed in the ALLOWED_BROWSE_ROOTS env var (comma-separated).
 */
export function getAllowedRoots(db: Database): string[] {
    const roots: string[] = [];

    // 1. User home directory
    roots.push(resolve(homedir()));

    // 2. Registered project working directories
    const projects = listProjects(db);
    for (const project of projects) {
        if (project.workingDir) {
            roots.push(resolve(project.workingDir));
        }
    }

    // 3. ALLOWED_BROWSE_ROOTS env var (comma-separated)
    const envRoots = process.env.ALLOWED_BROWSE_ROOTS?.trim();
    if (envRoots) {
        for (const root of envRoots.split(',')) {
            const trimmed = root.trim();
            if (trimmed.length > 0) {
                roots.push(resolve(trimmed));
            }
        }
    }

    return roots;
}

/**
 * Check whether a resolved directory path is allowed by the browse-dirs allowlist.
 *
 * A path is allowed if it is equal to, or a subdirectory of, any allowed root.
 * Uses path prefix comparison with separator boundary to prevent partial matches
 * (e.g. /home/user2 should NOT match allowed root /home/user).
 */
export function isPathAllowed(dirPath: string, allowedRoots: string[]): boolean {
    const normalized = resolve(dirPath);

    for (const root of allowedRoots) {
        const normalizedRoot = resolve(root);

        // Exact match
        if (normalized === normalizedRoot) return true;

        // Subdirectory: path starts with root + separator
        // Ensure boundary check so /home/user2 doesn't match /home/user
        const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
        if (normalized.startsWith(rootWithSep)) return true;
    }

    return false;
}

export async function handleBrowseDirs(_req: Request, url: URL, db: Database): Promise<Response> {
    const rawPath = url.searchParams.get('path') || homedir();
    const showHidden = url.searchParams.get('showHidden') === '1';
    const dirPath = resolve(rawPath);

    // --- Path allowlist check ---
    const allowedRoots = getAllowedRoots(db);
    if (!isPathAllowed(dirPath, allowedRoots)) {
        log.warn('Blocked browse-dirs request for path outside allowlist', { path: dirPath });
        return json({ error: 'Forbidden: path is outside allowed directories' }, 403);
    }

    try {
        const info = await stat(dirPath);
        if (!info.isDirectory()) {
            return json({ error: 'Path is not a directory' }, 400);
        }
    } catch {
        return json({ error: 'Path does not exist' }, 400);
    }

    try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        const dirs = entries
            .filter((e) => e.isDirectory() && (showHidden || !e.name.startsWith('.')))
            .map((e) => e.name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        const parent = dirname(dirPath);

        // Only return parent if it's also within the allowlist
        const safeParent = parent !== dirPath && isPathAllowed(parent, allowedRoots) ? parent : null;

        return json({
            current: dirPath,
            parent: safeParent,
            dirs,
        });
    } catch {
        return json({ error: 'Cannot read directory' }, 403);
    }
}
