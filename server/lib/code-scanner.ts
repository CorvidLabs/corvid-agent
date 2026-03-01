/**
 * Detects malicious code patterns in diffs.
 *
 * Scans added lines for dangerous patterns like eval(), child_process imports,
 * obfuscated code, crypto mining URLs, and reverse shells. Used by work task
 * validation and CI security gates.
 *
 * Mirrors the scanDiff/formatScanReport interface from fetch-detector.ts.
 */

export type FindingSeverity = 'critical' | 'warning';

export type CodePatternCategory =
    | 'dynamic_code_execution'
    | 'process_control'
    | 'child_process'
    | 'obfuscation'
    | 'data_exfiltration'
    | 'crypto_mining'
    | 'backdoor';

export interface CodeScanFinding {
    category: CodePatternCategory;
    /** Human-readable name of the matched pattern. */
    pattern: string;
    /** The matched line content. */
    line: string;
    /** File from diff header, or null if unknown. */
    file: string | null;
    severity: FindingSeverity;
}

export interface CodeScanResult {
    hasCriticalFindings: boolean;
    hasWarnings: boolean;
    findings: CodeScanFinding[];
}

interface PatternRule {
    name: string;
    regex: RegExp;
    category: CodePatternCategory;
    severity: FindingSeverity;
    /** Files where this pattern is allowed (warning patterns only). */
    allowedFiles?: string[];
}

/**
 * Critical patterns — these block validation / CI.
 */
