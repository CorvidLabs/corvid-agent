# Changelog

All notable changes to this project will be documented in this file.

## [0.55.0] - 2026-03-27

### Added
- **Cursor: first-class provider** — CursorProvider promoted to production-quality LlmProvider with exit code classification, transient/permanent error detection, 120s idle timeout, and 41 tests (#1545, #1531)
- **Agent signatures** — agent identity signatures on all GitHub write operations with model-based regex mapping and fail-open safety (#1555)
- **Memory browser** — full CRUD UI with search, filter, pagination, and signal-based service for on-chain ARC-69 memories (#1552)
- **Agent comms visualization** — real-time WebSocket timeline of all agent-to-agent messages with history and dedup handling (#1551)
- **Cron editor** — extracted `CronHumanPipe`, inline validation, preset chips, and human-readable preview for schedule management (#1553)
- **Shared agent library (CRVLIB)** — ARC-69 shared agent library for reusable on-chain agent components (#1537)
- **Ollama: cloud intern models** — GPT-OSS, DeepSeek V3.1, Qwen3 Coder as cloud intern model options (#1524)
- **Ollama: cloud optimizations** — compact prompts and timeout caps for cloud model families (#1522)
- **Work: intern PR guard** — prevent intern-tier models from creating production PRs (#1546)

### Fixed
- **Flock: inner transaction fees** — fix AVM fee-pooling bug with extraFee for inner transactions, plus 45 e2e tests (#1550)
- **Ollama: readiness probe** — check Ollama readiness before provider registration (#1544)
- **Ollama: nemotron** — add nemotron to TEXT_BASED_TOOL_FAMILIES (#1521)
- **Health collector** — fix grep --include flag ordering (#1543)
- **MCP: tool permissions** — empty tool permissions no longer blocks all tools (#1523)
- **Scheduler** — resolve project ID via tenant fallback (#1540)

### Docs
- **Provider parity plan** — Ollama + Cursor checklist and test plan (#1534)
- **TypeScript 6.0 evaluation** — upgrade evaluation document (#1541)
- **CRVLIB spec** — add missing exports and fix consumed-by section (#1538)

## [0.54.0] - 2026-03-26

### Added
- **Schedules: get action + agent_id** — schedule API now supports `get` action and `agent_id` parameter for create/update (#1519)
- **Cursor: routing parity** — fallback chains, diagnostics, and full test coverage for Cursor routing (#1503)
- **Ollama: loop detection** — hardened loop detection and escalation for more reliable model interactions (#1506)
- **Ollama: cloud tool calling** — text-based tool calling for cloud models with streaming tool_call accumulation (#1508)
- **Ollama: codebase context** — codebase context prompt and worked examples for all model families (#1518)

### Security
- **YAML CVE** — address GHSA-48c2-rrv3-qjmp yaml stack overflow vulnerability (#1515)
- **SQL injection** — replace string interpolation with parameterized queries in test files (#1509)

### Fixed
- **Health collector** — exclude test files and self from health-collector counts (#1517)
- **Discord** — gateway/message reliability and quality-stall escalation (#1502)
- **Providers** — enforce provider isolation in fallback chains (#1505)
- **Buddy + Cursor** — Ollama tool mapping, blank message filtering, embed fixes (#1501)

### Docs & Tests
- **API reference** — add missing Cursor, Buddy, and conversation-mode endpoints (#1516)
- **Tests** — mixed-provider smoke tests for Ollama + Cursor (#1507), cursor route endpoint coverage (#1504)

## [0.53.1] - 2026-03-25

### Fixed
- **CI: test reliability** — fix env var race condition in Discord tests, update buddy tools count assertion (#1494)

## [0.53.0] - 2026-03-25

### Added
- **DX: frictionless onboarding** — root `docker-compose.yml`, `bun run setup` wizard, improved quickstart paths (#1460)
- **CLI: settings command** — `corvid-agent settings` for viewing/editing config, plus cookbook docs (#1488, #1490)
- **CLI: plugin system** — `corvid-agent plugin` commands for listing, installing, and managing plugins (#1489, #1491)
- **Discord: council selection** — `/council` now supports `council_name`, `agents`, and `project` options for picking councils, ad-hoc agent groups, and project context (#1492)
- **Discord: responsive interface** — collapsible embeds and mobile-friendly layouts for Discord commands (#1491)

### Fixed
- **Buddy: review tool visibility** — expand buddy review tools (Read, Glob, Grep, code_symbols, find_references) for better context during reviews (#1492)

## [0.52.0] - 2026-03-25

### Added
- **Buddy mode: visible review rounds** — buddy review rounds now visible in Discord with sandbox `/message` support (#1477)
- **Buddy mode: default pairings** — seed default buddy pairings on startup for zero-config buddy reviews (#1476)
- **Buddy mode: improved review quality** — memory tools and tighter approval detection for more accurate buddy reviews (#1480)
- **Scheduler: on-chain attestation** — daily activity attestation published on-chain via scheduler (#1474)
- **Flock: A2A HTTP transport** — replace AlgoChat transport with A2A HTTP for flock agent communication (#1475)
- **Security: Zod validation** — add Zod input validation to all permission API endpoints (#1479)

### Fixed
- **Sessions: auto-resume** — automatically resume sessions interrupted by server restarts
- **Health collector: false positives** — eliminate false-positive FIXME/HACK/TODO counts in health reports (#1484)
- **Types: schedule action** — replace `as any` with proper `ScheduleActionType` (#1472)

### Changed
- **Deps: SDK + types** — update @anthropic-ai/claude-agent-sdk to 0.2.83, @types/bun to 1.3.11, @types/node to 25.5.0 (#1482)
- **Spec sync: v2.1.0** — update spec-sync tooling to v2.1.0 (#1481)
- **Docs: sync stale counts** — refresh test, spec, and MCP tool counts in documentation (#1483)

## [0.51.0] - 2026-03-24

### Added
- **Conversational agents: starter presets** — add conversational agent presets and seed modules via AlgoChat for onboarding new agents (#1471)

### Fixed
- **Contacts: partial name match** — add partial name match and memory fallback to contact lookup tool (#1470)
- **Security: CodeQL alerts** — resolve 10 CodeQL alerts (#312-#323) (#1469)

## [0.50.0] - 2026-03-24

### Added
- **Discord: tiered /message tool access** — restrict /message tool availability based on Discord role tiers (admin/mod/trusted/default) with configurable allow-lists per tier (#1466)
- **Discord: buddy review support** — buddy agents can now review /message tool usage and approve or flag messages before sending (#1466)

### Fixed
- **Tests: resumeProcess scan window** — widen test scan window from 8000 to 10000 chars to accommodate tiered access code in process manager (#1466)
- **Tests: fetch mock casts** — fix pre-existing TypeScript errors in discord-image-attachments tests by casting fetch mocks through `unknown` (#1466)

## [0.49.0] - 2026-03-24

### Added
- **Try-mode: auto-detect AI provider** — zero-config sandbox auto-detects Claude, OpenAI, Gemini, Ollama, and OpenRouter from environment; no manual provider selection needed (#1463)

### Fixed
- **Discord: image attachments** — download and base64-encode image attachments at receive time instead of passing expiring CDN URLs to Claude, fixing image analysis loops (#1464)
- **Flock: test reliability** — increase test timeouts and add multi-turn thread continuity for flock tests (#1456)

### Tests
- **Buddy mode + auth middleware coverage** — add 823 lines of tests covering buddy DB operations, buddy approval logic, and auth middleware edge cases (#1462)

## [0.48.0] - 2026-03-24

### Added
- **Buddy mode: collaborative agent review** — pair agents for real-time code review sessions with configurable review styles and automatic feedback (#1454)
- **Buddy mode: read-only tools** — buddies get Read, Glob, Grep tools for code verification without write access (#1454)
- **Councils: heartbeat polling** — wire heartbeat polling into council discussion flow for liveness checks (#1440)
- **Scheduler: discord_post action** — add discord_post action type and pipeline templates for scheduled Discord posts (#1441)
- **MCP: Discord tools** — add send_message and send_image MCP tools for Discord integration (#1434)

### Fixed
- **Security: CodeQL alerts** — resolve high-severity CodeQL alerts (#1433)
- **Discord: URL unfurling** — send URLs as separate follow-up so Discord auto-unfurls them (#1435)
- **CI: Windows test skip** — skip health-collector integration test on Windows (#1432)
- **CI: guild-api spec** — add missing spec for guild-api.ts (#1431)
- **Governance: tier violation** — revert Layer 0/1 file changes to resolve governance tier violation (#1442)

## [0.47.0] - 2026-03-23

### Added
- **Discord: guild API integration** — admin setup/sync commands for server management (#1420)
- **Discord: channel permissions + settings UX** — per-channel permission floor, searchable channel picker, visual role grid, code block collapse (#1429)
- **AlgoChat: conversation access control** — ownership-based access + stuck session fix + mobile UI improvements (#1418)
- **Try-mode: welcome message + sandbox banner** — seed demo sessions with assistant welcome, amber sandbox banner in dashboard (#1419)
- **ARC-69 memory reads** — `read_on_chain_memories` now reads ARC-69 ASAs with key deduplication (#1426)

### Fixed
- **UI: top-nav navigation** — replace sidebar with single top-nav pattern for cleaner layout
- **Discord: code block flooding** — large code blocks collapsed before sending to Discord (#1421)
- **UI: graceful 404 handling** — detail views now handle missing resources without crashing (#1411)
- **Worktree: project dir resolution** — resolve project dir before creating worktree for clone_on_demand projects (#1413)
- **Specs: migration docs** — add missing docs for migrations 090, 094, 095 (#1412)

### Changed
- **Work system: session lifecycle refactor** — extract session lifecycle methods into dedicated module (#1406)

### CI
- Bump codecov/codecov-action to 5.5.3, anchore/sbom-action to 0.24.0, sigstore/cosign-installer (#1414–#1416)

## [0.46.0] - 2026-03-22

### Added
- **Flock: cross-machine conflict resolution** — work claim system prevents duplicate agent work on the same issue/branch/repo, with auto-expiry and release on completion (#1404)
- **Flock: capability-based task routing** — routes tasks to the best agent by weighted score (reputation 40%, workload 30%, uptime 20%, recency 10%) (#1404)
- **Multi-agent discovery** — capabilities registry and health overview for flock agents (#1402)
- **UI: sidebar, error boundary, empty states** — complete UI/UX overhaul with improved navigation and resilience (#1403)
- **API routes** — `/api/flock-directory/claims`, `/api/flock-directory/route`, `/api/flock-directory/capabilities`

### Docs
- **Multi-agent deployment guide** — two-agent setup, configuration, monitoring, and troubleshooting (`docs/multi-agent-deployment.md`)

## [0.45.0] - 2026-03-22

### Added
- **UX overhaul (phases 1–5)** — chat-first layout, security hardening, spec-sync v2.0.0, icons, CSS vars, skeleton loaders (#1389, #1399)
- **Security: injection guard + RBAC hardening** — input sanitization across all user-input routes (#1387)
- **Discord: /agent-skill and /agent-persona commands** — manage skills and personas from Discord (#1386)
- **CLI: provision command** — multi-agent deployment provisioning (#1392)
- **Reputation score history** — tracking, trend chart, and agent comparison (#1385)
- **Dashboard: log & diff viewers** — agent health badges (#1382)
- **Dashboard: pipeline stages** — reputation trend chart (#1381)

### Fixed
- **UI: remove duplicate chat tab bar** — fix duplicate tab bar in session view (#1400)
- **UI: active tab on click** — set active tab immediately, no double-click needed (#1395, #1396)
- **Consolidate duplicate isCloudModel** — single source of truth for cloud model detection (#1391)
- **Security: RBAC guards** — add guards to discord-image and openrouter routes (#1380)

### Removed
- **Flock-directory contract** — remove dead contract code (#1390)

### Tests
- Add unit tests for onboarding components — 49 tests (#1384)
- A2A invocation guard coverage expansion (#1383)

### Docs
- **API docs** — add request/response examples for ~150 endpoints (#1394)
- Update version and stats for v0.44.0 release (#1379)

## [0.44.0] - 2026-03-22

### Added
- **Flock Directory smart contract** — on-chain agent registry with chain-sync service (#895, #1366)
- **Composable personas** — many-to-many agent↔persona relationships (#1351)
- **Agent variant profiles** — preset skill + persona combinations (#1362)
- **VibeKit MCP bridge** — skills-as-markdown loader and improved onboarding (#1369)
- **Chat-first dashboard layout** — 3-tab nav with consolidated routes (#1266, #1368)
- **Composable pipeline scheduler** — pipeline execution with shared context (#1156, #1364)
- **Tool guardrails** — prevent emergent agent-to-agent networking (#1054, #1365)
- **Agent blocklist & kill switch** — behavioral drift detection for security (#1360)
- **Dashboard polish** — UI refinements for public readiness (#1014, #1363)

### Fixed
- **Security: path traversal** — protect Discord image route from path traversal (#1359)
- **Discord Cloudflare IP bans** — prevent crash-loop reconnections from triggering bans (#1373)
- **Port recovery on startup** — prevent EADDRINUSE crash loops (#1354)
- **Wallet→UUID resolution** — resolve wallet addresses to agent UUIDs in flock testing (#1355)
- **76 test regressions** — resolve failures introduced between v0.40.0 and v0.43.0 (#1374)
- **Test rate-limit bypass** — skip rate-limit delays during tests to prevent timeouts (#1376)
- **E2E test isolation** — add E2E_ prefix to all test data and clean up afterAll hooks (#1377)

### Docs
- Add request/response examples for all API endpoints (#1361, #1367)
- Document `getRateLimitWaitMs` and `discordFetch` exports in bridge spec (#1375)

### Chore
- Update Anthropic SDK dependencies per security audit (#1356)
- Update drifted stats in deep-dive.md (#1358)

## [0.43.0] - 2026-03-21

### Added
- **Schedule output destinations** — deliver schedule results to Discord channels, webhooks, or other agents (#1347)
- **Simple mode default** — new users now start in simple mode for a cleaner first experience (#1349)
- **Dashboard polish** — animations, theming improvements, and responsive layout refinements (#1348)

### Fixed
- **CSP for GitHub avatars** — allow GitHub avatar URLs in Content-Security-Policy and unblock score/cooldown endpoints (#1346)

## [0.42.1] - 2026-03-21

### Fixed
- **Docker build** — remove `COPY patches/` from Dockerfile; directory does not exist (#1344)

## [0.42.0] - 2026-03-21

### Added
- **OpenRouter integration** — new LLM provider option for accessing additional models (#1338)
- **Onboarding tour** — multi-page tour with progress dots for new users (#1249, #1341)
- **Opt-in MCP tools** — tools are now opt-in per CLI session for better security (#1310)
- **Route consolidation** — ~41 flat routes → ~10 nested groups for cleaner API (#1309)
- **Flock Directory page** — browsing with search, filters, and agent profiles (#1306)
- **View modes** — Simple/Developer toggle with progressive disclosure (#1307, #1308)
- **Discord hardening** — ready for public channel deployment (#1336)
- **Unified website** — docs load inline, consistent design across all pages
- **Blockchain-first flock ordering** — enforce blockchain-first ordering in flock directory (#1339)
- **AlgoChat /message command** — pure conversation mode with no tools (#1304, #1329)
- **Ollama auto-escalation** — auto-escalate stalled Ollama sessions to task queue (#1314)

### Fixed
- **SSRF in ReputationVerifier** — validate wallet address format before URL interpolation (#1316)
- **Work task recovery** — improve recovery after server restarts (#1333, #1337)
- **Localnet memory sync** — prevent fallback to plain transactions (#1340)
- **Skill bundles** — no longer drop default tools when base permissions are null (#1319)
- **Dashboard layout** — status section overflow, view toggle shift, text truncation fixes
- **Discord reply fallback** — fall back to non-reply embed when message reference fails (#1318)
- **Discord silent errors** — show error embed when adaptive inline session errors or exits silently (#1317)

### Docs
- Slim README to intro + links, point to unified website
- Add missing Discord Image and Memory Backfill API endpoints (#1326)

## [0.41.0] - 2026-03-20

### Added
- **Chat-first UI** — replace audience-segmented dashboard with simple chat interface (#1277)
- **New shell layout** — top nav, activity rail, and chat home page (#1272)
- **Glassmorphism UI refresh** — glass-effect cards and Discord embed color passthrough (#1286)
- **Browser automation tool** — `corvid_browser` MCP tool for agent browser automation (#1289)
- **Discord image sending** — new `/api/discord/send-image` endpoint and image block streaming (#1293)
- **Discord file attachments** — file attachment support and cleaner embed footer (#1282)
- **29 agent skills** — expand skills from 24 to 29, add Biome linter skill (#1281)

### Fixed
- **Security: rate-limit bypass** — prevent rate-limit bypass via X-Forwarded-For spoofing (#1273)
- **Discord image-only messages** — allow messages with only image attachments, no text required (#1291)
- **Chrome tool detection** — use bridge config for Chrome detection, conditionally enable Chrome tools (#1283, #1284)
- **SDK session flags** — remove invalid `--chrome` flag from SDK sessions (#1290)
- **Flock register idempotency** — make flock register idempotent for duplicate addresses (#1288)
- **Legacy /chat handler** — remove legacy handler and add Angular wildcard route (#1274, #1275)
- **Localnet auto-fund** — fix localnet auto-fund for development (#1281)
- **Discord channel tracking** — persist `channel_id` in mention sessions for reliable reply routing (#1298)

### Docs
- Sync API reference with code — add 29 undocumented endpoints and fix README stats (#1280)
- Update README unit test count (#1287)

## [0.40.0] - 2026-03-19

### Added
- **Audience-aware dashboard + wizard rebuild** — role-based dashboard with Creator/Developer/Enterprise audience paths, rebuilt setup wizard, and audience-specific widget defaults (#1261)
- **Dashboard widget customization** — drag-and-drop widget reorder, visibility toggles, customize panel with per-audience defaults, and reset-to-defaults (#1263)
- **Analytics visualizations** — spending trend bar chart, sessions breakdown donut/bars, and agent usage dual-bar chart — all pure CSS, no external deps (#1263)
- **Ollama complexity warning** — warn users when selecting Ollama models for complex tasks that may exceed local model capabilities (#1262, fixes #1019)

## [0.39.0] - 2026-03-19

### Added
- **ARC-69 on-chain memory storage** — store agent memories as ARC-69 ASAs on localnet AlgoChat (#1256)
- **MCP over Streamable HTTP** — expose MCP tools over Streamable HTTP at `/mcp` (#1255)
- **Memory MCP tools for CLI** — expose memory MCP tools to Claude Code CLI sessions (#1243)
- **Brain viewer storage types + observations** — brain viewer storage types and memory observations system (#1259)

### Fixed
- **ARC-69 memory storage silent fallback** — remove silent fallback from ARC-69 memory storage (#1257)
- **MCP tool loading race condition** — resolve MCP tool loading race condition (#1253, #1254)
- **SpecSync wrapper for local execution** — add specsync wrapper for local `spec:check` execution (#1246)

### Docs
- Audience-specific guides for non-programmers, businesses, and enterprise (#1250, #1252)
- Add 16 missing API endpoint groups to api-reference (#1258)
- Sync stale counts across README, deep-dive, quickstart, mcp-setup, contributing (#1247)

### Tests
- Add coverage for repo-map, cheerleading detector, external MCP (#1251)

## [0.38.0] - 2026-03-18

### Added
- **Release tarball in CI** — `release.yml` builds a clean tarball of runtime files and attaches it to GitHub Releases (#1238)
- **Tarball install path** — `install.sh` downloads release tarballs for non-git installs, with git-clone fallback (#1238)
- **Tiered `corvid_send_message` access** — scheduler sessions get scoped messaging permissions (#1225)
- **Agent deployment config schema** — plugin interfaces for deployment configuration (#1218)
- **Discord user ID in author context** — agent sessions see the Discord user ID of the message sender (#1227)
- **Discord status and dashboard embeds** — rich embeds for agent status, dashboard views, and system monitoring (#892, #1240)
- **SpecSync migration** — spec validation migrated from TypeScript to specsync Rust binary (#1219)

### Fixed
- **Young session deletion** — protect recently-created sessions from premature limit-based deletion (#1223)
- **Discord session auto-resume** — expired threads auto-resume on new message (#1226)
- **Embed mention extraction** — extract embed mentions to content field for notifications (#1224)
- **Attachment URL visibility** — include attachment URLs in message text for reliable image forwarding (#1216)
- **GitHub owner in CLAUDE.md** — prevent wrong-org queries (#1231)
- **CI spec validation URL** — fix URL in spec validation step of checks.yml (#1234)

### Docs
- Separate generic CLAUDE.md from CorvidLabs instance config (#1235)
- Add SpecSync marketplace references (#1232)
- Expand use case gallery with examples and new categories (#1220)

### Tests
- Add 199 tests for approval-format, agent-card, metrics (#1217)

## [0.37.0] - 2026-03-18

### Added
- **Bot verification challenges** — challenge-response system for verifying bot identities in flock testing (#1211)
- **Auto-escalate stalled sessions** — structured metadata for escalation when sessions stall (#1209)
- **Cheerleading detection** — detect and score low-quality cheerleading responses (#1205, #1207)
- **Forward Discord image attachments** — images sent in Discord are forwarded to agent context (#1199)
- **On-chain memory fallback** — `recall_memory` falls back to on-chain reader with full txid display (#1206)

### Fixed
- **Session recovery logging** — no more silent error swallowing on Continue button (#1214)
- **`/session` channel fix** — threads now created in the correct channel (#1214)
- **Wallet address validation** — validate wallet address format from query params (#1210)
- **MCP package build** — add missing memory tools to MCP package (#1203)

### Docs
- Sync API reference and README with codebase (#1212)
- Document exports for memory-brain-viewer spec (#1213)
- Add JSDoc @param/@returns to server/lib/ exported functions (#1204)
- Update CHANGELOG with v0.33.0 through v0.36.0 entries (#1202)

### Tests
- Add runtime tests for resumeProcess external MCP loading (#1201)

## [0.36.0] - 2026-03-17

### Added
- **Adaptive inline response** — skip progress embed for quick replies (#1198)
- **On-chain memory reader and sync tools** — read and sync agent memories from localnet (#1196)
- **Multi-agent dashboard UX** — onboarding, flock browser, profiles, analytics (#1197)

### Fixed
- **External MCP configs persist on session resume** — fix merge of process.env into SDK MCP server environment (#1193)

### Docs
- Add troubleshooting, configuration, and CLI reference (#1195)

## [0.35.1] - 2026-03-17

### Fixed
- Merge process.env into SDK MCP server environment (#1193)

## [0.35.0] - 2026-03-17

### Added
- **Two-tier memory architecture** — session auto-save with localnet long-term and SQLite short-term (#1186, #1188)
- **External MCP servers** — add external MCP servers to SDK path, expand gallery to 15 servers (#1191)
- **Proactive context compression** — compress context before crash (#1189)

### Changed
- Decompose route-registry.ts (1452 LOC) into domain-colocated modules (#1190)

### Docs
- Add JSDoc to exported functions in server/lib/ (#1187)
- Sync README and deep-dive stats with v0.34.0 (#1179)

## [0.34.0] - 2026-03-16

### Added
- **Reputation score explanation** — per-component reasoning for reputation scores (#1172)
- **Layer 0 governance** — tiered permission architecture (#1171)
- **Activity breakdown stats** — added to reputation detail panel (#1169)

### Fixed
- Persist Discord mention-reply sessions to survive restarts (#1170)
- Hide misleading reputation scores for agents with no activity (#1177)

### Changed
- Decompose schema.ts into domain-colocated schema files (#1178)
- Update spec_files count to 152 (#1175)

### Deps
- Bump web-tree-sitter from 0.25.10 to 0.26.7 (#1152)

### Docs
- Add Scripts Reference table to CONTRIBUTING.md (#1166)

## [0.33.0] - 2026-03-16

### Added
- **Exam system overhaul** — fix SDK tool detection, expand to 28 cases (#1159)
- **Discord reactions to reputation feedback** (#1161, #1164)
- **Auto-link Discord users to cross-platform contacts** (#1160, #1163)
- **Context usage metrics** — expose to clients (#1158)
- **Discord author username** — pass to agent prompt context (#1157)
- **Expand exam framework** — from 18 to 30 test cases (#1146)
- **Agent invocation guardrails** — security hardening (#1147)

### Fixed
- Add logging to silent catch blocks for better observability (#1162)
- Resolve stale TODO(#1067) in messaging.ts (#1143)

### Changed
- Decompose discord commands.ts into command-handlers/ (#1144)
- Extract marketplace schemas into domain-colocated file (#1139)

### Security
- Add Zod input validation to audit log query endpoint (#1138)

### Tests
- Add coverage for memory decay, provider fallback, and permission broker (#1153)

### CI
- Bump oven-sh/setup-bun from 2.1.3 to 2.2.0 (#1150)
- Bump actions/upload-artifact from 4.6.2 to 7.0.0 (#1149)
- Bump docker/metadata-action from 5.10.0 to 6.0.0 (#1148)
- Reduce workflow minutes by trimming non-essential triggers (#1140, #1142, #1145)

### Deps
- Bump jsdom from 28.1.0 to 29.0.0 in /client (#1151)

### Docs
- Sync stale stats — version, test counts, MCP tool counts (#1141)

## [0.32.0] - 2026-03-16

### Added
- **Resume Discord sessions by reply** — users can reply to any bot message in a session thread to resume the conversation (#1130)

### Fixed
- **Discord embed delivery logging** — log embed delivery failures instead of silently swallowing errors (#1129)

### Changed
- Improved error messages with available options context for better debugging (#1133)
- Replaced `console.log` with structured logger in `server/db/` (#1127)
- Added unit tests for `server/lib/dedup.ts` (#1128, #1032)
- Optimized CI workflow minutes — split platform-independent checks, disable e2e (#1131)
- Split CI workflows into separate files for maintainability (#1132)
- Added `paths-ignore` to skip CI workflows on docs-only changes (#1125)

## [0.31.0] - 2026-03-15

### Added
- **Cross-platform contact identity mapping** — map agent identities across Discord, Telegram, Slack, and AlgoChat with unified contact resolution (#1113)
- **User response feedback tied to reputation scoring** — users can rate agent responses, feeding into the reputation system for trust-aware routing (#1110)
- **AlgoChat worktree isolation and smart branch cleanup** — AlgoChat sessions now use isolated git worktrees with automatic stale branch cleanup (#1115)
- **Flock Directory automated testing framework** — structured test harness for validating Flock Directory agent discovery and heartbeat flows (#1108)
- **Session metrics tracking and analytics endpoints** — track token usage, tool calls, and duration per session with new analytics API (#1107)
- **CLI per-command `--help` output** — every CLI command now supports `--help` with usage, options, and examples (#1116)
- **Context exhausted error handling** — emit `context_exhausted` error type on context reset with differentiated Discord error messages (#1124)
- **Discord archive thread button** — replace "New Session" with "Archive Thread" button; rename "Resume" to "Continue" (#1124)

### Fixed
- **Discord duplicate error message dedup** — prevent duplicate error messages with `sentErrorMessage` flag (#1124)
- **Session metrics persistence on error** — metrics are now saved even when sessions terminate with errors or aborts (#1109)
- **Migration retry on failure** — reset cached initDb promise when migrations fail, allowing retry without restart (#1106)

### Changed
- Missing export specs documented for infra and response-feedback modules (#1112)
- Expanded test coverage for feedback routes, reputation scorer (#1114), and validation edge cases (#1117)
- Fixed stale README badges and references (#1111)

## [0.30.0] - 2026-03-15

### Added
- **Multi-tool chain continuation** — limited-tier models (Haiku/Sonnet) can now chain multiple tool calls across continuation rounds, enabling complex multi-step workflows (#1097, #1018)
- **Session stats in Discord** — completion embeds now show token usage, tool call count, and duration for finished sessions (#1101)

### Fixed
- **Session view race condition** — subscribe to WebSocket before HTTP fetch in Angular session view to prevent missed updates (#1099)
- **Disabled agent filtering** — `listAgents` and `getAlgochatEnabledAgents` now filter out disabled agents by default (#1100)
- **Agent display columns** — hotfix migration 088 to add missing display customization columns (#1104)

## [0.29.0] - 2026-03-15

### Added
- **MCP delegation tools** — delegate subtasks to specialist models with `corvid_delegate_task` and `corvid_dispatch_model`; automatic tier routing (Opus/Sonnet/Haiku) based on task complexity (#1082)
- **Flock Directory search & sorting** — sort agents by reputation, name, or last-seen; aggregate reputation scores across the directory (#1077)
- **Welcome wizard templates** — agent template selection during onboarding (Code Reviewer, DevOps, Researcher, etc.) for faster first-agent setup (#1076)

### Fixed
- **Stale session reaping** — reap orphaned sessions on startup to prevent ghost processes after restart
- **Duplicate Discord messages** — unsubscribe event callbacks on session teardown to prevent duplicate message delivery (#1092)
- **Discord channel affinity** — enforce channel affinity so Discord-originated sessions reply on the same channel (#1079)
- **Messaging safety** — prevent agents from generating scripts that send messages outside MCP tools (#1086)
- **CLI login/logout** — wire up login and logout commands in CLI dispatcher (#1083)
- **CLI chat polling** — replace polling loop with direct callback for lower latency (#1084)
- **Agent-to-agent messaging** — stop orphaned sessions and handle `session_stopped` events in A2A messaging (#1081)
- **Spec scaffold TOCTOU** — eliminate race condition in spec scaffold generation (#1072)
- **CLI empty response** — handle empty response body gracefully in CLI client (#1066)

### Security
- **CI checkout actions** — align all checkout actions to v6.0.2 and enforce dependency audit in CI (#1062)

### Tests
- **+150 tests** — close coverage gaps in 6 under-tested modules (#1091); total now **6,982** across 293 files

### Chores
- **Worktree cleanup** — remove 10 stale git worktrees from `.claude/worktrees/` (#1065)
- **Discord worktree isolation** — add worktree isolation to Discord `/session` command (#1096)
- **README stats** — fix stale stats and add missing API entries (#1063)

### Stats
- **6,982** unit tests across 293 files (18,918 assertions)
- **360** E2E tests across 31 Playwright specs
- **138** module specs with automated validation (100% file coverage: 369/369)
- **43** MCP tools, **~300** API endpoints, **44** route modules, **90** tables
- **16** commits on main

## [0.28.0] - 2026-03-14

### Added
- **Spec coverage detection** — scan `server/` for `.ts` files not referenced in any spec's `files:` frontmatter, with per-module grouping (#1058)
- **Spec scaffold generation** — `--generate` flag creates draft `.spec.md` files for uncovered modules from template (#1058)
- **Coverage reporting** — `--coverage` flag shows full unspecced file report; summary always shows file coverage percentage (#1058)
- **100% spec coverage** — all 368 server files covered by 137 module specs with CI enforcement via `--require-coverage 100`
- **Spec coverage badge** — shields.io badge in README showing 100% spec coverage
- **Convenience scripts** — `bun run spec:coverage`, `bun run spec:generate`, and `bun run spec:coverage:require` shortcuts (#1058)
- **Tiered Claude model dispatch** — Opus/Sonnet/Haiku routing based on task complexity with fallback chains (#1052)
- **Ollama feature flag** — gate Ollama behind `ENABLE_OLLAMA` flag per council decision; provider abstraction preserved (#1052)
- **Discord slash commands** — `/tasks`, `/schedule`, `/config` commands for server interaction (#1025)
- **Dashboard UI polish** — duration display, empty states, skeleton loading, mobile responsiveness (#1023, #1024, #1026, #1027)
- **Council list enhancements** — search, sort, pagination + schedule execution stats (#1024)
- **Test data purge utility** — admin endpoint for purging test data (#1017)
- **In-memory test DB** — use in-memory SQLite for test runs to prevent production pollution (#1016)

### Changed
- **CLI utilities deduplicated** — extracted shared helpers (`truncate`, `formatUptime`, `resolveProjectFromCwd`, `handleError`) into `cli/utils.ts` (#1055)
- **Cross-platform path resolution** — use `path.sep` for Windows compatibility in `resolveProjectFromCwd`

### Fixed
- **CLI streaming** — fix streaming display and WebSocket keepalive (#1033)
- **Discord gateway intents** — correct privileged intent configuration (#1033)
- **Sidebar scrolling** — fix sidebar not scrollable on desktop (#1015)
- **Unique project names** — sync unique name index across schema layers (#1008)
- **Insecure temp file** — fix code scanning alert #307 (#1010)

### Documentation
- **Contributor welcome** — make project welcoming to new contributors (#1040)

### Chores
- **Repo hygiene** — unique project names, doc updates, CLI fixes (#1028)
- **Dead code removal** — remove dead `execMarketplaceTrialExpiry` handler (#1009)

## [0.27.0] - 2026-03-13

### Added
- **Cloud model families & tier boosting** — support cloud model family grouping and tier-based model selection (#1005)
- **Auto-clone projects** — automatically clone projects to temp/worktree directories on demand (#1004)
- **Ollama exam persistence** — persist model exam results to SQLite for tracking cloud model capabilities (#999)

### Fixed
- **Discord typing timeout** — reduce false typing timeout warnings (#1002)

### Documentation
- **API reference expansion** — add detailed API reference for 13 undocumented modules (#1000)

### Tests
- **+3 test suites** — coverage for DbPool, OwnerQuestionManager, and expanded ReputationScorer tests (#1003)

## [0.26.0] - 2026-03-13

### Added
- **Agent security hardening** — tier-based agent permissions (untrusted/standard/trusted/admin), per-agent session limits, and input sanitization (#986)
- **RBAC role templates** — pre-built role templates for agent permission provisioning (#979)
- **Typed WebSocket messages** — enforce typed `ServerMessage` emission in WS broadcasting (#957, #972)
- **Git worktree session isolation** — isolate chat sessions with dedicated git worktrees, including Discord `/session` command (#983, #1096)
- **Flock Directory heartbeat** — periodic heartbeat and stale sweep for on-chain agent directory (#903, #961)
- **RC checklist expansion** — 9 additional gating criteria checks for v1.0.0-rc (#310, #977)

### Security
- **Ephemeral HMAC key** — replace hardcoded HMAC fallback with ephemeral random key (#982)
- **Plaintext wallet key removal** — eliminate plaintext wallet key escape hatch entirely (#924, #973)
- **Branch protection** — enable branch protection on main branch (#966)
- **CORS production warning** — repo-blocklist tenant scoping and CORS hardening (#963)
- **Permissions guard** — admin role guard for `/api/permissions` routes (#962)
- **SECURITY.md formatting** — fix formatting issues in security documentation (#976)

### Fixed
- **Discord typing indicator** — fix typing indicator liveness checks (#995)
- **Discord permission spam** — stop spamming permission denials in monitored channels (#980)
- **Discord role mentions** — respond to role mentions, not just direct bot mentions (#964)
- **Duplicate work tasks** — prevent duplicate work tasks and PRs for the same issue (#974, #978)
- **Injection false positives** — skip prompt-injection false positives in markdown code spans (#960)
- **SQLite transactions** — convert remaining DEFERRED transactions to BEGIN IMMEDIATE (#959)
- **Key rotation mock** — fix mock readKeystore in key rotation test (#970)
- **Silent catches** — add debug logging to silent fire-and-forget catch handlers (#975)

### Tests
- **+209 new tests** — expanded coverage for 5 untested modules (+67), worktree isolation, role templates, work task dedup, tenant route tests (#971, #978, #979, #983, #994)

### Documentation
- **API module docs** — add 8 undocumented API modules and fix stale refs (#993)
- **README + API sync** — sync README and API reference with current codebase (#968)
- **TaskQueueService spec** — document exports for TaskQueueService module (#969)
- **Module specs** — add specs for bash-security, code-scanner, fetch-detector, github-searcher (#997)

### Stats
- **6,655** unit tests across 278 files (18,335 assertions)
- **360** E2E tests across 31 Playwright specs
- **127** module specs with automated validation
- **41** MCP tools, **~300** API endpoints, **44** route modules, **90** tables
- **27** commits on main

## [0.25.4] - 2026-03-11

### Added
- **TaskQueueService** — parallel work task dispatch with configurable concurrency (#951)
- **Flock Directory specs** — module specs for on-chain client and service (#952)
- **Discord autocomplete** — agent and project choice autocomplete for Discord commands (#954)

### Fixed
- **Silent catches** — add debug logging to silent catch blocks in Discord thread-manager (#955)

### Security
- **Wallet validation** — validate Algorand address format on all wallet routes (#953)

## [0.25.3] - 2026-03-11

### Fixed
- **Install script** — read user input from /dev/tty so prompts work when piped via curl (#944, #949)

## [0.25.2] - 2026-03-11

### Fixed
- **Discord typing indicator** — add safety timeout to prevent typing indicator interval leaks (#947)
- **GitHub mention allowlist** — bypass allowlist for assignment-type GitHub mentions (#946)
- **Process exit errors** — pass error details through process exit to session messages (#945)
- **Discord mentions** — resolve Discord mentions to @username in message text (#942)

### Chore
- **Test coverage** — coverage expansion for response, builtin middleware, key rotation (#943)

## [0.25.1] - 2026-03-11

### Fixed
- **Discord typing indicator** — keep typing indicator alive during AI warm-up with continuous 8-second interval refresh (#940)

## [0.25.0] - 2026-03-11

### Security
- **KMS migration enforcement** — encrypted in-memory key cache, startup enforcement requiring KMS migration, key access audit logging with 18 new tests (#931)
- **Hono CVE override** — update hono override to >=4.12.7 for CVE GHSA-v8w9-8mx6-g223 (#934)
- **Admin role guard** — add admin role guard to repo-blocklist routes (#930)

### Fixed
- **Ollama cloud model serialization** — cloud models get `maxWeight` in the slot system to force serialization and prevent proxy timeouts (#937)
- Hide admin Discord commands from non-admin users (#921)

### Changed
- **Discord bridge decomposition** — decompose `discord/bridge.ts` from 2,688 to 367 lines (#933)

### Added
- RC verification script and mainnet config template (#917)
- Spec documentation for polling modules: auto-merge, auto-update, ci-retry (#936)

### Chore
- Align `@opentelemetry/exporter-prometheus` to 0.213.0 (#922)
- Sync MCP tools, migration count, and directory structure in docs (#935)

## [0.24.2] - 2026-03-10

### Fixed
- Hide admin-only Discord commands (`/admin`, `/council`, `/mute`, `/unmute`) from non-admin users via `default_member_permissions` (#921)

## [0.24.1] - 2026-03-10

### Fixed
- Remove unused `execSync` and `existsSync` imports from `bin/corvid-agent.mjs` (#919)
- Add CodeQL config to exclude auto-generated `*.generated.ts` files from static analysis (#919)

## [0.24.0] - 2026-03-10

### Added
- **Discord `/admin` commands** — manage bot configuration directly from Discord using native mentions. Subcommands: `channels add/remove/list` (#channel mentions), `users add/remove/list` (@user mentions), `roles set/remove/list` (@role mentions with permission level dropdown), `mode` (chat/work_intake toggle), `public` (role-based access toggle), `show` (full config summary). All mutations audit-logged and persisted to `discord_config` table with 30s hot-reload
- **Discord `/work` command** — fire-and-forget work task creation from Discord with rich embed confirmations, @mention notifications on completion/failure, and PR link delivery
- **AlgoChat `/work` improvements** — `--project` flag for project targeting, clear status indicators, PR URL in completion messages
- **Project discovery MCP tools** — `corvid_list_projects` and `corvid_current_project` tools for agent project awareness
- **RC verification script** — `scripts/verify-rc.sh` for release candidate validation and mainnet config template

### Changed
- **Discord bridge spec v8** — `/admin` command fully documented with subcommand groups, recursive `DiscordInteractionOption` type
- **AlgoChat commands spec v2** — `--project` flag, behavioral examples for project resolution

### Tests
- 20 new tests for `/admin` command handlers (channels, users, roles, mode, public, show)
- Discord `/work` and AlgoChat `/work` spec coverage

### Stats
- **6,347** unit tests across 262 files (17,499 assertions)
- **360** E2E tests across 31 Playwright specs
- **115** module specs with automated validation (0 warnings)
- **41** MCP tools, **~205** API endpoints, **44** route modules, **90** tables
- **4** commits, **2** PRs merged this release

## [0.23.2] - 2026-03-10

### Fixed
- Persist Discord interacted users to DB across restarts (#914)

## [0.23.1] - 2026-03-10

### Fixed
- Remove eyes reaction on Discord message receipt to reduce noise (#912)

## [0.23.0] - 2026-03-10

### Added
- **Discord onboarding** — guided setup flow for new users with welcome embeds, server configuration wizard, and role assignment (#890, #910)
- **Discord dynamic configuration** — DB-backed config for Discord settings (channel modes, auto-archive, rate limits) with hot-reload via settings API (#909)
- **Hybrid FlockDirectoryService** — on-chain sync for Flock Directory with local cache fallback (#902, #907)

### Fixed
- Grant `contents:write` permission to docker-publish workflow for SBOM release asset attachment (#908)

### Tests
- Coverage for scheduler orchestration and marketplace subscriptions (#906)

### Stats
- **6,327** unit tests across 261 files (17,461 assertions)
- **360** E2E tests across 31 Playwright specs
- **116** module specs with automated validation
- **39** MCP tools, **~205** API endpoints, **44** route modules, **90** tables
- **5** commits, **5** PRs merged this release

## [0.22.0] - 2026-03-10

### Added
- **Marketplace ecosystem** — tiered pricing plans (#842), per-use credit billing (#800), verification badges and quality gates (#851), free trial periods (#873), usage metering and analytics (#854)
- **Flock Directory** — on-chain agent registry with MCP tool and API (#806), ARC56 contract client (#901)
- **Governance v2 frontend** — vote panel and governance service UI (#802), real-time WebSocket vote events (#846)
- **MCP expansion** — standalone corvid-agent-mcp server package (#815), agent-agnostic MCP support for Cursor, Copilot, and OpenCode (#843), VibeKit smart contract integration (#839), skills-as-markdown for AI assistant discovery (#838)
- **Work task priority queue** — preemption support for higher-priority tasks (#816)
- **Branch protection** — enforce branch protection on main branch (#808)
- **Enhanced init** — `corvid-agent init` with `--mcp`, `--yes`, and auto-clone (#837)
- **WebSocket shared type layer** — shared types between server and client (#870)
- **Discord public channel mode** — role-based access control, multi-channel support, smart message splitting, typing indicators, and stale thread auto-archiving (#899)

### Security
- **Injection hardening** — unicode bypass detection, API route scanning, and prompt leakage prevention (#875)
- **Rate-limit device auth** — rate-limit device auth flow endpoints (#868)

### Refactored
- Extract MessageTransport interface for bridge swappability (#871)
- Module boundary decomposition step 1: split shared/types.ts (#814)
- Spec strict CI gate enforcement (#805)
- Squash migrations into single baseline for faster fresh installs (#872)

### Fixed
- Keep direct-process sessions alive for multi-turn conversations (#900)
- Refresh Discord slash commands on agent CRUD (#879)
- Document undocumented exports in marketplace billing (#801) and connection spec (#867)
- Log errors in broadcast listener callbacks instead of silently swallowing (#850)
- CI: auto-regenerate bun.lock on Dependabot PRs (#847, #848, #849, #853, #856)

### Documentation
- System requirements and RAM benchmarks (#840)
- Improved landing page messaging and onboarding (#836)
- "Most tested AI agent platform" positioning (#844)
- Blog page on GitHub Pages site (#876)
- Expanded API reference with agent, session, schedule, and work-task details (#813)
- Spec coverage for algochat/init and repo-blocklist handler (#818)
- Sync stale stats across README and deep-dive (#885, #897)

### Tests
- Route integration tests for flock-directory endpoints (#888)
- Route integration tests for governance proposals (#812)
- Route tests for permissions, mention-polling, performance, and health (#820)
- Protected-paths and shutdown-coordinator module specs (#811)

### Stats
- **6,215** unit tests across 255 files (17,166 assertions)
- **360** E2E tests across 31 Playwright specs
- **116** module specs with automated validation
- **39** MCP tools, **~205** API endpoints, **44** route modules, **88** tables
- **57** commits, **~42** PRs merged this release

## [0.21.0] - 2026-03-08

### Added
- **Work pipeline v2** — parallel execution, task dependencies, and retry policies for work tasks (#793, #632)
- **Governance v2** — proposals with weighted voting, quorum rules, and proposal lifecycle (#789, #633)
- **Encryption at rest** — encrypt env_vars using AES-256-GCM (#791)
- **Container sandboxing** — integrate SandboxManager into ProcessManager with resource limits and network isolation (#786, #382)
- **KeyProvider abstraction** — wallet encryption via pluggable KeyProvider interface (#772, #383)
- **Bridge delivery receipts** — message delivery receipt tracking for bridge hardening (#780, #631)
- **Security Overview dashboard** — new dashboard page showing live security posture (#779)
- **Stats automation** — automated stats collection and drift detection (#792, #537)
- **GH_TOKEN scope validation** — OAuth scope validation on server startup (#787)
- **Discord passive channel mode** — threads via `/session` only, no unsolicited replies (#761)
- **Council Discord notifications** — post council synthesis to Discord on completion (#766)
- **Real-time session status** — live thinking/tool_use status with silent death prevention (#775)
- **Telegram bridge hardening** — poll backoff and message deduplication (#762)

### Security
- **Error message sanitization** — sanitize error messages in WS and AlgoChat handlers to prevent info leakage (#763)
- **Auto-merge hardened** — security scan now comments instead of closing PRs, preventing accidental PR destruction (#784)

### Fixed
- Document undocumented exports in security, infra, and marketplace specs (#790, #801)
- Prevent duplicate Discord messages and normalize coding-tool paths (#788)
- Relax protected files and stop auto-closing PRs (#784)
- Remove duplicate properties in playwright config (#770)
- Discord slash commands failing due to interaction token too short (#765)
- Eliminate `any` types in subscription manager tests (#744)

### Refactored
- Extract Discord gateway into dedicated module (#769)
- Extract scheduler service into handler modules (#759)

### Tests
- Wait-sessions, tenant middleware, and plugin permissions coverage (#773)

### Documentation
- API reference for workflows, councils, marketplace, reputation, and billing routes (#798)
- TaskQueue design doc — prerequisite for work pipeline (#771)
- Document all 17 remaining undocumented exports (#768)
- Sync stale stats across README and doc files (#767)
- Discord passive channel mode spec (#760)

### Cross-Repo
- **corvid-agent-chat:** toast, chat-messages, search coverage (+69 tests, #58); split chat.ts view (#57); device-name and wallet lifecycle coverage (+51, #56); wallet idle lock (#55); icon sizing fixes (#49, #52, #54)
- **specl:** WelcomeComponent tests (#74); GitHubOAuthService and FrontmatterEditor coverage (+26, #73); wildcard route redirect (#72); missing spec.md files (#68)
- **corvid-reputation:** standardize git author identity in generate workflow (#1)

### Stats
- **5,838** unit tests across 237 files (16,222 assertions)
- **360** E2E tests across 31 Playwright specs
- **113** module specs with automated validation
- **38** MCP tools, **~200** API endpoints, **42** route modules, **82** tables
- **29** commits, **13** PRs merged this release

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
