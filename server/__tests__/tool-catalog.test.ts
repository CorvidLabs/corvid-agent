import { test, expect, describe } from 'bun:test';
import { getToolCatalog, getToolCatalogGrouped, TOOL_CATALOG, TOOL_CATEGORIES } from '../mcp/tool-catalog';
import { DEFAULT_CORE_TOOLS } from '../mcp/default-tools';
import { handleToolCatalogRoutes } from '../routes/tool-catalog';

describe('tool-catalog', () => {
    test('returns all tools when no category filter', () => {
        const result = getToolCatalog();
        expect(result.tools.length).toBe(TOOL_CATALOG.length);
        expect(result.categories.length).toBe(TOOL_CATEGORIES.length);
    });

    test('filters by category', () => {
        const result = getToolCatalog('github');
        expect(result.tools.length).toBeGreaterThan(0);
        expect(result.tools.every(t => t.category === 'github')).toBe(true);
    });

    test('returns empty for unknown category', () => {
        const result = getToolCatalog('nonexistent');
        expect(result.tools).toHaveLength(0);
    });

    test('grouped returns all categories with tools', () => {
        const groups = getToolCatalogGrouped();
        expect(groups).toHaveLength(TOOL_CATEGORIES.length);
        for (const group of groups) {
            expect(group.category.name).toBeDefined();
            expect(group.tools.length).toBeGreaterThan(0);
        }
    });

    test('every default core tool has a catalog entry', () => {
        const catalogNames = new Set(TOOL_CATALOG.map(t => t.name));
        for (const toolName of DEFAULT_CORE_TOOLS) {
            expect(catalogNames.has(toolName)).toBe(true);
        }
    });

    test('every catalog entry has a valid category', () => {
        const catNames = new Set(TOOL_CATEGORIES.map(c => c.name));
        for (const entry of TOOL_CATALOG) {
            expect(catNames.has(entry.category)).toBe(true);
        }
    });
});

describe('tool-catalog route', () => {
    test('GET /api/tools returns catalog', () => {
        const req = new Request('http://localhost/api/tools', { method: 'GET' });
        const url = new URL(req.url);
        const res = handleToolCatalogRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
    });

    test('GET /api/tools?category=github filters', async () => {
        const req = new Request('http://localhost/api/tools?category=github', { method: 'GET' });
        const url = new URL(req.url);
        const res = handleToolCatalogRoutes(req, url);
        const body = await res!.json() as { tools: { category: string }[] };
        expect(body.tools.every(t => t.category === 'github')).toBe(true);
    });

    test('GET /api/tools?grouped=true returns grouped', async () => {
        const req = new Request('http://localhost/api/tools?grouped=true', { method: 'GET' });
        const url = new URL(req.url);
        const res = handleToolCatalogRoutes(req, url);
        const body = await res!.json() as { category: { name: string } }[];
        expect(Array.isArray(body)).toBe(true);
        expect(body[0].category.name).toBeDefined();
    });

    test('non-matching path returns null', () => {
        const req = new Request('http://localhost/api/other', { method: 'GET' });
        const url = new URL(req.url);
        expect(handleToolCatalogRoutes(req, url)).toBeNull();
    });
});
