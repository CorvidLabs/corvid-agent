/**
 * Security headers applied to all HTTP responses.
 *
 * CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 * Permissions-Policy, and X-XSS-Protection.
 *
 * @see https://github.com/CorvidLabs/corvid-agent/issues/555
 */

/** Build a Content-Security-Policy header value. */
export function buildCsp(): string {
    return [
        "default-src 'self'",
        "connect-src 'self' ws: wss:",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://avatars.githubusercontent.com",
        "font-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
}

/** Permissions-Policy value disabling unused browser features. */
const PERMISSIONS_POLICY =
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()';

/**
 * Apply standard security headers to a `Headers` object.
 *
 * @param headers  Mutable `Headers` instance to modify in-place.
 * @param isLocal  When `true`, HSTS is omitted (suitable for localhost/dev).
 */
export function applySecurityHeaders(headers: Headers, isLocal: boolean): void {
    headers.set('Content-Security-Policy', buildCsp());
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '0');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', PERMISSIONS_POLICY);
    if (!isLocal) {
        headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
}
