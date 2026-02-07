/**
 * Authentication stubs for local-only deployment.
 *
 * CorvidAgent is designed to run locally on each user's own machine.
 * There is no multi-tenant server — every user runs their own instance
 * with their own AI provider credentials. Authentication is therefore
 * unnecessary and has been removed.
 *
 * These no-op stubs are kept so existing call-sites compile without changes.
 */

/** Always returns false — auth is disabled for local usage. */
export function isAuthEnabled(): boolean {
    return false;
}

/** Always returns null (allowed). */
export function checkAuth(_req: Request, _url: URL): Response | null {
    return null;
}

/** Always returns null (allowed). */
export function checkWsAuth(_req: Request, _url: URL): Response | null {
    return null;
}
