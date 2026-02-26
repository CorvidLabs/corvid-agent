/**
 * OpenAPI 3.0 spec generator.
 *
 * Assembles a full OpenAPI 3.0.3 document from the route registry,
 * converting Zod schemas to JSON Schema via Zod v4's built-in `z.toJSONSchema()`.
 */

import { z } from 'zod';
import { routes, type HttpMethod } from './route-registry';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpenApiInfo {
    title: string;
    version: string;
    description?: string;
    license?: { name: string; url: string };
}

interface OpenApiServer {
    url: string;
    description?: string;
}

interface OpenApiTag {
    name: string;
    description?: string;
}

interface OpenApiSecurityScheme {
    type: string;
    scheme?: string;
    bearerFormat?: string;
    description?: string;
}

interface OpenApiParameter {
    name: string;
    in: string;
    required: boolean;
    schema: Record<string, unknown>;
    description?: string;
}

interface OpenApiRequestBody {
    required: boolean;
    content: Record<string, { schema: Record<string, unknown> }>;
}

interface OpenApiResponse {
    description: string;
    content?: Record<string, { schema: Record<string, unknown> }>;
}

interface OpenApiOperation {
    operationId: string;
    summary: string;
    description?: string;
    tags: string[];
    security?: Array<Record<string, string[]>>;
    parameters?: OpenApiParameter[];
    requestBody?: OpenApiRequestBody;
    responses: Record<string, OpenApiResponse>;
}

interface OpenApiPathItem {
    [method: string]: OpenApiOperation;
}

interface OpenApiSpec {
    openapi: string;
    info: OpenApiInfo;
    servers: OpenApiServer[];
    tags: OpenApiTag[];
    paths: Record<string, OpenApiPathItem>;
    components: {
        securitySchemes: Record<string, OpenApiSecurityScheme>;
    };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract {param} names from an OpenAPI path template. */
function extractPathParams(path: string): string[] {
    const matches = path.matchAll(/\{([^}]+)\}/g);
    return Array.from(matches, (m) => m[1]);
}

/** Convert a Zod schema to a JSON Schema object suitable for OpenAPI. */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    // Remove the top-level $schema key — OpenAPI embeds schemas inline
    delete jsonSchema['$schema'];
    return jsonSchema;
}

/** Generate a stable operationId from method + path. */
function makeOperationId(method: HttpMethod, path: string): string {
    // /api/agents/{id}/balance → agents_by_id_balance
    const cleaned = path
        .replace(/^\//, '')              // strip leading slash
        .replace(/\{[^}]+\}/g, 'by-id')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    return `${method.toLowerCase()}_${cleaned}`;
}

// ─── Tag descriptions ───────────────────────────────────────────────────────

const TAG_DESCRIPTIONS: Record<string, string> = {
    System: 'Health checks, metrics, audit logs, operational controls, and database management.',
    Projects: 'Manage projects (working directories and configurations for agent sessions).',
    Agents: 'Create, configure, and manage AI agents.',
    Sessions: 'Create and manage agent sessions (interactive coding/task sessions).',
    Councils: 'Multi-agent council discussions with chairman, members, and reviewers.',
    'Work Tasks': 'Autonomous work tasks (branch/PR workflows).',
    MCP: 'Model Context Protocol API for inter-agent communication and memory.',
    Allowlist: 'Manage the AlgoChat address allowlist.',
    Analytics: 'Usage analytics, spending, and session statistics.',
    Settings: 'Server-wide settings and credit configuration.',
    Schedules: 'Cron/interval-based automated agent actions.',
    Webhooks: 'GitHub webhook registrations and delivery tracking.',
    'Mention Polling': 'Local-first GitHub @mention detection without webhooks.',
    Workflows: 'Graph-based multi-step orchestration pipelines.',
    Sandbox: 'Container-based sandboxed execution for agent sessions.',
    Marketplace: 'Agent marketplace listings, reviews, and federation.',
    Reputation: 'Agent reputation scoring, events, and on-chain attestations.',
    Billing: 'Subscription management, usage metering, and invoices.',
    Auth: 'Device authorization flow for CLI login.',
    A2A: 'Agent-to-Agent Protocol (Google A2A) endpoints.',
    Plugins: 'Plugin loading, capability management.',
    Personas: 'Agent personality and voice configuration.',
    'Skill Bundles': 'Composable tool and prompt packages for agents.',
    'MCP Servers': 'External MCP server configuration management.',
    Exam: 'Live model evaluation exams.',
    Escalation: 'Permission escalation approval queue.',
    Feed: 'Unified message feed (agent messages + AlgoChat).',
    AlgoChat: 'Algorand-based on-chain messaging bridge.',
    Wallets: 'External wallet viewer for AlgoChat addresses.',
    Ollama: 'Local Ollama model management.',
    Integrations: 'Third-party integrations (Slack, Discord, Telegram).',
    Providers: 'LLM provider registry and model listing.',
};

