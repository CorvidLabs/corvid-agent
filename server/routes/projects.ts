import type { Database } from 'bun:sqlite';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../db/projects';
import { parseBodyOrThrow, ValidationError, CreateProjectSchema, UpdateProjectSchema } from '../lib/validation';

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

export async function handleBrowseDirs(_req: Request, url: URL): Promise<Response> {
    const rawPath = url.searchParams.get('path') || homedir();
    const showHidden = url.searchParams.get('showHidden') === '1';
    const dirPath = resolve(rawPath);

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

        return json({
            current: dirPath,
            parent: parent !== dirPath ? parent : null,
            dirs,
        });
    } catch {
        return json({ error: 'Cannot read directory' }, 403);
    }
}
