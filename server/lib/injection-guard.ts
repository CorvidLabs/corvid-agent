/**
 * Route-level injection guard — scans parsed request bodies for injection patterns.
 *
 * Provides a `checkInjection()` helper that route handlers call after parsing
 * the request body. Returns a 403 Response if the content is blocked, or null
 * if it passes.
 *
 * Integration pattern:
 * ```ts
 * const data = await parseBodyOrThrow(req, SomeSchema);
 * const denied = checkInjection(db, data.content, 'api', req);
 * if (denied) return denied;
 * ```
 *
 * @module
 */

import type { Database } from 'bun:sqlite';
import { recordAudit } from '../db/audit';
import { getClientIp } from '../middleware/rate-limit';
import { createLogger } from './logger';
import { scanForInjection } from './prompt-injection';

const log = createLogger('InjectionGuard');

/**
 * Scan a text field from a parsed request body for prompt injection.
 *
 * If the message is blocked, logs a warning, records an audit entry,
 * and returns a 403 Response. Otherwise returns null (pass-through).
 *
 * @param db      Database handle for audit logging
 * @param content The text content to scan
 * @param channel Channel identifier for audit (e.g. 'a2a', 'api_invoke', 'slack')
 * @param req     The original request (for client IP extraction)
 * @returns A 403 Response if blocked, or null if clean
 */
export function checkInjection(db: Database, content: string, channel: string, req: Request): Response | null {
  const result = scanForInjection(content);
  if (!result.blocked) return null;

  const clientIp = getClientIp(req);
  log.warn('Blocked API request: prompt injection detected', {
    channel,
    clientIp,
    confidence: result.confidence,
    patterns: result.matches.map((m) => m.pattern),
    scanTimeMs: result.scanTimeMs,
    contentPreview: content.slice(0, 100),
  });

  recordAudit(
    db,
    'injection_blocked',
    clientIp,
    'api_request',
    null,
    JSON.stringify({
      channel,
      confidence: result.confidence,
      patterns: result.matches.map((m) => m.pattern),
      contentPreview: content.slice(0, 200),
    }),
  );

  return new Response(
    JSON.stringify({
      error: 'Content policy violation',
      code: 'INJECTION_BLOCKED',
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}
