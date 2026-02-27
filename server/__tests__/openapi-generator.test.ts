import { test, expect, describe } from 'bun:test';
import { buildRouteRegistry, type RouteDefinition } from '../docs/route-registry';
import { generateOpenApiSpec } from '../docs/openapi-generator';
import { getMcpToolDocs, type McpToolDoc } from '../docs/mcp-tool-docs';
import { buildOpenApiSpec, getSwaggerUiHtml } from '../docs/index';

// ─── Route Registry ─────────────────────────────────────────────────────────

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

    test('no duplicate method+path combinations', () => {
        const routes = buildRouteRegistry();
        const seen = new Set<string>();
        for (const route of routes) {
            const key = `${route.method} ${route.path}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
    });

    test('all path params reference placeholders in path', () => {
        const routes = buildRouteRegistry();
        for (const route of routes) {
            if (route.pathParams) {
                for (const param of route.pathParams) {
                    expect(route.path).toContain(`{${param.name}}`);
                }
            }
        }
    });

    test('routes with placeholders define pathParams', () => {
        const routes = buildRouteRegistry();
        const withPlaceholders = routes.filter(r => r.path.includes('{'));
        for (const route of withPlaceholders) {
            expect(route.pathParams).toBeDefined();
            expect(route.pathParams!.length).toBeGreaterThan(0);
        }
    });

    test('query params have valid types', () => {
        const routes = buildRouteRegistry();
        for (const route of routes) {
            if (route.queryParams) {
                for (const q of route.queryParams) {
                    expect(['string', 'number']).toContain(q.type);
                    expect(q.name.length).toBeGreaterThan(0);
                    expect(q.description.length).toBeGreaterThan(0);
                }
            }
        }
    });

    test('includes CRUD routes for projects', () => {
        const routes = buildRouteRegistry();
        const projectRoutes = routes.filter(r => r.tags.includes('Projects'));
        expect(projectRoutes.some(r => r.method === 'GET' && r.path === '/api/projects')).toBe(true);
        expect(projectRoutes.some(r => r.method === 'POST' && r.path === '/api/projects')).toBe(true);
        expect(projectRoutes.some(r => r.method === 'GET' && r.path === '/api/projects/{id}')).toBe(true);
        expect(projectRoutes.some(r => r.method === 'PUT' && r.path === '/api/projects/{id}')).toBe(true);
        expect(projectRoutes.some(r => r.method === 'DELETE' && r.path === '/api/projects/{id}')).toBe(true);
    });

    test('includes CRUD routes for councils', () => {
        const routes = buildRouteRegistry();
        const councilRoutes = routes.filter(r => r.tags.includes('Councils'));
        expect(councilRoutes.length).toBeGreaterThanOrEqual(5);
        expect(councilRoutes.some(r => r.method === 'POST' && r.path.endsWith('/launch'))).toBe(true);
    });

    test('includes CRUD routes for workflows', () => {
        const routes = buildRouteRegistry();
        const workflowRoutes = routes.filter(r => r.tags.includes('Workflows'));
        expect(workflowRoutes.length).toBeGreaterThanOrEqual(5);
        expect(workflowRoutes.some(r => r.method === 'POST' && r.path.endsWith('/trigger'))).toBe(true);
    });

    test('includes CRUD routes for schedules', () => {
        const routes = buildRouteRegistry();
        const scheduleRoutes = routes.filter(r => r.tags.includes('Schedules'));
        expect(scheduleRoutes.length).toBeGreaterThanOrEqual(4);
    });

    test('includes work task routes', () => {
        const routes = buildRouteRegistry();
        const taskRoutes = routes.filter(r => r.tags.includes('Work Tasks'));
        expect(taskRoutes.length).toBeGreaterThanOrEqual(2);
    });

    test('browse-dirs requires authentication', () => {
        const routes = buildRouteRegistry();
        const browse = routes.find(r => r.path === '/api/browse-dirs');
        expect(browse).toBeDefined();
        expect(browse!.auth).toBe(true);
    });

    test('most routes do not require authentication', () => {
        const routes = buildRouteRegistry();
        const authed = routes.filter(r => r.auth);
        const unauthed = routes.filter(r => !r.auth);
        expect(unauthed.length).toBeGreaterThan(authed.length);
    });

    test('POST routes with schemas have requestSchema defined', () => {
        const routes = buildRouteRegistry();
        const createRoutes = routes.filter(r =>
            r.method === 'POST' && ['/api/projects', '/api/agents', '/api/sessions', '/api/councils'].includes(r.path),
        );
        for (const route of createRoutes) {
            expect(route.requestSchema).toBeDefined();
        }
    });

    test('includes A2A agent card route', () => {
        const routes = buildRouteRegistry();
        const agentCard = routes.find(r => r.path === '/.well-known/agent-card.json');
        expect(agentCard).toBeDefined();
        expect(agentCard!.method).toBe('GET');
        expect(agentCard!.auth).toBe(false);
    });

    test('all summaries are non-empty strings', () => {
        const routes = buildRouteRegistry();
        for (const route of routes) {
            expect(typeof route.summary).toBe('string');
            expect(route.summary.length).toBeGreaterThan(0);
        }
    });

    test('all tags are non-empty strings', () => {
        const routes = buildRouteRegistry();
        for (const route of routes) {
            for (const tag of route.tags) {
                expect(typeof tag).toBe('string');
                expect(tag.length).toBeGreaterThan(0);
            }
        }
    });

    test('feed history route has query params for pagination', () => {
        const routes = buildRouteRegistry();
        const feed = routes.find(r => r.path === '/api/feed/history');
        expect(feed).toBeDefined();
        expect(feed!.queryParams).toBeDefined();
        const paramNames = feed!.queryParams!.map(q => q.name);
        expect(paramNames).toContain('limit');
        expect(paramNames).toContain('offset');
    });

    test('AlgoChat routes are present', () => {
        const routes = buildRouteRegistry();
        const algochatRoutes = routes.filter(r => r.tags.includes('AlgoChat'));
        expect(algochatRoutes.length).toBeGreaterThanOrEqual(2);
    });

    test('escalation routes are present', () => {
        const routes = buildRouteRegistry();
        const escalation = routes.filter(r => r.tags.includes('Escalation'));
        expect(escalation.length).toBeGreaterThanOrEqual(1);
    });
});

// ─── OpenAPI Generator ──────────────────────────────────────────────────────

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

    test('spec info includes description', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        expect(spec.info.description).toBeDefined();
        expect(spec.info.description.length).toBeGreaterThan(0);
    });

    test('spec includes a server entry', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        expect(spec.servers.length).toBeGreaterThan(0);
        expect(spec.servers[0].url).toContain('127.0.0.1');
    });

    test('version is passed through to spec', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/v', summary: 'Version test',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '2.5.3');
        expect(spec.info.version).toBe('2.5.3');
    });

    test('security scheme is bearer type', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const bearer = spec.components.securitySchemes.bearerAuth as Record<string, unknown>;
        expect(bearer.type).toBe('http');
        expect(bearer.scheme).toBe('bearer');
    });

    test('tags are sorted alphabetically', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const names = spec.tags.map(t => t.name);
        const sorted = [...names].sort();
        expect(names).toEqual(sorted);
    });

    test('authenticated route has security requirement', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/secure', summary: 'Secure',
            tags: ['Test'], auth: true,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/secure'] as Record<string, unknown>).get as Record<string, unknown>;
        expect(op.security).toBeDefined();
        const security = op.security as Array<Record<string, string[]>>;
        expect(security[0].bearerAuth).toBeDefined();
    });

    test('authenticated route gets 401 and 403 responses', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/secure', summary: 'Secure',
            tags: ['Test'], auth: true,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/secure'] as Record<string, unknown>).get as Record<string, unknown>;
        const responses = op.responses as Record<string, unknown>;
        expect(responses['401']).toBeDefined();
        expect(responses['403']).toBeDefined();
    });

    test('unauthenticated route omits 401 and 403 responses', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/public', summary: 'Public',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/public'] as Record<string, unknown>).get as Record<string, unknown>;
        const responses = op.responses as Record<string, unknown>;
        expect(responses['401']).toBeUndefined();
        expect(responses['403']).toBeUndefined();
    });

    test('all operations have 200, 400, 404, and 500 responses', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        for (const pathObj of Object.values(spec.paths)) {
            for (const op of Object.values(pathObj as Record<string, Record<string, unknown>>)) {
                const responses = op.responses as Record<string, unknown>;
                expect(responses['200']).toBeDefined();
                expect(responses['400']).toBeDefined();
                expect(responses['404']).toBeDefined();
                expect(responses['500']).toBeDefined();
            }
        }
    });

    test('all operations have an operationId', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        for (const pathObj of Object.values(spec.paths)) {
            for (const op of Object.values(pathObj as Record<string, Record<string, unknown>>)) {
                expect(op.operationId).toBeDefined();
                expect(typeof op.operationId).toBe('string');
                expect((op.operationId as string).length).toBeGreaterThan(0);
            }
        }
    });

    test('operationId format follows method_segments pattern', () => {
        const routes: RouteDefinition[] = [
            { method: 'GET', path: '/api/items', summary: 'List', tags: ['Test'], auth: false },
            { method: 'POST', path: '/api/items', summary: 'Create', tags: ['Test'], auth: false },
        ];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const pathObj = spec.paths['/api/items'] as Record<string, Record<string, unknown>>;
        expect(pathObj.get.operationId).toBe('get_items');
        expect(pathObj.post.operationId).toBe('post_items');
    });

    test('query parameters have in=query and required flag', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const feedHistory = (spec.paths['/api/feed/history'] as Record<string, unknown>).get as Record<string, unknown>;
        const params = feedHistory.parameters as Array<{ name: string; in: string; required: boolean }>;
        expect(params).toBeDefined();
        for (const p of params) {
            expect(p.in).toBe('query');
            expect(typeof p.required).toBe('boolean');
        }
    });

    test('browse-dirs required query param is marked required', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const browseDirs = (spec.paths['/api/browse-dirs'] as Record<string, unknown>).get as Record<string, unknown>;
        const params = browseDirs.parameters as Array<{ name: string; in: string; required: boolean }>;
        const pathParam = params.find(p => p.name === 'path');
        expect(pathParam).toBeDefined();
        expect(pathParam!.required).toBe(true);
    });

    test('request body references schema via $ref', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const agentsPost = (spec.paths['/api/agents'] as Record<string, unknown>).post as Record<string, unknown>;
        expect(agentsPost.requestBody).toBeDefined();
        const body = agentsPost.requestBody as Record<string, unknown>;
        expect(body.required).toBe(true);
        const content = body.content as Record<string, Record<string, unknown>>;
        const jsonSchema = content['application/json'].schema as Record<string, string>;
        expect(jsonSchema.$ref).toMatch(/^#\/components\/schemas\//);
    });

    test('generated schemas do not contain $schema metadata', () => {
        const routes = buildRouteRegistry();
        const spec = generateOpenApiSpec(routes, '1.0.0');
        for (const schema of Object.values(spec.components.schemas) as Record<string, unknown>[]) {
            expect(schema.$schema).toBeUndefined();
        }
    });

    test('description is included when route has one', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/described', summary: 'Has desc',
            description: 'Detailed description here.',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/described'] as Record<string, unknown>).get as Record<string, unknown>;
        expect(op.description).toBe('Detailed description here.');
    });

    test('description is omitted when route has none', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/no-desc', summary: 'No desc',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/no-desc'] as Record<string, unknown>).get as Record<string, unknown>;
        expect(op.description).toBeUndefined();
    });

    test('custom responseDescription is used in 200 response', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/custom-resp', summary: 'Custom',
            tags: ['Test'], auth: false,
            responseDescription: 'Returns the widget list',
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/custom-resp'] as Record<string, unknown>).get as Record<string, unknown>;
        const resp = (op.responses as Record<string, Record<string, string>>)['200'];
        expect(resp.description).toBe('Returns the widget list');
    });

    test('default 200 response description is Success', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/default-resp', summary: 'Default',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/default-resp'] as Record<string, unknown>).get as Record<string, unknown>;
        const resp = (op.responses as Record<string, Record<string, string>>)['200'];
        expect(resp.description).toBe('Success');
    });

    test('multiple methods on same path are stored correctly', () => {
        const routes: RouteDefinition[] = [
            { method: 'GET', path: '/items', summary: 'List', tags: ['Test'], auth: false },
            { method: 'POST', path: '/items', summary: 'Create', tags: ['Test'], auth: false },
        ];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const pathObj = spec.paths['/items'] as Record<string, unknown>;
        expect(pathObj.get).toBeDefined();
        expect(pathObj.post).toBeDefined();
    });

    test('parameters array is omitted when route has no params', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/no-params', summary: 'No params',
            tags: ['Test'], auth: false,
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/no-params'] as Record<string, unknown>).get as Record<string, unknown>;
        expect(op.parameters).toBeUndefined();
    });

    test('path and query params are combined into single parameters array', () => {
        const routes: RouteDefinition[] = [{
            method: 'GET', path: '/items/{id}', summary: 'Get item',
            tags: ['Test'], auth: false,
            pathParams: [{ name: 'id', description: 'Item ID' }],
            queryParams: [{ name: 'verbose', description: 'Verbose output', type: 'string' }],
        }];
        const spec = generateOpenApiSpec(routes, '1.0.0');
        const op = (spec.paths['/items/{id}'] as Record<string, unknown>).get as Record<string, unknown>;
        const params = op.parameters as Array<{ name: string; in: string }>;
        expect(params.length).toBe(2);
        expect(params.some(p => p.in === 'path')).toBe(true);
        expect(params.some(p => p.in === 'query')).toBe(true);
    });
});

// ─── MCP Tool Docs ──────────────────────────────────────────────────────────

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

    test('no duplicate tool names', () => {
        const tools = getMcpToolDocs();
        const names = tools.map(t => t.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });

    test('tool names use snake_case', () => {
        const tools = getMcpToolDocs();
        for (const tool of tools) {
            expect(tool.name).toMatch(/^[a-z_]+$/);
        }
    });

    test('includes agent management tools', () => {
        const tools = getMcpToolDocs();
        const names = tools.map(t => t.name);
        expect(names).toContain('corvid_list_agents');
        expect(names).toContain('corvid_list_sessions');
        expect(names).toContain('corvid_get_session_info');
    });

    test('includes messaging tools', () => {
        const tools = getMcpToolDocs();
        const names = tools.map(t => t.name);
        expect(names).toContain('corvid_send_message');
        expect(names).toContain('corvid_read_messages');
    });

    test('includes memory tools', () => {
        const tools = getMcpToolDocs();
        const names = tools.map(t => t.name);
        expect(names).toContain('corvid_save_memory');
        expect(names).toContain('corvid_recall_memory');
    });

    test('includes GitHub tools', () => {
        const tools = getMcpToolDocs();
        const ghTools = tools.filter(t => t.name.startsWith('corvid_github_'));
        expect(ghTools.length).toBeGreaterThanOrEqual(8);
    });

    test('includes web tools', () => {
        const tools = getMcpToolDocs();
        const names = tools.map(t => t.name);
        expect(names).toContain('corvid_web_search');
        expect(names).toContain('corvid_web_fetch');
    });

    test('includes work task tools', () => {
        const tools = getMcpToolDocs();
        const names = tools.map(t => t.name);
        expect(names).toContain('corvid_create_work_task');
        expect(names).toContain('corvid_list_work_tasks');
    });

    test('all descriptions are meaningful (>10 chars)', () => {
        const tools = getMcpToolDocs();
        for (const tool of tools) {
            expect(tool.description.length).toBeGreaterThan(10);
        }
    });

    test('McpToolDoc interface shape is correct', () => {
        const tools = getMcpToolDocs();
        for (const tool of tools) {
            expect(typeof tool.name).toBe('string');
            expect(typeof tool.description).toBe('string');
            if (tool.inputSchema !== undefined) {
                expect(typeof tool.inputSchema).toBe('object');
            }
        }
    });
});

// ─── OpenAPI Docs Index ─────────────────────────────────────────────────────

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

    test('x-mcp-tools array has correct structure', () => {
        const spec = buildOpenApiSpec('0.9.0');
        const tools = spec['x-mcp-tools'] as McpToolDoc[];
        expect(tools.length).toBeGreaterThan(0);
        for (const tool of tools) {
            expect(tool.name).toBeDefined();
            expect(tool.description).toBeDefined();
        }
    });

    test('buildOpenApiSpec includes standard OpenAPI fields', () => {
        const spec = buildOpenApiSpec('0.9.0');
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();
        expect(spec.components).toBeDefined();
        expect(spec.tags).toBeDefined();
    });

    test('getSwaggerUiHtml returns valid HTML', () => {
        const html = getSwaggerUiHtml('/api/docs/openapi.json');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('swagger-ui');
        expect(html).toContain('/api/docs/openapi.json');
    });

    test('getSwaggerUiHtml includes Swagger UI CDN links', () => {
        const html = getSwaggerUiHtml('/spec.json');
        expect(html).toContain('swagger-ui-dist');
        expect(html).toContain('swagger-ui-bundle.js');
        expect(html).toContain('swagger-ui.css');
    });

    test('getSwaggerUiHtml embeds the spec URL in script', () => {
        const html = getSwaggerUiHtml('/my/custom/path.json');
        expect(html).toContain('/my/custom/path.json');
        expect(html).toContain('SwaggerUIBundle');
    });

    test('getSwaggerUiHtml has proper meta tags', () => {
        const html = getSwaggerUiHtml('/spec.json');
        expect(html).toContain('charset="utf-8"');
        expect(html).toContain('viewport');
    });
});
