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

  return null;
}
