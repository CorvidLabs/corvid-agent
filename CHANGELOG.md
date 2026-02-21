# Changelog

All notable changes to this project will be documented in this file.

## [0.10.0] - 2026-02-21

### Added
- **Schedule approval notifications** — when a schedule execution needs owner approval, notifications are sent via all configured channels (Telegram, Discord, AlgoChat, etc.) instead of only showing in the dashboard
- **Proactive schedule prompts** — all custom/suggest schedules now use `corvid_notify_owner`, `corvid_web_search`, `corvid_deep_research`, and `corvid_create_work_task` where appropriate
- **Dynamic community engagement** — Weekend Community schedule searches for trending repos instead of starring a hardcoded list
- **Rotating self-improvement focus** — corvid-agent self-improvement rotates by day-of-month: test coverage (1st-7th), type safety (8th-14th), error handling (15th-21st), performance (22nd-31st)
- **Issue-first project improvement** — CorvidLabs project self-improvement checks open issues first before looking for generic improvements

### Changed
- All schedules now run on CorvidAgent (Claude Opus) — removed Qwen Coder agent dependency
- Self-improvement schedules bumped to 2x/week (Mon+Thu for projects, Tue+Fri for corvid-agent)
- Removed PR Comment Response and Morning PR Review schedules (covered by mention polling + Stale PR Follow-Up)
- Weekly Improvement Suggestions refocused on public API correctness for ts-algochat and swift-algochat

## [0.9.0] - 2026-02-20

### Added
- **Rich polling activity feed** — activity endpoint parses session `initialPrompt` to return structured fields (repo, number, title, sender, url, isPR, triggerType); UI shows status dots, PR/Issue labels, @sender, trigger type badges, and summary bar
- **Stampede throttling** — `MAX_TRIGGERS_PER_CYCLE` (5) caps sessions spawned per config per poll cycle, preventing runaway session creation when many mentions arrive at once
- **Model library refresh** — added Claude Sonnet 4.6, GPT-4.1/Mini/Nano, o3, o4-mini, Qwen 3 32B (local), and 5 new Ollama cloud models (Qwen 3.5, DeepSeek V3.2, Qwen 3 Coder Next, Devstral Small 2, Nemotron 3 Nano)
- Ollama cloud model support — `:cloud` suffix routing, local proxy for auth, merged local+remote model listings
- Model exam system — 18 test cases across 6 categories (coding, context, tools, algochat, council, instruction) with per-category scoring
- Expanded model family detection — qwen3, qwen3moe, deepseek2, command-r, nemotron, hermes, firefunction added to `inferFromName`
- Cloud model test suite — 32 tests covering `parseModelSizeB`, `isCloudModel`, `hostForModel` routing, and size gating
- Model capability name inference for 12 families (up from 5)
- AST code navigation tools: `corvid_code_symbols` and `corvid_find_references` for cross-file symbol analysis (#183)
- AST-powered work task repo maps for smarter context in agent sessions (#184)
- WebSocket authentication improvements (#184)
- Module specification system with `bun run spec:check` CI enforcement (#185)
- Ollama reliability improvements — testable tool parser, retry logic, context-aware truncation, smarter nudges, fuzzy repeat detection (#186)
- Claude Code subscription auth support (no API key required)

### Fixed
- Opus 4.6 pricing corrected to $5/$25 (was legacy $15/$75 from Opus 4/4.1 era)
- Haiku 4.5 pricing corrected to $1/$5 (was $0.80/$4 from Haiku 3.5)
- Anthropic provider model IDs updated to current versions (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001)
- save_memory tool returning confusing "on-chain send failed" messages that caused model retry loops (#181)
- Model family detection ordering — specific families like qwen3moe matched before generic qwen
- GitHub mention dedup race condition (#174)
- Ollama slot weight leak on session kill (#173)
- Failed on-chain sends marked as failed, not completed (#171)
- Project bundle tool merging for explicitly scoped agents (#176)
- Ollama multi-tool chain hallucination in text-based tool calling (#180)
- Ollama tool call reliability — smarter context management and retry logic (#186)

### Changed
- Fallback chains updated — GPT-4.1 replaces GPT-4o in high-capability/balanced, GPT-4.1 Nano added to cost-optimized, cloud chain expanded
- Default Anthropic model changed from claude-sonnet-4 to claude-sonnet-4-6

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
