/**
 * Cursor Agent CLI model discovery routes.
 *
 * Lists models available via the cursor-agent CLI for the dashboard.
 */

import { createLogger } from '../lib/logger';
import { json } from '../lib/response';
import { getCursorBinPath, hasCursorAccess } from '../process/cursor-process';
import { getModelsForProvider } from '../providers/cost-table';

const log = createLogger('CursorRoutes');

let cachedModels: Array<{ id: string; name: string }> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function handleCursorRoutes(req: Request, url: URL): Response | Promise<Response> | null {
  if (!url.pathname.startsWith('/api/cursor')) return null;

  if (url.pathname === '/api/cursor/status' && req.method === 'GET') {
    const available = hasCursorAccess();
    return json({
      status: available ? 'available' : 'unavailable',
      bin: available ? getCursorBinPath() : null,
      configuredModels: getModelsForProvider('cursor').length,
    });
  }

  if (url.pathname === '/api/cursor/models' && req.method === 'GET') {
    return handleListModels();
  }

  if (url.pathname === '/api/cursor/models/configured' && req.method === 'GET') {
    const models = getModelsForProvider('cursor');
    return json({ models });
  }

  return null;
}

async function handleListModels(): Promise<Response> {
  if (!hasCursorAccess()) {
    return json({ error: 'cursor-agent CLI not available', models: [] }, 503);
  }

  if (cachedModels && Date.now() - cacheTime < CACHE_TTL_MS) {
    return json({ models: cachedModels, total: cachedModels.length, cached: true });
  }

  try {
    const proc = Bun.spawn([getCursorBinPath(), '--list-models'], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const models: Array<{ id: string; name: string }> = [];
    for (const line of output.split('\n')) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
      const cleaned = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      if (!cleaned || cleaned.startsWith('Available') || cleaned.startsWith('Tip:') || cleaned.startsWith('Loading'))
        continue;

      const match = cleaned.match(/^(\S+)\s+-\s+(.+?)(\s+\(current.*\))?$/);
      if (match) {
        models.push({ id: match[1], name: match[2].trim() });
      }
    }

    cachedModels = models;
    cacheTime = Date.now();

    return json({ models, total: models.length });
  } catch (err) {
    log.warn('Failed to list cursor models', { error: err instanceof Error ? err.message : String(err) });
    const fallback = getModelsForProvider('cursor').map((m) => ({ id: m.model, name: m.displayName }));
    return json({ models: fallback, total: fallback.length, error: 'Failed to query cursor-agent CLI' });
  }
}
