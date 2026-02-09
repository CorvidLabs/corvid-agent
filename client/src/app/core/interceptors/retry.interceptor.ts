import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { retry, timer } from 'rxjs';

/** Status codes that are worth retrying (transient server errors). */
const RETRYABLE_STATUS = new Set([0, 502, 503, 504]);

/** Maximum number of retries for GET/HEAD requests. */
const MAX_RETRIES = 2;

/** Base delay between retries (ms) — doubled on each attempt. */
const BASE_DELAY_MS = 1000;

/**
 * HTTP retry interceptor — automatically retries safe (idempotent) requests
 * on transient network/server errors with exponential backoff.
 *
 * Only retries GET and HEAD requests to avoid duplicating side-effects.
 * Runs before the error interceptor in the chain so failed retries still
 * surface as toast notifications.
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
    // Only retry safe/idempotent methods
    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return next(req);
    }

    return next(req).pipe(
        retry({
            count: MAX_RETRIES,
            delay: (error, retryCount) => {
                // Only retry on transient errors
                if (error instanceof HttpErrorResponse && RETRYABLE_STATUS.has(error.status)) {
                    return timer(BASE_DELAY_MS * Math.pow(2, retryCount - 1));
                }
                // Non-retryable — re-throw immediately
                throw error;
            },
        }),
    );
};
