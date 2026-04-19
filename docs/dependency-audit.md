# Dependency Vulnerability Audit

## Audit Summary

- **Date**: 2026-03-06
- **Tool**: Manual analysis (bun uses bun.lock, npm audit not supported)
- **Scope**: All direct and transitive dependencies
- **Direct dependencies**: 17 (server), 22 (client)
- **Transitive dependencies**: ~630 total packages

## Direct Dependencies — No Known Vulnerabilities

| Package | Version | Risk | Notes |
|---------|---------|------|-------|
| @anthropic-ai/claude-agent-sdk | 0.2.68 | None | Anthropic SDK |
| @anthropic-ai/sdk | 0.78.0 | None | Anthropic SDK |
| @modelcontextprotocol/sdk | 1.25.2 | LOW | Brings in express, hono as transitive deps |
| algosdk | 3.5.2 | None | Algorand SDK |
| croner | 10.0.1 | None | Cron scheduler |
| zod | 4.3.5 | None | Schema validation |
| web-tree-sitter | 0.26.8 | None | WASM-based parser |
| @vscode/tree-sitter-wasm | 0.3.1 | None | WASM grammars |
| @opentelemetry/* | 1.9.0-2.6.0 | None | Observability SDK |

## Transitive Dependencies — Overrides Applied

These packages had historical CVEs. Overrides are declared in package.json but bun's resolver doesn't always honor them exactly:

| Package | Resolved | Override Target | CVE | Severity | Mitigated? |
|---------|----------|----------------|-----|----------|------------|
| minimatch | 9.0.5 + 10.1.1 | >=9.0.7 | CVE-2022-3517 (ReDoS) | MODERATE | YES — CVE affected <3.0.5, resolved version well above |
| ajv | 8.17.1 | >=8.18.0 | Prototype pollution | MODERATE | PARTIAL — only used by MCP SDK for JSON schema validation, not user-facing |
| qs | 6.14.1 | >=6.14.2 | CVE-2022-24999 | HIGH | YES — CVE affected <6.5.3, resolved version well above |
| hono | 4.11.7 | >=4.11.10 | Various XSS/injection | LOW | LOW RISK — only used by MCP SDK HTTP transport, not exposed externally |
| @hono/node-server | 1.19.9 | >=1.19.10 | Request smuggling | LOW | LOW RISK — internal MCP transport only |

## Client Dependencies

All Angular 21.x dependencies are current stable releases. No known CVEs.

| Package | Version | Notes |
|---------|---------|-------|
| @angular/* | 21.1.2 | Latest stable |
| rxjs | 7.8.2 | Latest 7.x |
| typescript | 5.9.3 | Latest |
| vitest | 4.0.18 | Dev only |
| qrcode | 1.5.4 | No known CVEs |

## Remediation Plan

### No Action Required (Resolved)

- **minimatch, qs**: Resolved versions are well above CVE-affected versions despite override mismatch.
- **All direct dependencies**: Current versions, no known CVEs.

### LOW Priority — Monitor

- **ajv@8.17.1**: Monitor for 8.18.0 release. Prototype pollution risk is minimal since ajv only validates MCP tool input schemas, not user-supplied data.
- **hono@4.11.7, @hono/node-server@1.19.9**: Internal MCP transport only, not exposed. Upgrade when @modelcontextprotocol/sdk bumps its dependency.

### Recommendations

1. **Pin bun.lock**: The lockfile ensures reproducible builds. Always commit bun.lock.
2. **Run `bun update` monthly**: Keep dependencies current as a hygiene practice.
3. **CI security scanning**: Already implemented via GitHub Security Scanning workflow (gitleaks, CodeQL, dependency audit).
4. **Override effectiveness**: Bun's override resolution differs from npm. Consider switching to `resolutions` field if bun adds support, or pin transitive deps directly.

## Suspicious Package Review

No suspicious packages found in the dependency tree. All packages are from known publishers:

- **@anthropic-ai** — Anthropic (verified publisher)
- **@modelcontextprotocol** — Model Context Protocol (Anthropic-maintained)
- **@opentelemetry** — OpenTelemetry (CNCF project)
- **@angular** — Angular (Google-maintained)
- **algosdk** — Algorand Foundation
