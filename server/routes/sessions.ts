import type { Database } from 'bun:sqlite';
import {
    listSessions,
    getSession,
    createSession,
    updateSession,
    deleteSession,
    getSessionMessages,
} from '../db/sessions';
import type { ProcessManager } from '../process/manager';
import { createLogger } from '../lib/logger';

const log = createLogger('SessionRoutes');

function json(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export function handleSessionRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
): Response | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/sessions' && method === 'GET') {
        const projectId = url.searchParams.get('projectId') ?? undefined;
        return json(listSessions(db, projectId));
    }

    if (path === '/api/sessions' && method === 'POST') {
        return handleCreate(req, db, processManager);
    }

    const match = path.match(/^\/api\/sessions\/([^/]+)(\/(.+))?$/);
    if (!match) return null;

    const id = match[1];
    const action = match[3];

    if (!action) {
        if (method === 'GET') {
            const session = getSession(db, id);
            return session ? json(session) : json({ error: 'Not found' }, 404);
        }
        if (method === 'PUT') {
            return handleUpdate(req, db, id);
        }
        if (method === 'DELETE') {
            processManager.stopProcess(id);
            const deleted = deleteSession(db, id);
            return deleted ? json({ ok: true }) : json({ error: 'Not found' }, 404);
        }
    }

    if (action === 'messages' && method === 'GET') {
        return json(getSessionMessages(db, id));
    }

    if (action === 'stop' && method === 'POST') {
        return handleStop(db, processManager, id);
    }

    if (action === 'resume' && method === 'POST') {
        return handleResume(req, db, processManager, id);
    }

    return null;
}

async function handleCreate(
    req: Request,
    db: Database,
    processManager: ProcessManager,
): Promise<Response> {
    const body = await req.json();
    if (!body.projectId) {
        return json({ error: 'projectId is required' }, 400);
    }
    const session = createSession(db, body);

    if (body.initialPrompt) {
        try {
            processManager.startProcess(session);
        } catch (err) {
            log.error('Failed to start process', { sessionId: session.id, error: err instanceof Error ? err.message : String(err) });
            // Session is still created, just not started
        }
    }

    return json(session, 201);
}

async function handleUpdate(req: Request, db: Database, id: string): Promise<Response> {
    const body = await req.json();
    const session = updateSession(db, id, body);
    return session ? json(session) : json({ error: 'Not found' }, 404);
}

function handleStop(
    db: Database,
    processManager: ProcessManager,
    id: string,
): Response {
    const session = getSession(db, id);
    if (!session) return json({ error: 'Not found' }, 404);

    processManager.stopProcess(id);
    return json({ ok: true });
}

async function handleResume(
    req: Request,
    db: Database,
    processManager: ProcessManager,
    id: string,
): Promise<Response> {
    const session = getSession(db, id);
    if (!session) return json({ error: 'Not found' }, 404);

    const body = await req.json().catch(() => ({}));
    processManager.resumeProcess(session, body.prompt);
    return json({ ok: true });
}
