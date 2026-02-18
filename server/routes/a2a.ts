/**
 * A2A inbound task routes.
 *
 * POST /a2a/tasks/send — create and start a task
 * GET  /a2a/tasks/:id  — poll task status/result
 */

import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import { handleTaskSend, handleTaskGet, type A2ATaskDeps } from '../a2a/task-handler';
import { json, badRequest, notFound } from '../lib/response';
import { createLogger } from '../lib/logger';

const log = createLogger('A2ARoutes');

export async function handleA2ARoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
): Promise<Response | null> {
    // POST /a2a/tasks/send
    if (url.pathname === '/a2a/tasks/send' && req.method === 'POST') {
        try {
            const body = await req.json() as { params?: { message?: string; skill?: string; timeoutMs?: number } };
            const params = body.params ?? body as { message?: string; skill?: string; timeoutMs?: number };

            if (!params.message?.trim()) {
                return badRequest('message is required');
            }

            const deps: A2ATaskDeps = { db, processManager };
            const task = handleTaskSend(deps, {
                message: params.message,
                skill: params.skill,
                timeoutMs: params.timeoutMs,
            });

            return json(task);
        } catch (err) {
            log.error('A2A tasks/send failed', { error: err instanceof Error ? err.message : String(err) });
            return badRequest('Failed to send A2A task');
        }
    }

    // GET /a2a/tasks/:id
    const taskMatch = url.pathname.match(/^\/a2a\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
        const taskId = taskMatch[1];
        const task = handleTaskGet(taskId);
        if (!task) {
            return notFound('Task not found');
        }
        return json(task);
    }

    return null;
}
