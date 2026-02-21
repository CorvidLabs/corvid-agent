# Changelog

All notable changes to this project will be documented in this file.

## [0.9.0] - 2026-02-20

### Added
- Ollama cloud model support — `-cloud` suffix routing, local proxy for auth, merged local+remote model listings
- Model exam system — 18 test cases across 6 categories (coding, context, tools, algochat, council, instruction) with per-category scoring
- Expanded model family detection — qwen3, qwen3moe, deepseek2, command-r, nemotron, hermes, firefunction added to `inferFromName`
- Cloud model test suite — 32 tests covering `parseModelSizeB`, `isCloudModel`, `hostForModel` routing, and size gating
- Model capability name inference for 12 families (up from 5)
- AST code navigation tools: `corvid_code_symbols` and `corvid_find_references` for cross-file symbol analysis (#183)
- AST-powered work task repo maps for smarter context in agent sessions (#184)
- WebSocket authentication improvements (#184)
- `spec:check` and PR review job added to CI pipeline (#185)
- SDD-driven reliability improvements for Ollama and Claude providers (#186)
- Testable tool parser with structured extraction and retry logic for Ollama (#183, #186)

### Fixed
- save_memory tool returning confusing "on-chain send failed" messages that caused model retry loops (#181)
- Model family detection ordering — specific families like qwen3moe matched before generic qwen
- Ollama tool call reliability — smarter context management and retry logic (#186)

### Changed
- confidence-review.html updated to reflect v0.8.0→v0.9.0 state (95/100 score)

## [0.8.0] - 2026-02-17

Major release with 1757 server tests, 47 database migrations, and full-stack agent orchestration across five development phases.

### Phase 5 — Bridges, Personas, Skills, Voice

- **Bidirectional Telegram bridge** — talk to agents from your phone via long-polling; voice note support with automatic STT transcription; per-user sessions; authorization via `TELEGRAM_ALLOWED_USER_IDS`
- **Bidirectional Discord bridge** — talk to agents from Discord via raw WebSocket gateway (no discord.js dependency); auto-reconnect with exponential backoff; heartbeat and session resume; per-user sessions
- **Character/Persona system** — give agents distinct personalities with archetype, traits, background, voice guidelines, and example messages; persona is composed into the system prompt for both SDK and direct processes
- **Skill bundles** — composable tool + prompt packages assignable to agents; 5 built-in presets (Code Reviewer, DevOps, Researcher, Communicator, Analyst); custom bundle creation; tools and prompt additions merged at session start
- **Voice support (TTS/STT)** — OpenAI TTS API with 6 voice presets and SQLite-backed audio caching; OpenAI Whisper STT for voice message transcription; per-agent voice configuration
- **DB migrations 44-47** — agent personas table, skill bundles + assignment tables with preset data, voice cache table, voice columns on agents
- **61 new tests** across 8 test files (personas, skill bundles, routes, bridges, voice)
- **New API endpoints** — `/api/agents/{id}/persona` (GET/PUT/DELETE), `/api/skill-bundles` (CRUD), `/api/agents/{id}/skills` (assign/unassign)

### Phase 1-4 (prior development)

- **CLI mode** — `npx corvid-agent chat "..."` for terminal-first interaction with device authorization flow
- **Plugin SDK** — dynamic tool registration allowing agents to extend their capabilities at runtime
- **OpenAPI documentation** — auto-generated API docs served from `/api/docs`
- **Container sandboxing** — isolated execution environments for agent-generated code with resource limits
- **Agent marketplace** — publish, discover, and consume agent services with credit-based payments
- **Reputation & trust scoring** — track agent reliability, quality, and trustworthiness over time
- **WhatsApp & Signal channels** — reach agents from mobile messaging apps
- **Multi-model cost-aware routing** — automatic model selection based on task complexity, latency, and budget
- **Multi-tenant isolation** — team workspaces with tenant-scoped data access
- **Billing integration** — usage metering and billing for hosted deployments
- **Kubernetes & Helm deployment** — production-grade orchestration with Helm charts and K8s manifests
- **Security hardening** — enhanced input validation, rate limiting improvements, and audit coverage

### Migration Notes

- **Database**: SCHEMA_VERSION 43 → 47 (4 new migrations run automatically on startup)
- **No breaking changes**: All new DB columns have DEFAULT values; all features opt-in via env vars
- **No new npm dependencies**: Discord gateway uses raw WebSocket; TTS/STT are direct API calls

## [0.7.0] - 2025-12-15

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
