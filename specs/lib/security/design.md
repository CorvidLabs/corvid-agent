---
spec: code-scanner.spec.md
sources:
  - server/lib/bash-security.ts
  - server/lib/code-scanner.ts
  - server/lib/fetch-detector.ts
  - server/lib/prompt-injection.ts
  - server/lib/ssrf-guard.ts
  - server/lib/agent-input-sanitizer.ts
  - server/lib/injection-guard.ts
  - server/lib/security-headers.ts
---

## Layout

Layered defense system spread across 8 files under `server/lib/`. Each file provides an independent security capability; they are composed at call sites (not internally coupled):
- `bash-security.ts` — bash command tokenization and dangerous-pattern detection
- `code-scanner.ts` — malicious code pattern detection in git diffs
- `fetch-detector.ts` — external HTTP call detection in git diffs
- `prompt-injection.ts` — injection/social-engineering detection in text
- `ssrf-guard.ts` — SSRF protection via IP validation and DNS resolution
- `agent-input-sanitizer.ts` — content neutralization (transform, not block) for local agents
- `injection-guard.ts` — route-level injection check with audit logging
- `security-headers.ts` — HTTP security headers (CSP, HSTS, etc.)

## Components

### bash-security.ts
Quote-aware tokenizer → path extractor → dangerous-pattern detector. Patterns detected: `$()` substitution, `${...}` expansion, heredocs, `eval`, `exec`, `bash -c`, `env` wrappers, `find -delete/-exec`. Exported as `analyzeBashCommand` (full) or `detectDangerousPatterns` (patterns only).

### code-scanner.ts
Unified diff scanner; processes only added lines (`+`). Seven categories of critical patterns (dynamic execution, child_process, process_control, obfuscation, data_exfiltration, crypto_mining, backdoor) plus warning patterns. Deduplicates by `(category, pattern, file)`. Skips `server/__tests__/` and the scanner file itself. Skips `//` single-line comments.

### fetch-detector.ts
Diff scanner for external fetch/HTTP calls in added lines. Approves known domains (GitHub, Anthropic, OpenAI, Stripe, Telegram, Slack, Discord, Algorand indexers, localhost) including subdomain matching. Reports unapproved domains.

### prompt-injection.ts
Six detection categories: `role_impersonation`, `command_injection`, `data_exfiltration`, `jailbreak`, `encoding_attack`, `social_engineering`. Confidence escalation: ≥ 3 MEDIUM matches → HIGH; ≥ 2 HIGH matches → CRITICAL. Blocks at HIGH or CRITICAL. Stateless; < 10ms for typical messages. Messages shorter than 4 chars are never flagged.

### ssrf-guard.ts
Two-phase protection:
1. `validateUrl` — synchronous; blocks private hostnames, private IPv4/IPv6 ranges, decimal/hex-encoded IPs, `.local` domains, non-http/https schemes
2. `validateUrlTarget` — async DNS resolution; checks all resolved IPs against private ranges; DNS failure is non-blocking

### agent-input-sanitizer.ts
`sanitizeAgentInput` — transforms (never blocks) injection patterns into `[injection-filtered]` placeholders. Strips Unicode bidirectional overrides and zero-width characters. Resets regex `lastIndex` before each replacement. `wrapExternalContent` adds boundary markers around external data.

### injection-guard.ts
Route-level middleware helper. Calls `scanForInjection`; returns 403 `INJECTION_BLOCKED` response on HIGH/CRITICAL; records audit entry via `recordAudit`; returns `null` if clean.

### security-headers.ts
`applySecurityHeaders(headers, isLocal)` sets CSP, X-Content-Type-Options (nosniff), X-Frame-Options (DENY), X-XSS-Protection (0), Referrer-Policy, Permissions-Policy. HSTS only set when `isLocal: false`. CSP disables unsafe-inline for scripts; allows unsafe-inline for styles; frame-ancestors none.

## Tokens

| Constant | Value | Description |
|----------|-------|-------------|
| `APPROVED_DOMAINS` | Set of ~15 domains | Pre-approved for fetch-detector; includes subdomain matching |
| `ALL_PATTERNS` | Combined array | All critical + warning code-scanner pattern rules |
| `EXPANDED_WRITE_OPERATORS` | RegExp | Extended set of bash write/destructive operators |
| Injection block threshold | HIGH or CRITICAL | Confidence level that triggers route-level block |
| Medium escalation threshold | 3 matches | ≥ 3 MEDIUM → escalates to HIGH |
| High escalation threshold | 2 matches | ≥ 2 HIGH → escalates to CRITICAL |
| Minimum flaggable message length | 4 chars | Shorter messages never flagged |

## Assets

**DB tables accessed (via injection-guard.ts):**
- `audit_log` — records blocked injection attempts with channel, confidence, and content preview

**External services:**
- DNS resolution (via `Bun.dns.resolve` or equivalent) — used by `validateUrlTarget` for SSRF protection
