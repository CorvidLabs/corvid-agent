# Threat Model — corvid-agent v1.0

## Overview

corvid-agent is an agent orchestration platform that manages AI agent sessions, on-chain wallets, and inter-agent communication. This document identifies attack surfaces and mitigation strategies.

## Trust Boundaries

1. **External Network <-> Server**: HTTP/WebSocket API exposed on port 3578
2. **Server <-> Agent SDK**: Agent subprocess communicates via MCP protocol
3. **Server <-> Database**: SQLite on local filesystem
4. **Server <-> Algorand**: On-chain transactions via AlgoChat
5. **Server <-> External APIs**: Anthropic, OpenAI, Ollama, Stripe, notification channels
6. **Agent <-> Filesystem**: Agents can read/write files in project directories
7. **Tenant A <-> Tenant B**: Multi-tenant isolation boundary (Cloud mode)

## Attack Surfaces

### AS-1: API Authentication
- **Threat**: Unauthorized access to management API
- **Current**: Bearer token via API_KEY env var, timing-safe comparison
- **Mitigations**: Rate limiting (600 GET/min, 60 mutation/min), startup security check (requires API_KEY if not localhost)
- **Residual Risk**: Single shared key, no per-user auth in single-tenant mode

### AS-2: Agent Sandbox Escape
- **Threat**: Malicious agent modifies protected files or accesses secrets
- **Current**: Protected path enforcement in sdk-process.ts (basename + substring matching), env var allowlist
- **Mitigations**: Docker container sandboxing (Phase 2), process-level isolation
- **Residual Risk**: Without sandbox enabled, agents share host filesystem

### AS-3: Prompt Injection via MCP Tools
- **Threat**: Attacker injects prompts through tool inputs/outputs
- **Current**: Input validation via Zod schemas, protected file enforcement
- **Mitigations**: Tool approval flow, tool-level permissions per agent
- **Residual Risk**: Indirect prompt injection via file contents or API responses

### AS-4: Wallet/Key Compromise
- **Threat**: Agent wallet mnemonics exposed
- **Current**: Encrypted storage (AES-256-GCM via encryptMnemonic), excluded from env allowlist
- **Mitigations**: Persistent keystore with file-level encryption, key never logged
- **Residual Risk**: Master mnemonic in env var, single encryption key

### AS-5: Cross-Tenant Data Leakage
- **Threat**: Tenant A accesses Tenant B's data
- **Current**: Row-level tenant_id filtering, tenant context middleware
- **Mitigations**: Database-level WHERE clause injection, ownership validation
- **Residual Risk**: SQLite single-file storage (all tenants in one DB)

### AS-6: Notification Channel Abuse
- **Threat**: Attacker triggers excessive notifications to external channels
- **Current**: Channel configuration requires API keys/tokens
- **Mitigations**: Rate limiting, per-agent channel config, retry limits (max 3)
- **Residual Risk**: Webhook URLs stored in plaintext in DB

### AS-7: Plugin Code Execution
- **Threat**: Malicious plugin executes arbitrary code
- **Current**: Capability-based permission model, naming enforcement
- **Mitigations**: 30s execution timeout, try/catch wrapping, admin-only loading
- **Residual Risk**: Dynamic import() allows code execution in server process

### AS-8: Supply Chain
- **Threat**: Compromised npm dependency
- **Current**: Minimal dependency tree (Bun built-ins, Zod, Anthropic SDK, MCP SDK)
- **Mitigations**: Package lock file, no postinstall scripts
- **Residual Risk**: Transitive dependencies

### AS-9: Stripe Webhook Forgery
- **Threat**: Attacker sends fake Stripe webhook events
- **Current**: HMAC-SHA256 signature verification, timestamp tolerance (5 min)
- **Mitigations**: Webhook secret rotation support
- **Residual Risk**: None (standard Stripe verification)

### AS-10: Denial of Service
- **Threat**: Resource exhaustion via concurrent sessions/requests
- **Current**: Rate limiter, warm container pool limits
- **Mitigations**: Per-tenant session limits, credit-based usage caps, container resource limits
- **Residual Risk**: SQLite write contention under high load

## STRIDE Analysis

| Threat | Category | Severity | Mitigation Status |
|--------|----------|----------|-------------------|
| API key brute force | Spoofing | Medium | Rate limiting, timing-safe comparison |
| Protected file bypass | Tampering | High | Path matching, sandbox containers |
| Agent log injection | Repudiation | Low | Structured logging, audit trail |
| Wallet key exposure | Information Disclosure | Critical | Encryption at rest, env allowlist |
| Cross-tenant queries | Information Disclosure | High | Row-level filtering |
| Resource exhaustion | Denial of Service | Medium | Rate limits, container limits |
| Plugin privilege escalation | Elevation of Privilege | High | Capability model, admin-only loading |

## Recommendations for v1.0

1. **Enable container sandboxing by default** in Cloud mode
2. **Add per-user API keys** with scoped permissions
3. **Implement audit logging** for all mutation operations
4. **Add Content Security Policy** headers to web dashboard
5. **Consider separate SQLite files** per tenant in Cloud mode
6. **Implement webhook URL validation** (allowlist domains)
7. **Add automated dependency scanning** (npm audit in CI)
