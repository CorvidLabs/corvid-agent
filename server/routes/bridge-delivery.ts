/**
 * Bridge delivery metrics route.
 *
 *   GET /api/bridges/delivery — Delivery receipt metrics for all bridge platforms.
 */

import { getDeliveryTracker } from '../lib/delivery-tracker';
import { json } from '../lib/response';

export function handleBridgeDeliveryRoutes(req: Request, url: URL): Response | null {
  if (req.method !== 'GET') return null;
  if (url.pathname !== '/api/bridges/delivery') return null;

  const tracker = getDeliveryTracker();
  return json(tracker.getAllMetrics());
}
