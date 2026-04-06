import { describe, it, expect } from 'bun:test';
import { handleToolCatalogRoutes } from '../routes/tool-catalog';

function fakeReq(method: string, path: string, query?: Record<string, string>): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            url.searchParams.set(k, v);
        }
    }
    return { req: new Request(url.toString(), { method }), url };
}

describe('Tool Catalog Routes', () => {
    it('GET /api/tools returns flat catalog with categories and tools arrays', async () => {
        const { req, url } = fakeReq('GET', '/api/tools');
        const res = handleToolCatalogRoutes(req, url);
        expect(res).not.toBeNull();
        expect((res as Response).status).toBe(200);
        const data = await (res as Response).json();
        expect(Array.isArray(data.categories)).toBe(true);
        expect(Array.isArray(data.tools)).toBe(true);
        expect(data.tools.length).toBeGreaterThan(0);
    });

    it('GET /api/tools?grouped=true returns array of {category, tools} objects', async () => {
        const { req, url } = fakeReq('GET', '/api/tools', { grouped: 'true' });
        const res = handleToolCatalogRoutes(req, url);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        // Each entry has category (object) and tools
        for (const entry of data) {
            expect(typeof entry.category).toBe('object');
            expect(typeof entry.category.name).toBe('string');
            expect(Array.isArray(entry.tools)).toBe(true);
        }
    });

    it('GET /api/tools?category=X filters to a specific category', async () => {
        // First get all available categories
        const { req: allReq, url: allUrl } = fakeReq('GET', '/api/tools');
        const allRes = handleToolCatalogRoutes(allReq, allUrl);
        const allData = await (allRes as Response).json();
        const firstCategory: string = allData.categories[0];

        const { req, url } = fakeReq('GET', '/api/tools', { category: firstCategory });
        const res = handleToolCatalogRoutes(req, url);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data.tools)).toBe(true);
        // All returned tools should belong to the requested category
        for (const tool of data.tools) {
            expect(tool.category).toBe(firstCategory);
        }
    });

    it('GET /api/tools?category=nonexistent returns empty tools array', async () => {
        const { req, url } = fakeReq('GET', '/api/tools', { category: 'nonexistent-category-xyz' });
        const res = handleToolCatalogRoutes(req, url);
        expect(res).not.toBeNull();
        const data = await (res as Response).json();
        expect(Array.isArray(data.tools)).toBe(true);
        expect(data.tools.length).toBe(0);
    });

    it('returns null for non-/api/tools paths', () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleToolCatalogRoutes(req, url);
        expect(res).toBeNull();
    });

    it('returns null for POST /api/tools', () => {
        const { req, url } = fakeReq('POST', '/api/tools');
        const res = handleToolCatalogRoutes(req, url);
        expect(res).toBeNull();
    });

    it('each tool entry has name, description, and category fields', async () => {
        const { req, url } = fakeReq('GET', '/api/tools');
        const res = handleToolCatalogRoutes(req, url);
        const data = await (res as Response).json();
        for (const tool of data.tools) {
            expect(typeof tool.name).toBe('string');
            expect(typeof tool.description).toBe('string');
            expect(typeof tool.category).toBe('string');
        }
    });
});
