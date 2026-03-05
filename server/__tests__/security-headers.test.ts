import { describe, it, expect } from 'bun:test';
import { applySecurityHeaders, buildCsp } from '../lib/security-headers';

describe('security-headers', () => {
    describe('buildCsp', () => {
        it('returns a valid CSP string', () => {
            const csp = buildCsp();
            expect(csp).toContain("default-src 'self'");
            expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
            expect(csp).toContain("style-src 'self' 'unsafe-inline'");
            expect(csp).toContain("connect-src 'self' ws: wss:");
            expect(csp).toContain("img-src 'self' data:");
            expect(csp).toContain("font-src 'self'");
            expect(csp).toContain("frame-ancestors 'none'");
            expect(csp).toContain("base-uri 'self'");
            expect(csp).toContain("form-action 'self'");
        });

        it('separates directives with semicolons', () => {
            const csp = buildCsp();
            const directives = csp.split('; ');
            expect(directives.length).toBeGreaterThanOrEqual(7);
        });
    });

    describe('applySecurityHeaders', () => {
        it('sets all required security headers', () => {
            const headers = new Headers();
            applySecurityHeaders(headers, false);

            expect(headers.get('Content-Security-Policy')).toBeTruthy();
            expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
            expect(headers.get('X-Frame-Options')).toBe('DENY');
            expect(headers.get('X-XSS-Protection')).toBe('0');
            expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
            expect(headers.get('Permissions-Policy')).toContain('camera=()');
            expect(headers.get('Permissions-Policy')).toContain('microphone=()');
            expect(headers.get('Permissions-Policy')).toContain('geolocation=()');
        });

        it('sets HSTS when isLocal is false', () => {
            const headers = new Headers();
            applySecurityHeaders(headers, false);
            expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
        });

        it('omits HSTS when isLocal is true', () => {
            const headers = new Headers();
            applySecurityHeaders(headers, true);
            expect(headers.get('Strict-Transport-Security')).toBeNull();
        });

        it('does not inject newlines into header values', () => {
            const headers = new Headers();
            applySecurityHeaders(headers, false);

            for (const [, value] of headers.entries()) {
                expect(value).not.toContain('\n');
                expect(value).not.toContain('\r');
            }
        });
    });
});
