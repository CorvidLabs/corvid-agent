/**
 * Bridge delivery metrics route.
 *
 *   GET /api/bridges/delivery — Delivery receipt metrics for all bridge platforms.
 */

import { json } from '../lib/response';
import { getDeliveryTracker } from '../lib/delivery-tracker';

export function handleBridgeDeliveryRoutes(
    req: Request,
    url: URL,
): Response | null {
    if (req.method !== 'GET') return null;
    if (url.pathname !== '/api/bridges/delivery') return null;

    const tracker = getDeliveryTracker();
    return json(tracker.getAllMetrics());
}