// ─── Generator ──────────────────────────────────────────────────────────────

export interface GeneratorOptions {
    serverUrl?: string;
}

export function generateOpenApiSpec(options: GeneratorOptions = {}): OpenApiSpec {
    const { serverUrl = 'http://localhost:3000' } = options;

    // Collect unique tags from all routes
    const tagSet = new Set<string>();
    for (const route of routes) {
        for (const tag of route.tags) {
            tagSet.add(tag);
        }
    }

    const tags: OpenApiTag[] = Array.from(tagSet)
        .sort()
        .map((name) => ({
            name,
            ...(TAG_DESCRIPTIONS[name] ? { description: TAG_DESCRIPTIONS[name] } : {}),
        }));

    // Build paths
    const paths: Record<string, OpenApiPathItem> = {};

    for (const route of routes) {
        if (!paths[route.path]) {
            paths[route.path] = {};
        }

        const operation: OpenApiOperation = {
            operationId: makeOperationId(route.method, route.path),
            summary: route.summary,
            tags: route.tags,
            responses: {},
        };

        if (route.description) {
            operation.description = route.description;
        }

        // Security
        if (route.auth === 'required' || route.auth === 'admin') {
            operation.security = [{ BearerAuth: [] }];
        }

        // Path parameters
        const paramNames = extractPathParams(route.path);
        if (paramNames.length > 0) {
            operation.parameters = paramNames.map((name) => ({
                name,
                in: 'path',
                required: true,
                schema: { type: 'string' },
            }));
        }

        // Request body
        if (route.requestBody) {
            try {
                const schema = zodToJsonSchema(route.requestBody);
                operation.requestBody = {
                    required: true,
                    content: {
                        'application/json': { schema },
                    },
                };
            } catch {
                // If schema conversion fails, provide a generic body
                operation.requestBody = {
                    required: true,
                    content: {
                        'application/json': { schema: { type: 'object' } },
                    },
                };
            }
        }

        // Responses
        if (route.responses) {
            for (const [status, info] of Object.entries(route.responses)) {
                operation.responses[String(status)] = {
                    description: info.description,
                    content: {
                        'application/json': {
                            schema: { type: 'object' },
                        },
                    },
                };
            }
        }

        // Always add common responses
        if (!operation.responses['200'] && !operation.responses['201']) {
            operation.responses['200'] = {
                description: 'Successful response',
                content: {
                    'application/json': {
                        schema: { type: 'object' },
                    },
                },
            };
        }

        if (route.auth === 'required' || route.auth === 'admin') {
            operation.responses['401'] = { description: 'Authentication required' };
        }
        if (route.auth === 'admin') {
            operation.responses['403'] = { description: 'Admin access required' };
        }

        const methodKey = route.method.toLowerCase();
        paths[route.path][methodKey] = operation;
    }

    return {
        openapi: '3.0.3',
        info: {
            title: 'Corvid Agent API',
            version: '0.13.0',
            description: 'AI agent framework with on-chain identity and messaging via AlgoChat on Algorand. Provides multi-agent orchestration, GitHub automation, workflow pipelines, and an agent marketplace.',
            license: {
                name: 'MIT',
                url: 'https://github.com/CorvidLabs/corvid-agent/blob/main/LICENSE',
            },
        },
        servers: [
            {
                url: serverUrl,
                description: 'Local development server',
            },
        ],
        tags,
        paths,
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'API Key',
                    description: 'API key passed as a Bearer token. Not required when server is bound to localhost (127.0.0.1).',
                },
            },
        },
    };
}
