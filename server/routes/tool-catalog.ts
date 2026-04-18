/**
 * Tool catalog routes — discoverable MCP tool listing.
 */
import { json } from '../lib/response';
import { getToolCatalog, getToolCatalogGrouped } from '../mcp/tool-catalog';
import type { RequestContext } from '../middleware/guards';

export function handleToolCatalogRoutes(req: Request, url: URL, _context?: RequestContext): Response | null {
  if (!url.pathname.startsWith('/api/tools')) return null;

  // GET /api/tools — list all tools, optionally filtered by category
  if (req.method === 'GET' && url.pathname === '/api/tools') {
    const category = url.searchParams.get('category') ?? undefined;
    const grouped = url.searchParams.get('grouped') === 'true';

    if (grouped) {
      return json(getToolCatalogGrouped());
    }
    return json(getToolCatalog(category));
  }

  return null;
}
