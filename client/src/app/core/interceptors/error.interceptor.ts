import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

/**
 * HTTP error interceptor — catches non-2xx responses and surfaces them as toast notifications.
 * Runs after the auth interceptor in the interceptor chain.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    const notifications = inject(NotificationService);

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            const message = resolveMessage(error);
            const detail = resolveDetail(req.method, req.url, error);

            notifications.error(message, detail);

            return throwError(() => error);
        }),
    );
};

function resolveMessage(error: HttpErrorResponse): string {
    // Server returned a structured error body
    if (error.error?.message && typeof error.error.message === 'string') {
        return error.error.message;
    }
    if (error.error?.error && typeof error.error.error === 'string') {
        return error.error.error;
    }

    // Map common status codes to human-readable messages
    switch (error.status) {
        case 0:
            return 'Unable to reach the server';
        case 400:
            return 'Bad request';
        case 401:
            return 'Authentication required';
        case 403:
            return 'Access denied';
        case 404:
            return 'Resource not found';
        case 409:
            return 'Conflict — resource already exists';
        case 422:
            return 'Validation error';
        case 429:
            return 'Too many requests — please slow down';
        case 500:
            return 'Internal server error';
        case 502:
            return 'Server is temporarily unavailable';
        case 503:
            return 'Service unavailable';
        default:
            return `Request failed (${error.status})`;
    }
}

function resolveDetail(method: string, url: string, error: HttpErrorResponse): string {
    // Strip base URL for readability
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const parts = [`${method} ${path}`];

    if (error.status === 0) {
        parts.push('Check your connection or verify the server is running.');
    } else if (error.statusText && error.statusText !== 'Unknown Error') {
        parts.push(error.statusText);
    }

    return parts.join(' · ');
}
