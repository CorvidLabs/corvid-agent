/**
 * Detects external fetch/HTTP calls in code diffs.
 *
 * Used by work task validation to flag new outbound network calls
 * to domains not already approved in the codebase. Prevents agents
 * from introducing external API calls based on untrusted suggestions
 * (e.g. issue comments from non-collaborators).
 */

/**
 * Domains that are already used in the codebase and considered approved.
 * Only includes domains the server legitimately calls — agents working
 * in worktrees should not be adding calls to any of these either, but
 * they won't trigger a false positive if they appear in diffs.
 */
export const APPROVED_DOMAINS = new Set([
    // Core services (configured via env vars)
    'api.anthropic.com',
    'api.github.com',
    'github.com',
    'api.openai.com',
    'api.stripe.com',

    // Chat platform bridges
    'api.telegram.org',
    'slack.com',
    'graph.facebook.com',
    'discord.com',

    // Algorand indexers
    'testnet-idx.4160.nodely.dev',
    'mainnet-idx.4160.nodely.dev',

    // Local services
    'localhost',
    '127.0.0.1',
    '0.0.0.0',

    // CDN for swagger UI (already used in openapi handler)
    'unpkg.com',
]);

/** Result from scanning a diff for external fetch calls. */
export interface FetchScanResult {
    /** Whether unapproved external fetches were found. */
    hasUnapprovedFetches: boolean;
    /** Details of each detected fetch. */
    findings: FetchFinding[];
}

export interface FetchFinding {
    /** The URL or domain detected. */
    url: string;
    /** The domain extracted from the URL. */
    domain: string;
    /** The matching pattern (fetch, axios, http.get, etc). */
    pattern: string;
    /** The line containing the match. */
    line: string;
}

/**
 * Patterns that indicate outbound HTTP calls.
 * Each returns: [fullMatch, urlOrDomain]
 */
const FETCH_PATTERNS: Array<{ name: string; regex: RegExp }> = [
    // fetch('https://...') / fetch("https://...") / fetch(`https://...`)
    { name: 'fetch()', regex: /fetch\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // fetch(url) where url is a template literal
    { name: 'fetch()', regex: /fetch\s*\(\s*`(https?:\/\/[^`]+)`/gi },
    // axios.get/post/put/delete/patch('https://...')
    { name: 'axios', regex: /axios\s*\.\s*(?:get|post|put|delete|patch|head|options|request)\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // axios('https://...')
    { name: 'axios', regex: /axios\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // http.get / https.get / http.request / https.request
    { name: 'http.get/request', regex: /https?\s*\.\s*(?:get|request)\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // new URL('https://...') used as a fetch target
    { name: 'new URL()', regex: /new\s+URL\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // got('https://...') — another popular HTTP client
    { name: 'got()', regex: /\bgot\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // ky('https://...') or ky.get(...)
    { name: 'ky', regex: /\bky\s*(?:\.\s*(?:get|post|put|delete|patch))?\s*\(\s*['"`](https?:\/\/[^'"`\s)]+)/gi },
    // node-fetch or undici
    { name: 'import', regex: /(?:from|require)\s*\(\s*['"](?:node-fetch|undici|axios|got|ky|superagent|needle|request)['"]/gi },
];

/**
 * Extract the domain (hostname) from a URL string.
 * Returns null if the URL is malformed.
 */
export function extractDomain(url: string): string | null {
    try {
        // Handle template literal expressions: strip ${...} first
        const cleaned = url.replace(/\$\{[^}]*\}/g, 'PLACEHOLDER');
        const parsed = new URL(cleaned);
        return parsed.hostname;
    } catch {
        // Try regex fallback for partial URLs
        const match = url.match(/https?:\/\/([^/:?\s#]+)/);
        return match?.[1] ?? null;
    }
}

/**
 * Check if a domain is in the approved list.
 * Handles subdomains: if "slack.com" is approved, "api.slack.com" is also approved.
 */
export function isDomainApproved(domain: string): boolean {
    const lower = domain.toLowerCase();
    if (APPROVED_DOMAINS.has(lower)) return true;

    // Check if any approved domain is a suffix (subdomain matching)
    for (const approved of APPROVED_DOMAINS) {
        if (lower.endsWith(`.${approved}`)) return true;
    }

    return false;
}

/**
 * Scan a git diff (unified diff format) for new external fetch calls.
 * Only examines added lines (lines starting with '+').
 */
export function scanDiff(diff: string): FetchScanResult {
    const findings: FetchFinding[] = [];
    const seen = new Set<string>();

    // Extract only added lines from the diff
    const addedLines = diff
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1)); // Remove the leading '+'

    const fullText = addedLines.join('\n');

    for (const { name, regex } of FETCH_PATTERNS) {
        // Reset regex state
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(fullText)) !== null) {
            const url = match[1] ?? match[0];

            // For import patterns, flag them directly
            if (name === 'import') {
                const key = `import:${match[0]}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    findings.push({
                        url: match[0],
                        domain: 'npm-package',
                        pattern: name,
                        line: match[0],
                    });
                }
                continue;
            }

            const domain = extractDomain(url);
            if (!domain) continue;

            // Skip approved domains
            if (isDomainApproved(domain)) continue;

            const key = `${domain}:${name}`;
            if (seen.has(key)) continue;
            seen.add(key);

            findings.push({
                url,
                domain,
                pattern: name,
                line: match[0],
            });
        }
    }

    return {
        hasUnapprovedFetches: findings.length > 0,
        findings,
    };
}

/**
 * Format scan results into a human-readable report for validation output.
 */
export function formatScanReport(result: FetchScanResult): string {
    if (!result.hasUnapprovedFetches) return '';

    const lines = [
        '=== Security Scan Failed: Unapproved External Fetch Calls ===',
        '',
        'The following external network calls were detected in added code.',
        'Agents must not introduce fetch() calls to new domains without owner approval.',
        'See CLAUDE.md "Security Rules" section for details.',
        '',
    ];

    for (const finding of result.findings) {
        lines.push(`  - [${finding.pattern}] ${finding.domain}: ${finding.url}`);
    }

    lines.push('');
    lines.push('To fix: remove the external fetch calls, or request owner approval to add the domain.');

    return lines.join('\n');
}
