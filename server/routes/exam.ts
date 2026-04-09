import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { deleteExamRun, getExamRun, getLatestByModel, listExamRuns } from '../db/model-exams';
import { ExamRunner } from '../exam/runner';
import type { ExamCategory } from '../exam/types';
import { EXAM_CATEGORIES } from '../exam/types';
import { handleRouteError, json, notFound, safeNumParam } from '../lib/response';
import { parseBodyOrThrow, ValidationError } from '../lib/validation';
import type { ProcessManager } from '../process/manager';

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

  // GET /api/exam/runs — list past exam runs
  if (url.pathname === '/api/exam/runs' && req.method === 'GET') {
    return handleListRuns(url, db);
  }

  // GET /api/exam/models — latest run per model (comparison view)
  if (url.pathname === '/api/exam/models' && req.method === 'GET') {
    return handleLatestByModel(db);
  }

  // GET /api/exam/runs/:id — get a specific run with results
  const runMatch = url.pathname.match(/^\/api\/exam\/runs\/([^/]+)$/);
  if (runMatch) {
    if (req.method === 'GET') {
      return handleGetRun(runMatch[1], db);
    }
    if (req.method === 'DELETE') {
      return handleDeleteRun(runMatch[1], db);
    }
  }

  return null;
}

async function handleRunExam(req: Request, db: Database, processManager: ProcessManager): Promise<Response> {
  try {
    const data = await parseBodyOrThrow(req, RunExamSchema);
    const runner = new ExamRunner(db, processManager);
    const scorecard = await runner.runExam(
      data.model,
      data.categories as ExamCategory[] | undefined,
      db, // persist results
    );
    return json({ scorecard });
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.detail }, 400);
    return handleRouteError(err);
  }
}

function handleListRuns(url: URL, db: Database): Response {
  try {
    const model = url.searchParams.get('model') || undefined;
    const limit = safeNumParam(url.searchParams.get('limit'), 50);
    const offset = safeNumParam(url.searchParams.get('offset'), 0);
    const runs = listExamRuns(db, { model, limit, offset });
    return json({ runs });
  } catch (err) {
    return handleRouteError(err);
  }
}

function handleGetRun(id: string, db: Database): Response {
  try {
    const run = getExamRun(db, id);
    if (!run) return notFound('Exam run not found');
    return json({ run });
  } catch (err) {
    return handleRouteError(err);
  }
}

function handleLatestByModel(db: Database): Response {
  try {
    const runs = getLatestByModel(db);
    return json({ runs });
  } catch (err) {
    return handleRouteError(err);
  }
}

function handleDeleteRun(id: string, db: Database): Response {
  try {
    const deleted = deleteExamRun(db, id);
    if (!deleted) return notFound('Exam run not found');
    return json({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
