import { describe, it, expect } from 'bun:test';
import { generateOpenApiSpec } from '../generator';
import { routes } from '../route-registry';

/**
 * Comprehensive API spec validation tests.
 *
 * These tests ensure the OpenAPI spec is complete, consistent, and matches
 * what the route handlers actually implement.
 */

describe('API Spec Validation', () => {
    const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });

    // ── Structural integrity ───────────────────────────────────────────────

    describe('structural integrity', () => {
        it('uses OpenAPI 3.0.3', () => {
            expect(spec.openapi).toBe('3.0.3');
        });

        it('has complete info section', () => {
            expect(spec.info.title).toBe('Corvid Agent API');
            expect(spec.info.version).toBeTruthy();
            expect(spec.info.description).toBeTruthy();
            expect(spec.info.license).toBeDefined();
        });

        it('has at least one server', () => {
            expect(spec.servers.length).toBeGreaterThan(0);
            expect(spec.servers[0].url).toBeTruthy();
        });

        it('defines BearerAuth security scheme', () => {
            expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
            expect(spec.components.securitySchemes.BearerAuth.type).toBe('http');
            expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
        });
    });

    // ── Route registry consistency ─────────────────────────────────────────

    describe('route registry consistency', () => {
        it('has no duplicate routes', () => {
            const seen = new Set<string>();
            for (const route of routes) {
                const key = `${route.method}:${route.path}`;
                expect(seen.has(key)).toBe(false);
                seen.add(key);
            }
        });

        it('all routes have valid HTTP methods', () => {
            const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
            for (const route of routes) {
                expect(validMethods).toContain(route.method);
            }
        });

        it('all routes have paths starting with /', () => {
            for (const route of routes) {
                expect(route.path.startsWith('/')).toBe(true);
            }
        });

        it('all routes have non-empty summaries', () => {
            for (const route of routes) {
                expect(route.summary.length).toBeGreaterThan(0);
            }
        });

        it('all routes have at least one tag', () => {
            for (const route of routes) {
                expect(route.tags.length).toBeGreaterThan(0);
            }
        });

        it('all routes have valid auth level', () => {
            for (const route of routes) {
                expect(['required', 'admin', 'none']).toContain(route.auth);
            }
        });

        it('registers 200+ routes', () => {
            expect(routes.length).toBeGreaterThanOrEqual(200);
        });
    });

    // ── Operation completeness ─────────────────────────────────────────────

    describe('operation completeness', () => {
        it('every operation has a unique operationId', () => {
            const ids = new Set<string>();
            for (const methods of Object.values(spec.paths)) {
                for (const op of Object.values(methods)) {
                    const operation = op as { operationId: string };
                    expect(operation.operationId).toBeTruthy();
                    expect(ids.has(operation.operationId)).toBe(false);
                    ids.add(operation.operationId);
                }
            }
        });

        it('every operation has at least one response', () => {
            for (const methods of Object.values(spec.paths)) {
                for (const op of Object.values(methods)) {
                    const operation = op as { responses?: Record<string, unknown> };
                    expect(operation.responses).toBeDefined();
                    expect(Object.keys(operation.responses!).length).toBeGreaterThan(0);
                }
            }
        });

        it('path parameters are defined for all {param} placeholders', () => {
            for (const [path, methods] of Object.entries(spec.paths)) {
                const paramNames = Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => m[1]);
                if (paramNames.length === 0) continue;

                for (const op of Object.values(methods)) {
                    const operation = op as { parameters?: Array<{ name: string; in: string }> };
                    for (const name of paramNames) {
                        const found = operation.parameters?.find(
                            (p) => p.name === name && p.in === 'path',
                        );
                        expect(found).toBeDefined();
                    }
                }
            }
        });
    });

    // ── Tag consistency ────────────────────────────────────────────────────

    describe('tag consistency', () => {
        const definedTags = new Set(spec.tags.map((t) => t.name));
        const usedTags = new Set<string>();

        for (const methods of Object.values(spec.paths)) {
            for (const op of Object.values(methods)) {
                const operation = op as { tags?: string[] };
                for (const tag of operation.tags ?? []) {
                    usedTags.add(tag);
                }
            }
        }

        it('all used tags are defined in spec.tags', () => {
            for (const tag of usedTags) {
                expect(definedTags.has(tag)).toBe(true);
            }
        });

        it('has descriptions for major tags', () => {
            const majorTags = ['System', 'Projects', 'Agents', 'Sessions', 'Councils'];
            for (const tagName of majorTags) {
                const tag = spec.tags.find((t) => t.name === tagName);
                expect(tag).toBeDefined();
                expect(tag!.description).toBeTruthy();
            }
        });
    });

    // ── Request body schema coverage ───────────────────────────────────────

    describe('request body schema coverage', () => {
        // These are the key mutating endpoints that MUST have request body schemas
        const requiredSchemas: Array<[string, string]> = [
            ['POST', '/api/projects'],
            ['PUT', '/api/projects/{id}'],
            ['POST', '/api/agents'],
            ['PUT', '/api/agents/{id}'],
            ['POST', '/api/agents/{id}/fund'],
            ['POST', '/api/agents/{id}/invoke'],
            ['PUT', '/api/agents/{id}/spending-cap'],
            ['POST', '/api/sessions'],
            ['PUT', '/api/sessions/{id}'],
            ['POST', '/api/sessions/{id}/resume'],
            ['POST', '/api/councils'],
            ['PUT', '/api/councils/{id}'],
            ['POST', '/api/councils/{id}/launch'],
            ['POST', '/api/council-launches/{id}/chat'],
            ['POST', '/api/council-launches/{id}/vote'],
            ['POST', '/api/work-tasks'],
            ['POST', '/api/allowlist'],
            ['PUT', '/api/allowlist/{address}'],
            ['POST', '/api/github-allowlist'],
            ['PUT', '/api/github-allowlist/{username}'],
            ['POST', '/api/repo-blocklist'],
            ['POST', '/api/schedules'],
            ['PUT', '/api/schedules/{id}'],
            ['POST', '/api/schedules/bulk'],
            ['POST', '/api/webhooks'],
            ['PUT', '/api/webhooks/{id}'],
            ['POST', '/api/mention-polling'],
            ['PUT', '/api/mention-polling/{id}'],
            ['POST', '/api/workflows'],
            ['PUT', '/api/workflows/{id}'],
            ['POST', '/api/workflows/{id}/trigger'],
            ['POST', '/api/sandbox/assign'],
            ['PUT', '/api/sandbox/policies/{agentId}'],
            ['POST', '/api/plugins/load'],
            ['POST', '/api/plugins/{name}/grant'],
            ['POST', '/api/plugins/{name}/revoke'],
            ['PUT', '/api/settings/credits'],
            ['POST', '/api/exam/run'],
            ['POST', '/api/escalation-queue/{id}/resolve'],
            ['POST', '/api/operational-mode'],
            ['POST', '/api/algochat/network'],
            ['POST', '/api/selftest/run'],
            ['POST', '/api/skill-bundles'],
            ['PUT', '/api/skill-bundles/{id}'],
            ['POST', '/api/mcp-servers'],
            ['PUT', '/api/mcp-servers/{id}'],
        ];

        for (const [method, path] of requiredSchemas) {
            it(`${method} ${path} has a request body schema`, () => {
                const route = routes.find((r) => r.method === method && r.path === path);
                expect(route).toBeDefined();
                expect(route!.requestBody).toBeDefined();
            });
        }

        it('request body schemas produce valid JSON Schema', () => {
            for (const route of routes) {
                if (!route.requestBody) continue;

                const pathItem = spec.paths[route.path];
                expect(pathItem).toBeDefined();

                const methodKey = route.method.toLowerCase();
                const op = pathItem[methodKey] as {
                    requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
                };

                expect(op).toBeDefined();
                expect(op.requestBody).toBeDefined();
                const schema = op.requestBody!.content!['application/json']?.schema;
                expect(schema).toBeDefined();
                // Schema should have properties or union types, not be an empty object
                const hasContent = schema!.properties || schema!.anyOf || schema!.oneOf || schema!.type;
                expect(hasContent).toBeTruthy();
            }
        });
    });

    // ── Security annotations ───────────────────────────────────────────────

    describe('security annotations', () => {
        it('authenticated routes have security defined', () => {
            for (const route of routes) {
                if (route.auth === 'none') continue;

                const pathItem = spec.paths[route.path];
                if (!pathItem) continue;
                const methodKey = route.method.toLowerCase();
                const op = pathItem[methodKey] as { security?: Array<Record<string, string[]>> };
                if (!op) continue;

                expect(op.security).toBeDefined();
                expect(op.security!.length).toBeGreaterThan(0);
                expect(op.security![0].BearerAuth).toBeDefined();
            }
        });

        it('public routes do not have security defined', () => {
            for (const route of routes) {
                if (route.auth !== 'none') continue;

                const pathItem = spec.paths[route.path];
                if (!pathItem) continue;
                const methodKey = route.method.toLowerCase();
                const op = pathItem[methodKey] as { security?: Array<Record<string, string[]>> };
                if (!op) continue;

                expect(op.security).toBeUndefined();
            }
        });

        it('admin routes have 401 and 403 responses', () => {
            for (const route of routes) {
                if (route.auth !== 'admin') continue;

                const pathItem = spec.paths[route.path];
                if (!pathItem) continue;
                const methodKey = route.method.toLowerCase();
                const op = pathItem[methodKey] as { responses?: Record<string, unknown> };
                if (!op?.responses) continue;

                expect(op.responses['401']).toBeDefined();
                expect(op.responses['403']).toBeDefined();
            }
        });
    });

    // ── Specific route coverage ────────────────────────────────────────────

    describe('critical route coverage', () => {
        const criticalRoutes: Array<[string, string]> = [
            // Health & system
            ['GET', '/api/health'],
            ['GET', '/metrics'],
            ['GET', '/.well-known/agent-card.json'],
            // CRUD resources
            ['GET', '/api/projects'],
            ['POST', '/api/projects'],
            ['GET', '/api/agents'],
            ['POST', '/api/agents'],
            ['GET', '/api/sessions'],
            ['POST', '/api/sessions'],
            ['GET', '/api/councils'],
            ['POST', '/api/councils'],
            ['GET', '/api/work-tasks'],
            ['POST', '/api/work-tasks'],
            // Scheduling
            ['GET', '/api/schedules'],
            ['POST', '/api/schedules'],
            // Webhooks
            ['GET', '/api/webhooks'],
            ['POST', '/api/webhooks'],
            // AlgoChat
            ['GET', '/api/algochat/status'],
            ['POST', '/api/algochat/network'],
            // Access control
            ['GET', '/api/allowlist'],
            ['POST', '/api/allowlist'],
            ['GET', '/api/github-allowlist'],
            ['POST', '/api/github-allowlist'],
            ['GET', '/api/repo-blocklist'],
            ['POST', '/api/repo-blocklist'],
            // Wallets
            ['GET', '/api/wallets/summary'],
            ['POST', '/api/wallets/{address}/credits'],
        ];

        for (const [method, path] of criticalRoutes) {
            it(`includes ${method} ${path}`, () => {
                const route = routes.find((r) => r.method === method && r.path === path);
                expect(route).toBeDefined();
            });
        }
    });
});
