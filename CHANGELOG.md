# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-02-16

Major release: CorvidAgent reaches v1.0.0 with 1330 tests, 43 database migrations, and full-stack agent orchestration across four development phases.

### Phase 1 — CLI, Plugin SDK, OpenAPI Docs

- **CLI mode** — `npx corvid-agent chat "..."` for terminal-first interaction with device authorization flow
- **Plugin SDK** — dynamic tool registration allowing agents to extend their capabilities at runtime
- **OpenAPI documentation** — auto-generated API docs served from `/api/docs`
- **Test expansion** — from 850 to 1050+ tests

### Phase 2 — Sandbox, Marketplace, Reputation

- **Container sandboxing** — isolated execution environments for agent-generated code with resource limits
- **Agent marketplace** — publish, discover, and consume agent services with credit-based payments
- **Reputation & trust scoring** — track agent reliability, quality, and trustworthiness over time

### Phase 3 — Messaging, Multi-Model Routing, Multi-Tenant

- **WhatsApp & Signal channels** — reach agents from mobile messaging apps
- **Multi-model cost-aware routing** — automatic model selection based on task complexity, latency, and budget
- **Multi-tenant isolation** — team workspaces with tenant-scoped data access
- **Billing integration** — usage metering and billing for hosted deployments

### Phase 4 — Kubernetes, Security, Polish

- **Kubernetes & Helm deployment** — production-grade orchestration with Helm charts and K8s manifests
- **Security hardening** — enhanced input validation, rate limiting improvements, and audit coverage
- **DB migrations 39-43** — marketplace tables, reputation scores, tenant isolation, billing records, sandbox configs

### Migration Notes

- **Database**: SCHEMA_VERSION 38 → 43 (5 new migrations run automatically on startup)
- **Breaking**: `KEYSTORE_PATH` export replaced with `getKeystorePath()` function (lazy env read)
- **CI**: Windows CI marked `continue-on-error` due to upstream Bun v1.2.4 runtime bug

## [0.8.0] - 2025-12-15

- Graph-based workflow orchestration with suspend/resume
- OpenTelemetry tracing, Prometheus metrics, and immutable audit logging
- A2A protocol support (Google Agent-to-Agent interoperability)
- Structured memory with vector embeddings and FTS5 search
- GitHub webhook automation with `@mention` triggers
- Multi-channel notifications (Discord, Telegram, GitHub Issues, AlgoChat)
- Agent-to-owner communication (`corvid_ask_owner`, `corvid_notify_owner`)
- Tree-sitter AST parser for code understanding
- Automation bootstrap scripts
- 850 tests across 34 files
