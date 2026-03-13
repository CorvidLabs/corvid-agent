---
module: code-scanner
version: 1
status: draft
files:
  - server/lib/code-scanner.ts
db_tables: []
depends_on: []
---

# Code Scanner

## Purpose

Detects malicious code patterns in git diffs. Scans added lines for dangerous patterns like `eval()`, child_process imports, obfuscated code, crypto mining URLs, and reverse shells. Used by work task validation and CI security gates to block or warn about suspicious code before it is merged.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `scanDiff` | `(diff: string)` | `CodeScanResult` | Scans a unified diff for malicious code patterns. Only examines added lines (starting with `+`). Tracks current file via `+++ b/...` headers. Deduplicates findings by (category, pattern, file). |
| `formatScanReport` | `(result: CodeScanResult)` | `string` | Formats scan results into a human-readable report separating critical findings from warnings. Returns empty string if no findings. |

### Exported Types

| Type | Description |
|------|-------------|
| `FindingSeverity` | `'critical' \| 'warning'` — severity level of a scan finding. |
| `CodePatternCategory` | Union of category strings: `'dynamic_code_execution'`, `'process_control'`, `'child_process'`, `'obfuscation'`, `'data_exfiltration'`, `'crypto_mining'`, `'backdoor'`. |
| `CodeScanFinding` | `{ category, pattern, line, file, severity }` — a single detected malicious pattern. |
| `CodeScanResult` | `{ hasCriticalFindings, hasWarnings, findings }` — aggregate scan result. |
| `PatternRule` | `{ name, regex, category, severity, allowedFiles? }` — a pattern matching rule definition. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `ALL_PATTERNS` | `PatternRule[]` | Combined array of all critical and warning pattern rules used by the scanner. |

### Exported Classes

(none)

## Invariants

1. Only added lines in the diff are scanned — removed lines and context lines are ignored.
2. Critical findings block validation; warnings are informational only.
3. Matches inside single-line comments (`//`) are skipped.
4. Files in `EXCLUDED_FILES` (test fixtures, scanner source) are skipped entirely.
5. Warning patterns with `allowedFiles` are suppressed when the match is in an allowed file.
6. Findings are deduplicated by `(category, pattern name, file)` — at most one finding per pattern per file.
7. `formatScanReport` separates criticals and warnings into distinct sections.

## Behavioral Examples

### Scenario: eval() in added code

- **Given** a diff adding a line `const result = eval(userInput);`
- **When** `scanDiff` is called
- **Then** `hasCriticalFindings` is `true` with a finding of category `dynamic_code_execution`

### Scenario: process.exit() in allowed file

- **Given** a diff adding `process.exit(1)` in `server/index.ts`
- **When** `scanDiff` is called
- **Then** no warning is emitted because `server/index.ts` is in the `process.exit()` allowlist

### Scenario: Pattern in comment

- **Given** a diff adding `// eval() is dangerous, don't use it`
- **When** `scanDiff` is called
- **Then** no finding is reported because the match is inside a comment

### Scenario: Clean diff

- **Given** a diff with no malicious patterns
- **When** `formatScanReport` is called on the result
- **Then** it returns an empty string

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty diff string | Returns `{ hasCriticalFindings: false, hasWarnings: false, findings: [] }` |
| Diff with no `+++ b/` headers | `file` field in findings is `null` |
| Malformed diff lines | Lines not starting with `+` are skipped |

## Dependencies

### Consumes

(none — leaf module with no imports)

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/work/validation.ts` | `scanDiff`, `formatScanReport` for work task diff validation |
| `server/polling/auto-merge.ts` | `scanDiff` for PR diff security scanning before auto-merge |
| `server/routes/security-overview.ts` | `ALL_PATTERNS` for security dashboard pattern display |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec (#591) |
