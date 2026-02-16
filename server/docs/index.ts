import { buildRouteRegistry } from './route-registry';
import { generateOpenApiSpec } from './openapi-generator';
import { getMcpToolDocs } from './mcp-tool-docs';

// ─── Cached spec ────────────────────────────────────────────────────────────

let cachedSpec: Record<string, unknown> | null = null;

/**
 * Build and cache the complete OpenAPI spec.
 * Includes REST API routes and MCP tool documentation.
 */
export function buildOpenApiSpec(version: string): Record<string, unknown> {
    if (cachedSpec) return cachedSpec;

    const routes = buildRouteRegistry();
    const spec = generateOpenApiSpec(routes, version) as unknown as Record<string, unknown>;

    // Attach MCP tool documentation as a custom extension
    const mcpTools = getMcpToolDocs();
    (spec as Record<string, unknown>)['x-mcp-tools'] = mcpTools;

    cachedSpec = spec;
    return spec;
}

/**
 * Returns minimal HTML that loads Swagger UI from CDN.
 */
export function getSwaggerUiHtml(specUrl: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>corvid-agent API Docs</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({ url: '${specUrl}', dom_id: '#swagger-ui', deepLinking: true, presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset], layout: 'BaseLayout' });
    </script>
</body>
</html>`;
}
