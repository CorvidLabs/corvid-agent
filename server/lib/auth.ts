/**
 * Optional API key authentication.
 * When API_KEY env var is set, all /api/ routes (except /api/health) require
 * a Bearer token in the Authorization header.
 */

const API_KEY = process.env.API_KEY?.trim() || null;

/**
 * Check whether the request is authenticated.
 * Returns null if auth passes, or a 401 Response if it fails.
 */
export function checkAuth(req: Request, url: URL): Response | null {
    if (!API_KEY) return null; // No API key configured — allow all
    if (url.pathname === '/api/health') return null; // Health check is always public

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== API_KEY) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return null;
}
