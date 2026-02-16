import { toJSONSchema } from 'zod';
import type { RouteDefinition } from './route-registry';

// ─── OpenAPI Types (subset) ─────────────────────────────────────────────────

interface OpenApiSpec {
    openapi: string;
    info: { title: string; version: string; description: string };
    servers: Array<{ url: string; description: string }>;
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
    tags: Array<{ name: string; description?: string }>;
    security?: Array<Record<string, string[]>>;
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateOpenApiSpec(routes: RouteDefinition[], version: string): OpenApiSpec {
    const paths: Record<string, Record<string, unknown>> = {};
    const schemas: Record<string, unknown> = {};
    const tagSet = new Set<string>();

    for (const route of routes) {
        for (const tag of route.tags) tagSet.add(tag);

        const pathKey = route.path;
        if (!paths[pathKey]) paths[pathKey] = {};

        const operation: Record<string, unknown> = {
            summary: route.summary,
            tags: route.tags,
            operationId: buildOperationId(route),
        };

        if (route.description) {
            operation.description = route.description;
        }

        // Path parameters
        const params: unknown[] = [];
        if (route.pathParams) {
            for (const p of route.pathParams) {
                params.push({
                    name: p.name,
                    in: 'path',
                    required: true,
                    description: p.description,
                    schema: { type: 'string' },
                });
            }
        }

        // Query parameters
        if (route.queryParams) {
            for (const q of route.queryParams) {
                params.push({
                    name: q.name,
                    in: 'query',
                    required: q.required ?? false,
                    description: q.description,
                    schema: { type: q.type },
                });
            }
        }

        if (params.length > 0) operation.parameters = params;

        // Request body from Zod schema
        if (route.requestSchema) {
            const schemaName = buildSchemaName(route);
            const jsonSchema = toJSONSchema(route.requestSchema);
            // Remove $schema metadata key for cleaner embedding
            const { $schema: _, ...cleanSchema } = jsonSchema as Record<string, unknown>;
            schemas[schemaName] = cleanSchema;

            operation.requestBody = {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: `#/components/schemas/${schemaName}` },
                    },
                },
            };
        }

        // Responses
        operation.responses = {
            '200': {
                description: route.responseDescription ?? 'Success',
                content: { 'application/json': { schema: { type: 'object' } } },
            },
            ...(route.auth ? { '401': { description: 'Authentication required' }, '403': { description: 'Invalid API key' } } : {}),
            '400': { description: 'Validation error' },
            '404': { description: 'Resource not found' },
            '500': { description: 'Internal server error' },
        };

        // Auth
        if (route.auth) {
            operation.security = [{ bearerAuth: [] }];
        }

        paths[pathKey][route.method.toLowerCase()] = operation;
    }

    const tags = Array.from(tagSet).sort().map(name => ({ name }));

    return {
        openapi: '3.1.0',
        info: {
            title: 'corvid-agent API',
            version,
            description: 'Agent orchestration platform — manages Claude agent sessions with MCP tools, AlgoChat messaging, and on-chain wallet integration.',
        },
        servers: [
            { url: 'http://127.0.0.1:3578', description: 'Local development' },
        ],
        paths,
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'API key authentication. Set via API_KEY environment variable.',
                },
            },
            schemas,
        },
        tags,
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildOperationId(route: RouteDefinition): string {
    const method = route.method.toLowerCase();
    const segments = route.path
        .replace(/^\/api\//, '')
        .replace(/\{[^}]+\}/g, '')
        .replace(/[/.]/g, '_')
        .replace(/_+/g, '_')
        .replace(/_$/, '');
    return `${method}_${segments}`;
}

function buildSchemaName(route: RouteDefinition): string {
    const segments = route.path
        .replace(/^\/api\//, '')
        .replace(/\{[^}]+\}/g, '')
        .replace(/[/.-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/_$/, '');
    const method = route.method === 'POST' ? 'Create' : route.method === 'PUT' ? 'Update' : route.method;
    return `${method}${segments.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}Request`;
}
