import { createLogger } from '../lib/logger';

const log = createLogger('JsonUtils');

/**
 * Safely parse a JSON string, returning a default value on failure.
 * Logs a structured warning on parse failure so corrupted DB rows
 * are visible in logs without crashing the server.
 */
export function safeJsonParse<T>(json: string, defaultValue: T, context?: string): T {
    try {
        return JSON.parse(json) as T;
    } catch (err) {
        log.warn('JSON parse failed, using default', {
            context: context ?? 'unknown',
            error: err instanceof Error ? err.message : String(err),
            inputPreview: json.length > 100 ? json.slice(0, 100) + '...' : json,
        });
        return defaultValue;
    }
}
