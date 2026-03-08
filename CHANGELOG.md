# Changelog

All notable changes to this project will be documented in this file.

## [0.20.0] - 2026-03-07

### Added
- **Discord slash commands** — `/ask`, `/status`, `/help` commands with threaded conversations, session resume, and GitHub mention acknowledgment (#736)
- **Telegram bridge work-intake mode** — submit work tasks directly from Telegram conversations (#698)
- **One-line install script** — simplified onboarding for newcomers with a single curl command (#717)
- **Work task retry button** — retry failed work tasks from the dashboard UI (#735)
- **Governance tier in council edit** — configure governance tier directly from the council edit UI (#731)
- **Graceful work task drain** — server shutdown waits for in-progress work tasks to complete before exiting (#721, #723)
- **Wallet idle lock** — auto-lock wallet on tab focus when idle timeout exceeded (corvid-agent-chat#55)
- **WCAG AA accessibility** — full accessibility compliance across the chat client (corvid-agent-chat#41)
- **Client-side rate limiting** — message rate limiting in the chat client to prevent spam (corvid-agent-chat#35)

### Security
- **CodeQL alert remediation** — resolved 4 log-injection alerts (#701, #703)
- **CVE fix** — override express-rate-limit >=8.2.2 for rate-limit bypass vulnerability (#696)

### Fixed
- Polling injection false positive and infinite retry loop (#737)
- E2E test isolation from production database (#730, #732)
- PR dedup check to prevent duplicate work tasks (#725)
- Layer 0 governance violation in `waitForSessions` extraction (#722)
- Heartbeat polling for council `waitForSessions` (#716)
- DB-filter test lifecycle and marketplace spec enhancements (#711)
- Test global state leaks from PR #699 (#702)
- Deduplicate exports and fix inflated warning count in spec-check (#692)
- Use `bun x` instead of `bunx` for work task validation (#684)
- Prevent duplicate user messages in chat client (corvid-agent-chat#40)
- Icon sizing consistency across 6 chat UI elements (corvid-agent-chat#45-54)
- Wildcard route redirect in specl (specl#72)
- Accessibility issues across 5 specl components (specl#66)
- Standardize git author identity in corvid-reputation workflow (corvid-reputation#1)

### Refactored
- Extract repo map and symbol extraction into `repo-map.ts` (#693)
- Extract WS event bus into `councils/events.ts` (#694)
- Extract validation pipeline from work service (#695)
- Remove unused `printPrompt` and `clearAgentCardCache` exports (#691)
- Split `chat.ts` view into smaller components (corvid-agent-chat#57)

### Tests
- 6 untested modules covered with 66 new tests (#699)
- Broadcasting, workflow service, and algochat init coverage (#697)
- Toast, chat-messages, and chat-search coverage (+69 tests, corvid-agent-chat#58)
- Device-name and wallet lifecycle coverage (+51 tests, corvid-agent-chat#56)
- WelcomeComponent, GitHubOAuthService, FrontmatterEditor coverage (+26 tests, specl#73, #74)
- SectionEditor, GithubConnect, TableEditor, SectionNav, SpecPreview coverage (specl#65, #67)

### Documentation
- Use case gallery and how-it-works guide (#712)
- Document all undocumented exports — 23 to 0 warnings (#690)
- Update stale test and spec counts across docs (#689)
- Fix stale session endpoint, update route count (#687)
- Add missing spec.md files for 4 specl modules (specl#68)

### Dependencies
- Angular 21.2.0 and minor dependency bumps (specl#60)

### Stats
- **5,704** unit tests across 228 files (15,958 assertions)
- **360** E2E tests across 31 Playwright specs
- **111** module specs with automated validation
- **37** MCP tools, **~200** API endpoints, **70** migrations, **81** tables
- **52** PRs merged across 4 repositories this week

## [0.19.0] - 2026-03-06

### Security
- **232 security tests** across 3 dedicated test suites — security-audit (104), jailbreak-prevention (81), rate-limit-bypass (47)
- **SECURITY.md threat model** — expanded from 90 to 324 lines with asset inventory, threat actors, attack surfaces, injection detection, rate limiting, and incident response playbook
- **Jailbreak prevention tests** — multi-turn attacks, encoding bypasses (base64, hex, ROT13), persona hijacking, instruction hierarchy, payload splitting, language-switching
- **Rate limit bypass tests** — IP rotation, header manipulation (X-Forwarded-For, X-Real-IP), concurrent floods, sliding window, content length guard
- **Dependency audit** — manual audit of all direct and transitive dependencies; 0 HIGH/CRITICAL CVEs in direct deps, 5 transitive overrides analyzed (`docs/dependency-audit.md`)
- **External review scope document** — P0–P3 critical paths, test coverage map, access instructions for third-party auditors (`docs/external-review-scope.md`)

### Added
- **ProcessManager decomposition** — extracted `TimerManager` and `ResilienceManager` from ProcessManager for cleaner separation of concerns (#453)

### Stats
- **5,427** unit tests across 212 files (15,465 assertions)
- **360** E2E tests across 31 Playwright specs
- **111** module specs with automated validation
- **37** MCP tools, **~200** API endpoints, **70** migrations, **81** tables

## [0.18.0] - 2026-03-06

### Added
- **Governance tier architecture** — council launches support vote types (`standard`, `weighted`, `unanimous`) and governance tiers; `governance_votes` and `governance_member_votes` tables for structured multi-agent voting (#627)
- **Empty state components** — dashboard pages (agents, councils, work tasks, schedules, sessions) show helpful empty states with ASCII art icons, descriptions, and quick-action buttons (#623)
- **Skeleton loading states** — animated skeleton placeholders replace "Loading..." text across all list views (#623)
- **Deduplication state persistence** — `dedup_state` table for crash-resilient dedup across polling, messaging, and bridge modules (#613)
- **Tooltip directive** — reusable `appTooltip` directive for truncated text throughout the dashboard (#618)
- **McpServiceContainer** — extracted MCP tool dependencies into a typed service container for cleaner dependency injection (#615)
- **Global PR review polling** — centralized PR review detection across all configured repos (#628)
- **Auto-merge dedup** — prevents duplicate merge attempts on the same PR (#626)

### Improved
- **Council list cards** — show last launch synthesis summary, stage badges, member chips, and chairman highlighting (#618)
- **Schedule list** — improved layout with status badges, next-run display, and test-data filtering (#616)
- **Work task list** — inline create form, status/type filters, and rich task cards with validation indicators (#616)
- **Migration robustness** — `IDEMPOTENT_CREATE_INDEX` regex handles `CREATE UNIQUE INDEX IF NOT EXISTS`; `safeAlter` pattern for idempotent column additions

### Fixed
- Escaped backtick rendering in Angular template literals (#623, #616, #618)
- Migration 066/067 collision between dedup_state and governance_tiers (#627)
- Baseline migration schema drift for governance tables (#627)
- Dead template references (`filteredSchedules`, `activeFilter`) in schedule-list component (#616)
- Octal escape sequences in CSS template literals (#616)
- Duplicate empty-state blocks in work-task-list component (#616)

### Stats
- **5,192** unit tests across 206 files (14,598 assertions)
- **360** E2E tests across 31 Playwright specs
- **108** module specs with automated validation
- **37** MCP tools, **~200** API endpoints, **70** migrations, **81** tables

## [0.17.0] - 2026-03-06

### Added
- **Repo blocklist with auto-block on PR rejection** — rejected PRs automatically add repos to the blocklist; org-wide wildcard support (e.g. `vapor/*`); enforced in polling and webhooks (#547, #554, #561, #565)
- **Branch protection** — script to enable branch protection on unprotected public repos (#560)
- **Dashboard summary batch endpoint** — `GET /api/dashboard/summary` aggregates agents, sessions, work tasks, and recent activity in a single call (#567)
- **Schedule management via MCP** — `update` action added to `corvid_manage_schedule` tool (#568)
- **Daily review schedule action** — automated end-of-day retrospective with PR outcome analysis (#570)
- **Selective tool gating** — scheduler sessions can restrict which MCP tools are available (#578)
- **Permission broker** — capability-based security layer for agent actions (#578, #579)
- **69 module specs** for full server coverage — 109 total specs with automated validation (#552)

### Security
- **CSP and Permissions-Policy headers** — Content-Security-Policy and Permissions-Policy middleware on all responses (#566)
- **WebSocket post-connect auth timeout** — 5-second deadline to authenticate after connection (#564)
- **@hono/node-server authorization bypass patch** — override for GHSA-wc8c-qw6v-h7f6 (#575)
- **Blocklist enforcement** in polling and webhook handlers (#565)

### Fixed
- Localhost exempted from rate limiting for local dashboard access (#562, #563)
- Logger special characters test handles JSON format in production mode (#574)
- Cosign installer pinned to current v3 SHA; id-token permission for release workflow (#545, #546)

### Changed
- **Service bootstrap extracted** from `server/index.ts` into `server/bootstrap.ts` — cleaner startup, testable initialization (#579)
- Architecture docs synced with all 200+ API endpoints and 70 tables (#569)
- README updated with At a Glance stats section, accurate counts (#573, #576, #577)

### Stats
- **5,040** unit tests across 202 files (14,118 assertions)
- **360** E2E tests across 31 Playwright specs
- **109** module specs with automated validation
- **37** MCP tools, **~200** API endpoints, **64** migrations, **82** tables

## [0.16.0] - 2026-03-04

### Added
- **RBAC enforcement across all routes** — `tenantRoleGuard` on 75+ write endpoints across 17 route files; owner-only guards on settings and billing (#529, #530, #531)
- **Admin role enforcement** — system-logs, performance, github-allowlist, wallet-summary endpoints restricted to admin (#505)
- **Tenant isolation on usage endpoints** — usage and allowlist routes scoped per-tenant (#494)
- **EntityStore signal store pattern** — extracted reusable `EntityStore<T>` for Angular services; migrated ProjectService, CouncilService, WorkflowService (#499, #501)
- **WebSocket heartbeat** — server-sent timestamps for connection health monitoring (#461)
- **Cache-Control headers** for static assets (#493)
- **Retention policies** for append-only tables (#481)
- **SSRF private IP range blocking** (#479)
- **SBOM generation and Docker image signing** via Cosign (#495)
- **Multi-tenant route isolation** across all 14 previously unscoped handlers (#439)
- **Test coverage expansion** — 15 new test suites covering DB modules (agents, sessions, projects, councils, spending, allowlist, work-tasks, pr-outcomes, health-snapshots, notifications, webhooks, reputation, backup, algochat-messages, github-allowlist, mcp-servers, plugins), polling service, scheduler cron-parser, priority-rules, auto-merge, and ci-retry (#489, #502–#504, #512–#514, #516–#519, #532, #533)

### Changed
- **WebSocket auth** — query-string `?key=` deprecated in favor of `Authorization: Bearer` header (#496)
- **Polling service decomposed** into 3 focused services (#498)
- **shared/types.ts split** into domain-specific modules (#497)
- **DB count queries** consolidated into `queryCount()` helper (#511)
- Bumped `@anthropic-ai/claude-agent-sdk` to 0.2.68 (#518)
- Bumped `actions/github-script` from 7 to 8 (#434)
- CI workspace setup extracted into composite action (#482)
- GH Actions pinned to SHA with explicit permissions (#478)

### Fixed
- Condenser tries all providers before truncation fallback (#484)
- Missing `subscription_items` table for UsageMeter (#483)
- Auto-refill agent wallets before on-chain sends (#476)
- Git author identity in LaunchAgent plist (#515)
- `schedule_skip` added to AuditAction type (#470)
- Baseline migration schema drift (#469)
- Respect human issue assignments and fix log rotation (#440)
- Script injection in GitHub Actions workflows (#492)
- 5 npm audit vulnerabilities resolved via overrides (#488)

### Docs
- Clarified Claude auth — API key not required when Claude Code CLI is installed (#543)
- Updated stale stats across README, docs site, and CLAUDE.md (#534)
- Documented inline API endpoints (#490)
- Security review of API key authentication (#460)

## [0.15.0] - 2026-03-04

### Added
- **RBAC enforcement across all routes** — `tenantRoleGuard` added to all write endpoints across 17 route files (75 endpoints), with owner-only guards on settings and billing (#520, #526, #527, #528)
- **Test coverage: scheduler** — 70 new tests for cron-parser (37 tests) and priority-rules (33 tests) (#524, #532)
- **Test coverage: polling** — 28 new tests for auto-merge (14 tests) and ci-retry (14 tests) (#525, #533)

### Fixed
- TypeScript strict mode errors in plugins.test.ts (double cast for PluginCapabilityRecord)
- Unused `@ts-expect-error` directives in polling test files

## [0.14.0] - 2026-02-28

### Added
- **Slack notification integration** — schedule approval notifications, work task results, and agent questions routed to Slack channels
- **Health-gated scheduling** — priority rules engine suppresses non-critical work when system health is degraded
- **Auto-merge polling** — automatically merges agent PRs when all CI checks pass
- **CI retry service** — detects failed CI on agent PRs and spawns fix sessions
- **Performance metrics** — collection, trend detection, and regression alerts
- **Usage monitoring** — schedule execution frequency tracking and anomaly detection
- **Feedback loop** — PR outcome tracking for schedule effectiveness learning

### Changed
- Database schema version bumped to 62 (15 new migrations since v0.13.0)
- Route modules expanded from 28 to 34
- Module specs expanded from 33 to 38

## [0.13.0] - 2026-02-25

### Added
- **Centralized DedupService** — unified deduplication with TTL expiry, LRU eviction, and SQLite persistence; replaces scattered per-feature dedup logic (#254)
- **Test coverage reporting** — CI pipeline now generates and uploads coverage reports (#252)
- **Unit tests for critical untested services** — expanded test coverage for previously untested code paths (#255)

### Fixed
- **Cross-repo dedup collisions** — mention polling now scopes dedup keys per-repository to prevent false-positive suppression (#232)
- **SQL injection prevention** — replaced string interpolation with parameterized queries across database layer (#251)
- **Dockerfile bun version** — pinned to bun:1.3.8 to match lockfile (#229)
- **CI/Docker workflow timeouts** — added `timeout-minutes` to prevent runaway jobs (#228)
- **bun.lock regeneration** — resolved lockfile drift from dependabot dependency merges (#230)

### Changed
- **Tool handler decomposition** — split monolithic `tool-handlers.ts` into domain-specific modules for maintainability (#253)
- **AlgoChatBridge decomposition** — refactored into focused single-responsibility services (#256)

### Dependencies
- Bumped `@opentelemetry/auto-instrumentations-node` (#225)
- Bumped `@anthropic-ai/sdk` from 0.74.0 to 0.78.0 (#227)

## [0.11.0] - 2026-02-23

### Added
- **Slack integration** — bidirectional Slack bridge for channel-based agent interaction, notification delivery, and question routing (#143, #212)
- **ChannelAdapter interface** — unified adapter pattern for messaging bridges; AlgoChatBridge refactored to conform (#142, #209)
- **Koa-style middleware pipeline** for agent messaging — composable request processing (#151, #217)
- **OnChainTransactor extraction** — separated on-chain transaction handling from AgentMessenger for cleaner separation of concerns (#152, #219)
- **Fire-and-forget async messaging** — non-blocking message delivery mode for AgentMessenger (#153, #220)
- **Circuit breaker + per-agent rate limiting** — protects against overwhelming individual agents and the system (#154, #221)
- **Parallel council responses** — agents respond concurrently during council discussion rounds, improving throughput (#216)
- **AST symbol context in work tasks** — work task sessions now receive richer code context through AST analysis (#141, #211)
- **UI audit (phases 1–9)** — complete dashboard and component rework: agent list/detail tabs, session state display, council panels, settings sections, analytics charts, work tasks, schedules, system logs, feed, and personas — all with consistent styling
- **Client pages for personas, skill bundles, reputation, marketplace, and MCP servers** — full Angular services and E2E test coverage
- **Reputation auto-compute** — stale scores auto-recompute on read (5-minute threshold); SVG score rings, trust badges, color-coded component bars with weight percentages
- **Marketplace enhancements** — detail panels with star ratings, trust badges from reputation, federated listings from remote instances
- **100% testable API E2E coverage** — 348 tests across 30 Playwright spec files covering 198/202 endpoints
- **Module specs** for reputation scorer, marketplace service, and marketplace federation

### Fixed
- Persona manager UX — replaced vertical card list with horizontal chip picker; detail form now immediately visible without scrolling
- Suppressed expected 404 toasts on persona endpoints (unconfigured personas are normal)
- Reputation score ring SVG arcs — switched from CSS style bindings to SVG attribute bindings for cross-browser rendering
- Mention polling no longer blocks on idle sessions (#214) or permanently skips deduped mentions (#213)
- LaunchAgent PATH for claude CLI discoverability (#218)
- Replaced `Math.random()` with `crypto.randomBytes()` in E2E fixtures
- Removed unused variables flagged by code scanning
- Copilot review feedback (two rounds): marketplace query param alignment, system-log server-side filtering, `cronToHuman()` NaN handling, federation SSRF mitigation with DNS rebinding/IP validation, `Promise.allSettled` for resilient persona checks

### Changed
- E2E fixtures consolidated with `gotoWithRetry` extraction and `api.seedWorkflow()` helper
- Reputation scorer exposes `computeAllIfStale()` and `computeAll()` for bulk operations
- Marketplace component injects ReputationService for cross-feature trust badge display

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
