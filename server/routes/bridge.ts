import type { Database } from 'bun:sqlite';
import type { BridgeService } from '../bridge/service';
import { json } from '../lib/response';
import type { RequestContext } from '../middleware/guards';

export async function handleDevBridgeRoutes(
  req: Request,
  url: URL,
  _db: Database,
  _context: RequestContext,
  bridgeService: BridgeService | null,
): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/bridge')) return null;
  if (!bridgeService) return json({ error: 'Bridge service not available' }, 503);

  if (url.pathname === '/api/bridge/sessions' && req.method === 'GET') {
    const sessions = bridgeService.listSessions();
    return json({ sessions, count: sessions.length });
  }

  const sessionMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)$/);
  if (sessionMatch && req.method === 'GET') {
    const session = bridgeService.getSession(sessionMatch[1]);
    if (!session) return json({ error: 'Session not found' }, 404);
    return json({
      sessionId: session.sessionId,
      label: session.label,
      projectId: session.projectId,
      capabilities: session.capabilities,
      connectedAt: session.connectedAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
    });
  }

  if (sessionMatch && req.method === 'DELETE') {
    const sessionId = sessionMatch[1];
    const session = bridgeService.getSession(sessionId);
    if (!session) return json({ error: 'Session not found' }, 404);
    bridgeService.removeSession(sessionId);
    return new Response(null, { status: 204 });
  }

  const requestMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/request$/);
  if (requestMatch && req.method === 'POST') {
    const sessionId = requestMatch[1];
    const session = bridgeService.getSession(sessionId);
    if (!session) return json({ error: 'Session not found' }, 404);

    let body: { request_type: string; path?: string; content?: string; command?: string; cwd?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.request_type) return json({ error: 'request_type is required' }, 400);

    const requestId = crypto.randomUUID();
    const request = {
      id: requestId,
      type: body.request_type as 'file.read' | 'file.write' | 'file.list' | 'exec' | 'ping',
      path: body.path,
      content: body.content,
      command: body.command,
      cwd: body.cwd,
    };

    try {
      const response = await bridgeService.sendRequest(sessionId, request);
      return json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500);
    }
  }

  return null;
}
