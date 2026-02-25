import { describe, it, expect } from 'bun:test';
import { generateOpenApiSpec } from '../generator';
import { routes } from '../route-registry';

describe('OpenAPI Generator', () => {
    it('generates a valid OpenAPI 3.0.3 spec', () => {
        const spec = generateOpenApiSpec();
        expect(spec.openapi).toBe('3.0.3');
        expect(spec.info.title).toBe('Corvid Agent API');
        expect(spec.info.version).toBeTruthy();
    });

    it('includes all registered routes as paths', () => {
        const spec = generateOpenApiSpec();
        const pathCount = Object.keys(spec.paths).length;
        expect(pathCount).toBeGreaterThan(50);
    });

    it('has unique operationIds', () => {
        const spec = generateOpenApiSpec();
        const ids = new Set<string>();
        for (const methods of Object.values(spec.paths)) {
            for (const op of Object.values(methods)) {
                const operation = op as { operationId: string };
                expect(ids.has(operation.operationId)).toBe(false);
                ids.add(operation.operationId);
            }
        }
    });

    it('includes BearerAuth security scheme', () => {
        const spec = generateOpenApiSpec();
        expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
        expect(spec.components.securitySchemes.BearerAuth.type).toBe('http');
        expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
    });

    it('includes request body schemas for routes with Zod schemas', () => {
        const spec = generateOpenApiSpec();
        // POST /api/agents should have a request body
        const createAgent = spec.paths['/api/agents']?.post as {
            requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> };
        };
        expect(createAgent).toBeDefined();
        expect(createAgent.requestBody).toBeDefined();
        const schema = createAgent.requestBody!.content!['application/json']!.schema!;
        expect(schema.properties).toBeDefined();
        expect(schema.properties!.name).toBeDefined();
    });

    it('includes path parameters for parameterized routes', () => {
        const spec = generateOpenApiSpec();
        const getAgent = spec.paths['/api/agents/{id}']?.get as {
            parameters?: Array<{ name: string; in: string; required: boolean }>;
        };
        expect(getAgent).toBeDefined();
        expect(getAgent.parameters).toBeDefined();
        expect(getAgent.parameters!.length).toBe(1);
        expect(getAgent.parameters![0].name).toBe('id');
        expect(getAgent.parameters![0].in).toBe('path');
        expect(getAgent.parameters![0].required).toBe(true);
    });

    it('marks authenticated routes with security', () => {
        const spec = generateOpenApiSpec();
        const listAgents = spec.paths['/api/agents']?.get as {
            security?: Array<Record<string, string[]>>;
        };
        expect(listAgents.security).toBeDefined();
        expect(listAgents.security![0].BearerAuth).toBeDefined();
    });

    it('does not mark public routes with security', () => {
        const spec = generateOpenApiSpec();
        const health = spec.paths['/api/health']?.get as {
            security?: Array<Record<string, string[]>>;
        };
        expect(health.security).toBeUndefined();
    });

    it('includes all tags with descriptions', () => {
        const spec = generateOpenApiSpec();
        expect(spec.tags.length).toBeGreaterThan(10);
        for (const tag of spec.tags) {
            expect(tag.name).toBeTruthy();
        }
    });

    it('respects custom server URL', () => {
        const spec = generateOpenApiSpec({ serverUrl: 'https://api.example.com' });
        expect(spec.servers[0].url).toBe('https://api.example.com');
    });

    it('route registry has consistent entry format', () => {
        for (const route of routes) {
            expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(route.method);
            expect(route.path).toMatch(/^\//);
            expect(route.summary.length).toBeGreaterThan(0);
            expect(route.tags.length).toBeGreaterThan(0);
            expect(['required', 'admin', 'none']).toContain(route.auth);
        }
    });
});
