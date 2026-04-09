import { describe, expect, it } from 'bun:test';
import { TOOL_CATALOG, TOOL_CATEGORIES } from '../mcp/tool-catalog';
import { handleToolCatalogRoutes } from '../routes/tool-catalog';

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

describe('Tool Catalog Routes', () => {
  it('GET /api/tools returns flat catalog', async () => {
    const { req, url } = fakeReq('GET', '/api/tools');
    const res = handleToolCatalogRoutes(req, url);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as { tools: unknown[]; categories: unknown[] };
    expect(data.tools.length).toBe(TOOL_CATALOG.length);
    expect(data.categories.length).toBe(TOOL_CATEGORIES.length);
  });

  it('GET /api/tools?grouped=true returns grouped catalog', async () => {
    const { req, url } = fakeReq('GET', '/api/tools?grouped=true');
    const res = handleToolCatalogRoutes(req, url);
    expect(res).not.toBeNull();
    const data = (await res!.json()) as { category: { name: string }; tools: unknown[] }[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(TOOL_CATEGORIES.length);
    expect(data[0].category.name).toBeDefined();
  });

  it('GET /api/tools?category=github filters by category', async () => {
    const { req, url } = fakeReq('GET', '/api/tools?category=github');
    const res = handleToolCatalogRoutes(req, url);
    expect(res).not.toBeNull();
    const data = (await res!.json()) as { tools: { category: string }[] };
    expect(data.tools.length).toBeGreaterThan(0);
    expect(data.tools.every((t) => t.category === 'github')).toBe(true);
  });

  it('GET /api/tools?category=nonexistent returns empty tools', async () => {
    const { req, url } = fakeReq('GET', '/api/tools?category=nonexistent');
    const res = handleToolCatalogRoutes(req, url);
    expect(res).not.toBeNull();
    const data = (await res!.json()) as { tools: unknown[] };
    expect(data.tools).toHaveLength(0);
  });

  it('returns null for non-/api/tools paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    expect(handleToolCatalogRoutes(req, url)).toBeNull();
  });

  it('returns null for POST /api/tools', () => {
    const { req, url } = fakeReq('POST', '/api/tools');
    expect(handleToolCatalogRoutes(req, url)).toBeNull();
  });

  it('returns null for /api/tools/subpath', () => {
    const { req, url } = fakeReq('GET', '/api/tools/something');
    expect(handleToolCatalogRoutes(req, url)).toBeNull();
  });
});
