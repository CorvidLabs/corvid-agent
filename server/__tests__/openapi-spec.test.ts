/**
 * Tests for OpenAPI spec generation and route registry validation.
 *
 * Ensures the generated spec is structurally sound and the route registry
 * is complete, consistent, and free of duplicates.
 */

import { describe, it, expect } from 'bun:test';
import { generateOpenApiSpec } from '../openapi/generator';
import { routes } from '../openapi/route-registry';

const spec = generateOpenApiSpec({ serverUrl: 'http://localhost:3000' });

describe('OpenAPI spec structure', () => {
    it('uses OpenAPI 3.0.3', () => {
        expect(spec.openapi).toBe('3.0.3');
    });

    it('has info with title and version', () => {
        expect(spec.info.title).toBeTruthy();
        expect(spec.info.version).toBeTruthy();
    });

    it('defines at least one path', () => {
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });

    it('has BearerAuth security scheme', () => {
        expect(spec.components.securitySchemes.BearerAuth).toBeTruthy();
        expect(spec.components.securitySchemes.BearerAuth.type).toBe('http');
        expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
    });

    it('has tags list', () => {
        expect(spec.tags.length).toBeGreaterThan(0);
    });
});

describe('OpenAPI operations', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operations: Array<{ method: string; path: string; op: any }> = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
            operations.push({ method: method.toUpperCase(), path, op: operation });
        }
    }

    it('has unique operationIds', () => {
        const ids = operations.map((o) => o.op.operationId as string).filter(Boolean);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
    });

    it('every operation has an operationId', () => {
        for (const entry of operations) {
            expect(entry.op.operationId).toBeTruthy();
        }
    });

    it('every operation has a summary', () => {
        for (const entry of operations) {
            expect(entry.op.summary).toBeTruthy();
        }
    });

    it('every operation has tags', () => {
        for (const entry of operations) {
            expect(entry.op.tags?.length).toBeGreaterThan(0);
        }
    });

    it('every operation has responses', () => {
        for (const entry of operations) {
            expect(Object.keys(entry.op.responses).length).toBeGreaterThan(0);
        }
    });

    it('path parameters have matching parameter definitions', () => {
        for (const entry of operations) {
            const paramNames = Array.from(entry.path.matchAll(/\{([^}]+)\}/g), (m: RegExpMatchArray) => m[1]);
            if (paramNames.length === 0) continue;

            const params = entry.op.parameters as Array<{ name: string; in: string }> | undefined;
            expect(params).toBeTruthy();
            for (const name of paramNames) {
                const match = params!.find((p) => p.name === name && p.in === 'path');
                expect(match).toBeTruthy();
            }
        }
    });

    it('request bodies have schemas', () => {
        for (const entry of operations) {
            if (!entry.op.requestBody?.content) continue;
            const jsonContent = entry.op.requestBody.content['application/json'];
            expect(jsonContent?.schema).toBeTruthy();
        }
    });
});

describe('Route registry integrity', () => {
    it('has no duplicate entries', () => {
        const keys = routes.map((r) => `${r.method} ${r.path}`);
        const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(duplicates).toEqual([]);
    });

    it('all methods are valid HTTP methods', () => {
        const valid = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
        for (const route of routes) {
            expect(valid.has(route.method)).toBe(true);
        }
    });

    it('paths use {param} syntax not :param', () => {
        for (const route of routes) {
            expect(route.path).not.toContain('/:');
        }
    });

    it('paths start with /', () => {
        for (const route of routes) {
            expect(route.path.startsWith('/')).toBe(true);
        }
    });

    it('auth levels are valid', () => {
        const valid = new Set(['required', 'admin', 'none']);
        for (const route of routes) {
            expect(valid.has(route.auth)).toBe(true);
        }
    });

    it('every route has non-empty tags', () => {
        for (const route of routes) {
            expect(route.tags.length).toBeGreaterThan(0);
        }
    });

    it('every route has a summary', () => {
        for (const route of routes) {
            expect(route.summary.trim()).not.toBe('');
        }
    });
});

describe('Route registry and spec consistency', () => {
    it('spec contains every registry route', () => {
        for (const route of routes) {
            const pathItem = spec.paths[route.path];
            expect(pathItem).toBeTruthy();
            const methodKey = route.method.toLowerCase();
            expect(pathItem[methodKey]).toBeTruthy();
        }
    });

    it('all used tags appear in spec tag list', () => {
        const specTagNames = new Set(spec.tags.map((t) => t.name));
        for (const route of routes) {
            for (const tag of route.tags) {
                expect(specTagNames.has(tag)).toBe(true);
            }
        }
    });

    it('authenticated routes have security in spec', () => {
        for (const route of routes) {
            if (route.auth === 'none') continue;
            const pathItem = spec.paths[route.path];
            const op = pathItem[route.method.toLowerCase()] as { security?: Array<Record<string, string[]>> };
            expect(op.security).toBeTruthy();
            expect(op.security!.some((s) => 'BearerAuth' in s)).toBe(true);
        }
    });

    it('admin routes have 403 response in spec', () => {
        for (const route of routes) {
            if (route.auth !== 'admin') continue;
            const pathItem = spec.paths[route.path];
            const op = pathItem[route.method.toLowerCase()] as { responses: Record<string, unknown> };
            expect(op.responses['403']).toBeTruthy();
        }
    });
});

describe('Route registry coverage', () => {
    it('registers at least 150 routes', () => {
        // Sanity check that we haven't accidentally deleted routes
        expect(routes.length).toBeGreaterThanOrEqual(150);
    });

    it('covers all major API categories', () => {
        const allTags = new Set(routes.flatMap((r) => r.tags));
        const requiredTags = [
            'System', 'Projects', 'Agents', 'Sessions', 'Councils',
            'Work Tasks', 'MCP', 'Allowlist', 'Analytics', 'Settings',
            'Schedules', 'Webhooks', 'Mention Polling', 'Workflows',
            'Sandbox', 'Marketplace', 'Reputation', 'Billing', 'Auth',
            'A2A', 'Plugins', 'Skill Bundles', 'MCP Servers', 'Exam',
            'Escalation', 'Feed', 'AlgoChat', 'Wallets',
        ];
        for (const tag of requiredTags) {
            expect(allTags.has(tag)).toBe(true);
        }
    });

    it('has health probe endpoints', () => {
        const paths = routes.map((r) => `${r.method} ${r.path}`);
        expect(paths).toContain('GET /health/live');
        expect(paths).toContain('GET /health/ready');
    });

    it('has tenant management endpoints', () => {
        const paths = routes.map((r) => `${r.method} ${r.path}`);
        expect(paths).toContain('POST /api/tenants/register');
        expect(paths).toContain('GET /api/tenants/me');
    });

    it('has dashboard and performance endpoints', () => {
        const paths = routes.map((r) => `${r.method} ${r.path}`);
        expect(paths).toContain('GET /api/dashboard/summary');
        expect(paths).toContain('GET /api/performance/snapshot');
    });
});
