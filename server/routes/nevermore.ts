/**
 * Nevermore NFT bridge routes — verify NFT ownership and grant credits.
 *
 * Routes:
 *   POST /api/nevermore/verify   — Verify NFT holding and grant credits
 *   GET  /api/nevermore/status   — Check holder status for a wallet
 *   GET  /api/nevermore/holders  — List all holders (admin)
 *   POST /api/nevermore/audit    — Re-verify holders on-chain (admin)
 */
import type { Database } from 'bun:sqlite';
import type { NevermoreService } from '../nevermore/service';
import type { RequestContext } from '../middleware/guards';
import { json, badRequest, notFound, handleRouteError } from '../lib/response';

export function handleNevermoreRoutes(
    req: Request,
    url: URL,
    _db: Database,
    nevermore?: NevermoreService | null,
    context?: RequestContext,
): Response | Promise<Response> | null {
    if (!url.pathname.startsWith('/api/nevermore')) return null;

    if (!nevermore) {
        return json({ error: 'Nevermore service not available' }, 503);
    }

    const path = url.pathname;
    const method = req.method;

    // POST /api/nevermore/verify — Verify NFT holding and grant credits
    if (path === '/api/nevermore/verify' && method === 'POST') {
        return (async () => {
            try {
                const body = await req.json() as { walletAddress?: string };
                const walletAddress = body.walletAddress ?? context?.walletAddress;
                if (!walletAddress) {
                    return badRequest('walletAddress is required');
                }

                const holder = await nevermore.verify(walletAddress);
                if (!holder) {
                    return json({ error: 'Wallet does not hold the Nevermore NFT', verified: false }, 403);
                }

                return json({ verified: true, ...holder }, 200);
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    // GET /api/nevermore/status?walletAddress=... — Check holder status
    if (path === '/api/nevermore/status' && method === 'GET') {
        const walletAddress = url.searchParams.get('walletAddress') ?? context?.walletAddress;
        if (!walletAddress) {
            return badRequest('walletAddress query parameter is required');
        }

        const holder = nevermore.getHolder(walletAddress);
        if (!holder) {
            return notFound('No NFT holder record found for this wallet');
        }

        return json(holder);
    }

    // GET /api/nevermore/holders — List all holders
    if (path === '/api/nevermore/holders' && method === 'GET') {
        const status = url.searchParams.get('status') as 'active' | 'revoked' | undefined;
        const holders = nevermore.listHolders(status || undefined);
        return json({ holders, count: holders.length });
    }

    // POST /api/nevermore/audit — Re-verify all holders on-chain
    if (path === '/api/nevermore/audit' && method === 'POST') {
        return (async () => {
            try {
                const result = await nevermore.audit();
                return json(result);
            } catch (err) {
                return handleRouteError(err);
            }
        })();
    }

    return null;
}
