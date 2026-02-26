/**
 * HTTP handlers for serving the OpenAPI spec and Swagger UI.
 *
 * - GET /api/openapi.json  — Raw OpenAPI 3.0 spec (always available)
 * - GET /api/docs           — Swagger UI (dev mode only)
 */

import { generateOpenApiSpec } from './generator';

/** Cached spec — regenerated once per server start. */
let cachedSpec: string | null = null;
let cachedSpecObj: Record<string, unknown> | null = null;

function getSpec(serverUrl: string): string {
    if (!cachedSpec) {
        cachedSpecObj = generateOpenApiSpec({ serverUrl }) as unknown as Record<string, unknown>;
        cachedSpec = JSON.stringify(cachedSpecObj, null, 2);
    }
    return cachedSpec;
}

/** Handle OpenAPI-related routes. Returns null if path doesn't match. */
export function handleOpenApiRoutes(req: Request, url: URL): Response | null {
    const path = url.pathname;
    const method = req.method;

    if (path === '/api/openapi.json' && method === 'GET') {
        const serverUrl = `${url.protocol}//${url.host}`;
        const spec = getSpec(serverUrl);
        return new Response(spec, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    if (path === '/api/docs' && method === 'GET') {
        const serverUrl = `${url.protocol}//${url.host}`;
        // Ensure spec is generated (side effect: caches it)
        getSpec(serverUrl);
        return new Response(swaggerUiHtml(serverUrl), {
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=300',
            },
        });
    }

    return null;
}

/** Generate a self-contained Swagger UI HTML page using CDN assets. */
function swaggerUiHtml(serverUrl: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Corvid Agent API — Swagger UI</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        html { box-sizing: border-box; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; }
        .swagger-ui .topbar { display: none; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        SwaggerUIBundle({
            url: '${serverUrl}/api/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.SwaggerUIStandalonePreset,
            ],
            layout: 'BaseLayout',
        });
    </script>
</body>
</html>`;
}
