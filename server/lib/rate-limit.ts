/**
 * Simple sliding-window rate limiter keyed by IP address.
 * Configurable limits per method category.
 */

const WINDOW_MS = 60_000; // 1 minute

const GET_LIMIT = parseInt(process.env.RATE_LIMIT_GET ?? '120', 10);
const MUTATION_LIMIT = parseInt(process.env.RATE_LIMIT_MUTATION ?? '30', 10);

interface WindowEntry {
    timestamps: number[];
}

const windows: Map<string, WindowEntry> = new Map();

// Periodic cleanup of stale entries (every 5 minutes)
setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, entry] of windows) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
        if (entry.timestamps.length === 0) windows.delete(key);
    }
}, 5 * 60_000);

function getClientIp(req: Request): string {
    return (
        req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
        req.headers.get('X-Real-IP') ??
        'unknown'
    );
}

/**
 * Check rate limit for the given request.
 * Returns null if allowed, or a 429 Response if rate-limited.
 */
export function checkRateLimit(req: Request): Response | null {
    const ip = getClientIp(req);
    const isGet = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    const limit = isGet ? GET_LIMIT : MUTATION_LIMIT;
    const key = `${ip}:${isGet ? 'read' : 'write'}`;

    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    let entry = windows.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        windows.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= limit) {
        const retryAfter = Math.ceil((entry.timestamps[0] + WINDOW_MS - now) / 1000);
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(retryAfter),
            },
        });
    }

    entry.timestamps.push(now);
    return null;
}
