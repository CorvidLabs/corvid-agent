/**
 * A2A inbound task routes.
 *
 * POST /a2a/tasks/send — create and start a task
 * GET  /a2a/tasks/:id  — poll task status/result
 */

import type { Database } from 'bun:sqlite';
import { InboundA2ARateLimiter } from '../a2a/invocation-guard';
import { type A2ATaskDeps, DepthExceededError, handleTaskGet, handleTaskSend } from '../a2a/task-handler';
import { checkInjection } from '../lib/injection-guard';
import { createLogger } from '../lib/logger';
import { handleRouteError, json, notFound } from '../lib/response';
import { parseBodyOrThrow, SendA2ATaskSchema, ValidationError } from '../lib/validation';
import type { ProcessManager } from '../process/manager';

const log = createLogger('A2ARoutes');

// Singleton inbound rate limiter for A2A tasks
const inboundRateLimiter = new InboundA2ARateLimiter();

/** Exposed for testing — resets the inbound rate limiter. */
export function resetInboundRateLimiter(): void {
  inboundRateLimiter.reset();
}

export async function handleA2ARoutes(
  req: Request,
  url: URL,
  db: Database,
  processManager: ProcessManager,
): Promise<Response | null> {
  // POST /a2a/tasks/send
  if (url.pathname === '/a2a/tasks/send' && req.method === 'POST') {
    try {
      const data = await parseBodyOrThrow(req, SendA2ATaskSchema);
      const params = data.params ?? data;

      // Injection scan on inbound A2A message
      const blocked = checkInjection(db, params.message ?? '', 'a2a', req);
      if (blocked) return blocked;

      // Inbound rate limiting by source agent
      const sourceAgent = data.sourceAgent ?? req.headers.get('x-source-agent') ?? 'unknown';
      const rateCheck = inboundRateLimiter.check(sourceAgent);
      if (!rateCheck.allowed) {
        log.warn('Inbound A2A task rate-limited', {
          sourceAgent,
          retryAfterMs: rateCheck.retryAfterMs,
        });
        return json({ error: 'Rate limit exceeded. Try again later.' }, 429);
      }
      inboundRateLimiter.record(sourceAgent);

      const deps: A2ATaskDeps = { db, processManager };
      const task = handleTaskSend(deps, {
        message: params.message!,
        skill: params.skill,
        timeoutMs: params.timeoutMs,
        depth: params.depth ?? data.depth,
      });

      log.info('A2A inbound task accepted', {
        taskId: task.id,
        sourceAgent,
        depth: params.depth ?? data.depth ?? 1,
      });

      return json(task);
    } catch (err) {
      if (err instanceof ValidationError) return json({ error: err.detail }, 400);
      if (err instanceof DepthExceededError) {
        log.warn('A2A task rejected: depth exceeded', { error: err.message });
        return json({ error: 'Invocation depth limit exceeded.' }, 400);
      }
      log.error('A2A tasks/send failed', { error: err instanceof Error ? err.message : String(err) });
      return handleRouteError(err);
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
