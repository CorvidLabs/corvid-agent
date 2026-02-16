import { test, expect, describe } from 'bun:test';
import { buildRouteRegistry, type RouteDefinition } from '../docs/route-registry';
import { generateOpenApiSpec } from '../docs/openapi-generator';
import { getMcpToolDocs } from '../docs/mcp-tool-docs';
import { buildOpenApiSpec, getSwaggerUiHtml } from '../docs/index';

describe('Route Registry', () => {
    test('returns an array of route definitions', () => {
        const routes = buildRouteRegistry();
        expect(Array.isArray(routes)).toBe(true);
        expect(routes.length).toBeGreaterThan(30);
    });

    test('all routes have required fields', () => {
        const routes = buildRouteRegistry();
        for (const route of routes) {
            expect(route.method).toBeDefined();
            expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(route.method);
            expect(route.path).toBeDefined();
            expect(route.path.startsWith('/')).toBe(true);
            expect(route.summary).toBeDefined();
            expect(route.tags.length).toBeGreaterThan(0);
            expect(typeof route.auth).toBe('boolean');
        }
    });

    test('includes health endpoint', () => {
        const routes = buildRouteRegistry();
        const health = routes.find(r => r.path === '/api/health' && r.method === 'GET');
        expect(health).toBeDefined();
        expect(health!.auth).toBe(false);
    });

    test('includes CRUD routes for agents', () => {
        const routes = buildRouteRegistry();
        const agentRoutes = routes.filter(r => r.tags.includes('Agents'));
        expect(agentRoutes.length).toBeGreaterThanOrEqual(5);
        expect(agentRoutes.some(r => r.method === 'GET')).toBe(true);
        expect(agentRoutes.some(r => r.method === 'POST')).toBe(true);
        expect(agentRoutes.some(r => r.method === 'PUT')).toBe(true);
        expect(agentRoutes.some(r => r.method === 'DELETE')).toBe(true);
    });

    test('includes CRUD routes for sessions', () => {
        const routes = buildRouteRegistry();
        const sessionRoutes = routes.filter(r => r.tags.includes('Sessions'));
        expect(sessionRoutes.length).toBeGreaterThanOrEqual(5);
    });
});

describe('OpenAPI Generator', () => {
    test('generates valid OpenAPI 3.1 spec', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '0.9.0');

        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info.title).toBe('corvid-agent API');
        expect(spec.info.version).toBe('0.9.0');
    });

    test('generates paths for all routes', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '0.9.0');
        const pathKeys = Object.keys(spec.paths);

        expect(pathKeys.length).toBeGreaterThan(20);
        expect(pathKeys).toContain('/api/health');
        expect(pathKeys).toContain('/api/agents');
        expect(pathKeys).toContain('/api/sessions');
    });

    test('generates schemas from Zod for POST routes', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '0.9.0');
        const schemaNames = Object.keys(spec.components.schemas);

        expect(schemaNames.length).toBeGreaterThan(5);
    });

    test('includes security scheme', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '0.9.0');

        expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    });

    test('generates tags from route definitions', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '0.9.0');

        expect(spec.tags.length).toBeGreaterThan(3);
        expect(spec.tags.some(t => t.name === 'System')).toBe(true);
        expect(spec.tags.some(t => t.name === 'Agents')).toBe(true);
    });

    test('path parameters have correct format', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '0.9.0');

        const agentGet = (spec.paths['/api/agents/{id}'] as Record<string, unknown>)?.get as Record<string, unknown> | undefined;
        expect(agentGet).toBeDefined();
        const params = agentGet!.parameters as Array<{ name: string; in: string; required: boolean }>;
        expect(params).toBeDefined();
        expect(params.some(p => p.name === 'id' && p.in === 'path' && p.required === true)).toBe(true);
    });

    test('handles simple route without schema', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/test', summary: 'Test',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        expect(spec.paths['/test']).toBeDefined();
        expect(Object.keys(spec.components.schemas).length).toBe(0);
    });
});

describe('MCP Tool Docs', () => {
    test('returns array of tool docs', () => {
        const tools = getMcpToolDocs();
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(20);
    });

    test('all tools have name and description', () => {
        const tools = getMcpToolDocs();
        for (const tool of tools) {
            expect(tool.name).toBeDefined();
            expect(tool.name.startsWith('corvid_')).toBe(true);
            expect(tool.description.length).toBeGreaterThan(0);
        }
    });
});

describe('OpenAPI Docs Index', () => {
    test('buildOpenApiSpec returns cached spec', () => {
        const spec1 = buildOpenApiSpec('0.9.0');
        const spec2 = buildOpenApiSpec('0.9.0');
        expect(spec1).toBe(spec2); // Same reference (cached)
    });

    test('buildOpenApiSpec includes x-mcp-tools', () => {
        const spec = buildOpenApiSpec('0.9.0');
        expect(spec['x-mcp-tools']).toBeDefined();
        expect(Array.isArray(spec['x-mcp-tools'])).toBe(true);
    });

    test('getSwaggerUiHtml returns valid HTML', () => {
        const html = getSwaggerUiHtml('/api/docs/openapi.json');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('swagger-ui');
        expect(html).toContain('/api/docs/openapi.json');
    });
});
