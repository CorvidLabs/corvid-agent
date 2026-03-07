/**
 * GitHub Token Scope Validation — startup check for GH_TOKEN scopes.
 *
 * Calls the GitHub API root endpoint and inspects the X-OAuth-Scopes header
 * to verify minimum required scopes. Logs warnings for missing scopes but
 * never blocks startup.
 */

import { createLogger } from './logger';

const log = createLogger('GitHubTokenCheck');

/** Minimum scopes required for full functionality. */
const REQUIRED_SCOPES: ReadonlyArray<{ scope: string; reason: string }> = [
    { scope: 'repo', reason: 'PR creation, push, issue management' },
    { scope: 'read:org', reason: 'organization-level queries' },
];

/**
 * Validate that GH_TOKEN has the minimum required OAuth scopes.
 * Non-blocking — logs warnings only.
 */
export async function validateGitHubTokenScopes(): Promise<void> {
    const token = process.env.GH_TOKEN;
    if (!token) {
        log.info('GH_TOKEN not set — GitHub features disabled');
        return;
    }

    try {
        const res = await fetch('https://api.github.com/', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'corvid-agent',
            },
        });

        if (!res.ok) {
            log.warn('GH_TOKEN validation failed — API returned non-OK status', {
                status: res.status,
            });
            return;
        }

        const scopeHeader = res.headers.get('x-oauth-scopes');
        if (scopeHeader === null) {
            // Fine-grained personal access tokens don't return X-OAuth-Scopes
            log.info('GH_TOKEN appears to be a fine-grained token (no X-OAuth-Scopes header) — scope validation skipped');
            return;
        }

        const grantedScopes = scopeHeader
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        const missing = REQUIRED_SCOPES.filter(({ scope }) => {
            // "repo" scope implies sub-scopes like "repo:status"
            // "admin:org" implies "read:org", "write:org"
            if (scope === 'read:org') {
                return !grantedScopes.includes('read:org') &&
                       !grantedScopes.includes('write:org') &&
                       !grantedScopes.includes('admin:org');
            }
            return !grantedScopes.includes(scope);
        });

        if (missing.length === 0) {
            log.info('GH_TOKEN scopes validated — all required scopes present');
        } else {
            const details = missing.map((m) => `${m.scope} (${m.reason})`).join(', ');
            log.warn(`GH_TOKEN is missing required scopes: ${details}`, {
                granted: grantedScopes.join(', '),
                missing: missing.map((m) => m.scope),
            });
            log.warn('Some GitHub features may fail at runtime. Re-create the token with the required scopes to resolve.');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('GH_TOKEN scope validation failed — could not reach GitHub API', { error: message });
    }
}
