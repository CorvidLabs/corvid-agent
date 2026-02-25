import { describe, it, expect } from 'bun:test';
import { handleOpenApiRoutes } from '../handler';

describe('OpenAPI Handler', () => {
    function makeReq(path: string, method = 'GET'): [Request, URL] {
        const url = new URL(`http://localhost:3000${path}`);
        const req = new Request(url.toString(), { method });
        return [req, url];
    }

    it('serves /api/openapi.json', () => {
        const [req, url] = makeReq('/api/openapi.json');
        const res = handleOpenApiRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        expect(res!.headers.get('Content-Type')).toBe('application/json');
    });

    it('returns valid JSON for /api/openapi.json', async () => {
        const [req, url] = makeReq('/api/openapi.json');
        const res = handleOpenApiRoutes(req, url);
        const body = await res!.json();
        expect(body.openapi).toBe('3.0.3');
        expect(body.paths).toBeDefined();
    });

    it('serves /api/docs as HTML', async () => {
        const [req, url] = makeReq('/api/docs');
        const res = handleOpenApiRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        expect(res!.headers.get('Content-Type')).toBe('text/html');
        const html = await res!.text();
        expect(html).toContain('swagger-ui');
        expect(html).toContain('Corvid Agent API');
    });

    it('returns null for unrelated paths', () => {
        const [req, url] = makeReq('/api/agents');
        const res = handleOpenApiRoutes(req, url);
        expect(res).toBeNull();
    });

    it('returns null for POST /api/openapi.json', () => {
        const [req, url] = makeReq('/api/openapi.json', 'POST');
        const res = handleOpenApiRoutes(req, url);
        expect(res).toBeNull();
    });
});