const CRITICAL_PATTERNS: PatternRule[] = [
    {
        name: 'eval()',
        regex: /\beval\s*\(/,
        category: 'dynamic_code_execution',
        severity: 'critical',
    },
    {
        name: 'new Function()',
        regex: /new\s+Function\s*\(/,
        category: 'dynamic_code_execution',
        severity: 'critical',
    },
    {
        name: 'setTimeout/setInterval with string arg',
        regex: /\b(?:setTimeout|setInterval)\s*\(\s*['"`]/,
        category: 'dynamic_code_execution',
        severity: 'critical',
    },
    {
        name: "require('child_process')",
        regex: /require\s*\(\s*['"]child_process['"]\)/,
        category: 'child_process',
        severity: 'critical',
    },
    {
        name: "import 'child_process'",
        regex: /from\s+['"]child_process['"]/,
        category: 'child_process',
        severity: 'critical',
    },
    {
        name: 'process.kill()',
        regex: /process\s*\.\s*kill\s*\(/,
        category: 'process_control',
        severity: 'critical',
    },
    {
        name: 'reverse shell (nc -e)',
        regex: /\b(?:nc|ncat|netcat)\s+.*-e\s/,
        category: 'backdoor',
        severity: 'critical',
    },
    {
        name: 'hex-encoded eval',
        regex: /eval\s*\(\s*['"]\\x[0-9a-fA-F]{2}/,
        category: 'obfuscation',
        severity: 'critical',
    },
    {
        name: 'base64 decode + execute',
        regex: /(?:atob|Buffer\.from)\s*\([^)]+\).*(?:eval|Function|import)/,
        category: 'obfuscation',
        severity: 'critical',
    },
    {
        name: 'stratum mining URL',
        regex: /stratum\+tcp:\/\//,
        category: 'crypto_mining',
        severity: 'critical',
    },
    {
        name: 'mining pool WebSocket',
        regex: /wss?:\/\/[^'"]*(?:pool|mine|stratum)/i,
        category: 'crypto_mining',
        severity: 'critical',
    },
];

/**
 * Warning patterns — non-blocking, with optional file allowlists.
 */
const WARNING_PATTERNS: PatternRule[] = [
    {
        name: 'process.exit()',
        regex: /process\s*\.\s*exit\s*\(/,
        category: 'process_control',
        severity: 'warning',
        allowedFiles: [
            'server/index.ts',
            'server/middleware/auth.ts',
            'server/algochat/config.ts',
            'server/polling/service.ts',
            'cli/',
            'scripts/',
            'server/db/migrate',
        ],
    },
    {
        name: 'excessive hex escapes',
        regex: /(?:\\x[0-9a-fA-F]{2}){8,}/,
        category: 'obfuscation',
        severity: 'warning',
    },
    {
        name: 'excessive unicode escapes',
        regex: /(?:\\u[0-9a-fA-F]{4}){6,}/,
        category: 'obfuscation',
        severity: 'warning',
    },
    {
        name: 'server binding in non-server file',
        regex: /(?:Bun\.serve|createServer|\.listen\s*\()\s*\(/,
        category: 'backdoor',
        severity: 'warning',
        allowedFiles: ['server/index.ts'],
    },
];

const ALL_PATTERNS: PatternRule[] = [...CRITICAL_PATTERNS, ...WARNING_PATTERNS];

/**
 * Check whether the match is inside a single-line comment.
 * Returns true if `//` appears before `matchIndex` on the same line content.
 */
function isInComment(lineContent: string, matchIndex: number): boolean {
    const commentPos = lineContent.indexOf('//');
    return commentPos !== -1 && commentPos < matchIndex;
}

/**
 * Check whether a file is in the allowlist for a given rule.
 */
function isAllowed(rule: PatternRule, file: string | null): boolean {
    if (!rule.allowedFiles || !file) return false;
    return rule.allowedFiles.some(
        (allowed) => file === allowed || file.startsWith(allowed),
    );
}

/**
 * Scan a git diff (unified diff format) for malicious code patterns.
 * Only examines added lines (lines starting with '+').
 * Tracks current file via `+++ b/...` headers.
 */
export function scanDiff(diff: string): CodeScanResult {
    const findings: CodeScanFinding[] = [];
    const seen = new Set<string>();

    let currentFile: string | null = null;

    for (const rawLine of diff.split('\n')) {
        // Track current file from diff headers
        if (rawLine.startsWith('+++ b/')) {
            currentFile = rawLine.slice(6);
            continue;
        }

        // Only scan added lines
        if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) continue;

        const lineContent = rawLine.slice(1); // Remove leading '+'

        for (const rule of ALL_PATTERNS) {
            const match = rule.regex.exec(lineContent);
            if (!match) continue;

            // Skip matches inside comments
            if (isInComment(lineContent, match.index)) continue;

            // Skip allowed files (warning patterns with allowlists)
            if (isAllowed(rule, currentFile)) continue;

            // Deduplicate by (category, pattern name, file)
            const dedupeKey = `${rule.category}:${rule.name}:${currentFile ?? ''}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            findings.push({
                category: rule.category,
                pattern: rule.name,
                line: lineContent.trim(),
                file: currentFile,
                severity: rule.severity,
            });
        }
    }

    return {
        hasCriticalFindings: findings.some((f) => f.severity === 'critical'),
        hasWarnings: findings.some((f) => f.severity === 'warning'),
        findings,
    };
}

/**
 * Format scan results into a human-readable report.
 * Separates critical findings from warnings.
 */
export function formatScanReport(result: CodeScanResult): string {
    if (result.findings.length === 0) return '';

    const lines: string[] = [];
    const criticals = result.findings.filter((f) => f.severity === 'critical');
    const warnings = result.findings.filter((f) => f.severity === 'warning');

    if (criticals.length > 0) {
        lines.push('=== Code Scanner: Critical Findings (blocking) ===');
        lines.push('');
        for (const f of criticals) {
            const loc = f.file ? ` in ${f.file}` : '';
            lines.push(`  - [${f.category}] ${f.pattern}${loc}`);
            lines.push(`    ${f.line}`);
        }
        lines.push('');
    }

    if (warnings.length > 0) {
        lines.push('=== Code Scanner: Warnings (non-blocking) ===');
        lines.push('');
        for (const f of warnings) {
            const loc = f.file ? ` in ${f.file}` : '';
            lines.push(`  - [${f.category}] ${f.pattern}${loc}`);
            lines.push(`    ${f.line}`);
        }
        lines.push('');
    }

    if (criticals.length > 0) {
        lines.push(
            'To fix: remove the flagged patterns, or refactor to use safe alternatives.',
        );
    }

    return lines.join('\n');
}
