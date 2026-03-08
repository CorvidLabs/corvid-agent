/**
 * GitHub Token OAuth Scope Validation
 *
 * Checks GH_TOKEN at startup and warns if required scopes (repo, read:org)
 * are missing. Never blocks startup — informational only.
 */

import { createLogger } from './logger';

const log = createLogger('GitHubTokenCheck');

const REQUIRED_SCOPES = ['repo', 'read:org'];

export interface GitHubTokenCheckResult {
    configured: boolean;
    valid: boolean;
    scopes: string[];
    missingScopes: string[];
    fineGrained: boolean;
    error?: string;
}

/**
 * Validate GH_TOKEN OAuth scopes by calling the GitHub API root endpoint.
 * Returns scope information without blocking or throwing.
 */
export async function checkGitHubToken(
    token?: string,
    fetchFn: (url: string, init?: RequestInit) => Promise<Response> = globalThis.fetch,
): Promise<GitHubTokenCheckResult> {
    const ghToken = token ?? process.env.GH_TOKEN;

    if (!ghToken) {
        return {
            configured: false,
            valid: false,
            scopes: [],
            missingScopes: REQUIRED_SCOPES,
            fineGrained: false,
            error: 'GH_TOKEN not set',
        };
    }

    try {
        const resp = await fetchFn('https://api.github.com/', {
            headers: {
                Authorization: `token ${ghToken}`,
                Accept: 'application/json',
                'User-Agent': 'CorvidAgent-StartupCheck',
            },
        });

        if (!resp.ok) {
            return {
                configured: true,
                valid: false,
                scopes: [],
                missingScopes: REQUIRED_SCOPES,
                fineGrained: false,
                error: `GitHub API returned HTTP ${resp.status}`,
            };
        }

        const scopeHeader = resp.headers.get('x-oauth-scopes');

        // Fine-grained personal access tokens do not return the X-OAuth-Scopes header
        if (scopeHeader === null || scopeHeader === undefined) {
            return {
                configured: true,
                valid: true,
                scopes: [],
                missingScopes: [],
                fineGrained: true,
            };
        }

        const scopes = scopeHeader
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        const missingScopes = REQUIRED_SCOPES.filter((req) => !scopes.includes(req));

        return {
            configured: true,
            valid: true,
            scopes,
            missingScopes,
            fineGrained: false,
        };
    } catch (err) {
        return {
            configured: true,
            valid: false,
            scopes: [],
            missingScopes: REQUIRED_SCOPES,
            fineGrained: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Run the GitHub token check and log results.
 * Safe to call during startup — never throws or blocks.
 */
export async function validateGitHubTokenOnStartup(
    fetchFn?: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<void> {
    try {
        const result = await checkGitHubToken(undefined, fetchFn);

        if (!result.configured) {
            log.warn('GH_TOKEN is not set — GitHub features (PRs, issues, stars) will be unavailable');
            return;
        }

        if (!result.valid) {
            log.warn('GH_TOKEN validation failed — GitHub features may not work', {
                error: result.error,
            });
            return;
        }

        if (result.fineGrained) {
            log.info(
                'GH_TOKEN is a fine-grained token — scope validation skipped (scopes are managed via token permissions)',
            );
            return;
        }

        if (result.missingScopes.length > 0) {
            log.warn(
                `GH_TOKEN is missing required OAuth scopes: ${result.missingScopes.join(', ')}`,
                { currentScopes: result.scopes, missingScopes: result.missingScopes },
            );
            log.warn(
                'Some GitHub features may fail. Regenerate your token with "repo" and "read:org" scopes.',
            );
            return;
        }

        log.info('GH_TOKEN validated — all required scopes present', {
            scopes: result.scopes,
        });
    } catch {
        // Absolute safety net — never let this crash startup
        log.warn('GH_TOKEN validation encountered an unexpected error — skipping');
    }
}
