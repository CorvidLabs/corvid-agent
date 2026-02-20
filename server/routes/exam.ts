import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../process/manager';
import { ExamRunner } from '../exam/runner';
import { parseBodyOrThrow, ValidationError } from '../lib/validation';
import { json, handleRouteError } from '../lib/response';
import { z } from 'zod';
import type { ExamCategory } from '../exam/types';
import { EXAM_CATEGORIES } from '../exam/types';

const RunExamSchema = z.object({
    model: z.string().min(1),
    categories: z.array(z.enum(['coding', 'context', 'tools', 'algochat', 'council', 'instruction'])).optional(),
});

export function handleExamRoutes(
    req: Request,
    url: URL,
    db: Database,
    processManager: ProcessManager,
): Response | Promise<Response> | null {
    // POST /api/exam/run — trigger a live exam
    if (url.pathname === '/api/exam/run' && req.method === 'POST') {
        return handleRunExam(req, db, processManager);
    }

    // GET /api/exam/categories — list available exam categories
    if (url.pathname === '/api/exam/categories' && req.method === 'GET') {
        return json({ categories: EXAM_CATEGORIES });
    }

    return null;
}

async function handleRunExam(
    req: Request,
    db: Database,
    processManager: ProcessManager,
): Promise<Response> {
    try {
        const data = await parseBodyOrThrow(req, RunExamSchema);
        const runner = new ExamRunner(db, processManager);
        const scorecard = await runner.runExam(
            data.model,
            data.categories as ExamCategory[] | undefined,
        );
        return json({ scorecard });
    } catch (err) {
        if (err instanceof ValidationError) return json({ error: err.detail }, 400);
        return handleRouteError(err);
    }
}
