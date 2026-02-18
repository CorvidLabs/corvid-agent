import { describe, it, expect } from 'bun:test';
import { handleOllamaRoutes } from '../routes/ollama';

/**
 * Ollama routes rely on LlmProviderRegistry singleton to find the OllamaProvider.
 * Without a registered ollama provider, most endpoints return 503.
 * We test that behavior and the library search endpoint (which is static).
 */

function fakeReq(method: string, path: string, body?: unknown): { req: Request; url: URL } {
    const url = new URL(`http://localhost:3000${path}`);
    const opts: RequestInit = { method };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers = { 'Content-Type': 'application/json' };
    }
    return { req: new Request(url.toString(), opts), url };
}

describe('Ollama Routes', () => {
    it('GET /api/ollama/status returns 503 when provider not registered', async () => {
        const { req, url } = fakeReq('GET', '/api/ollama/status');
        const res = await handleOllamaRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
        const data = await res!.json();
        expect(data.available).toBe(false);
        expect(data.error).toContain('not registered');
    });

    it('GET /api/ollama/models returns 503 when provider not registered', async () => {
        const { req, url } = fakeReq('GET', '/api/ollama/models');
        const res = await handleOllamaRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    it('GET /api/ollama/models/running returns 503 when provider not registered', async () => {
        const { req, url } = fakeReq('GET', '/api/ollama/models/running');
        const res = await handleOllamaRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(503);
    });

    it('GET /api/ollama/library returns curated model list', async () => {
        const { req, url } = fakeReq('GET', '/api/ollama/library');
        const res = await handleOllamaRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        expect(Array.isArray(data.models)).toBe(true);
        expect(data.models.length).toBeGreaterThan(0);
        expect(data.categories).toBeDefined();
        expect(data.total).toBeGreaterThan(0);

        // Check model shape
        const model = data.models[0];
        expect(model.name).toBeDefined();
        expect(model.description).toBeDefined();
        expect(model.category).toBeDefined();
        expect(model.pullCommand).toBeDefined();
    });

    it('GET /api/ollama/library?category=coding filters by category', async () => {
        const { req, url } = fakeReq('GET', '/api/ollama/library?category=coding');
        const res = await handleOllamaRoutes(req, url);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(200);
        const data = await res!.json();
        for (const model of data.models) {
            expect(model.category).toBe('coding');
        }
    });

    it('GET /api/ollama/library?q=qwen filters by search query', async () => {
        const { req, url } = fakeReq('GET', '/api/ollama/library?q=qwen');
        const res = await handleOllamaRoutes(req, url);
        const data = await res!.json();
        expect(data.models.length).toBeGreaterThan(0);
        for (const model of data.models) {
            const nameOrDesc = (model.name + model.description).toLowerCase();
            expect(nameOrDesc).toContain('qwen');
        }
    });

    it('returns null for unmatched paths', async () => {
        const { req, url } = fakeReq('GET', '/api/other');
        const res = handleOllamaRoutes(req, url);
        expect(res).toBeNull();
    });
});
