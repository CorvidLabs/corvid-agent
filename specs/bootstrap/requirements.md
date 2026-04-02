---
spec: bootstrap.spec.md
---

## User Stories

- As a developer, I want all services constructed in one place so I can understand the dependency graph
- As an operator, I want consistent service initialization so startup is predictable
- As a tester, I want to bootstrap services with mocks so I can test in isolation

## Acceptance Criteria

- `bootstrapServices` accepts `db`, `processManager`, and optional `algoChatServices` parameters
- All major services are constructed: ProcessManager, SchedulerService, WorkTaskService, NotificationService, WebhookService, MentionPollingService, WorkflowService, SandboxManager, MarketplaceService, ReputationScorer, MemoryManager, DiscordBridge, TelegramBridge, SlackBridge, SelfTestService, BuddyService, DailyReviewService, AutonomousLoopService, OutcomeTrackerService, UsageMonitor
- Services with circular dependencies receive references via setter methods after construction
- Services requiring database access receive the `db` parameter
- Services requiring process manager receive the `processManager` parameter
- AlgoChat-dependent services (AgentMessenger, AgentDirectory) receive pre-initialized instances
- All bridges (Discord, Telegram, Slack) are constructed with their respective configurations
- Function returns `Services` object containing all constructed service instances
- No service is started during bootstrap — only constructed and wired

## Constraints

- Must not contain business logic — only construction and wiring
- Must handle optional AlgoChat services gracefully (can be undefined if AlgoChat not configured)
- Must maintain initialization order: core services first, dependent services after
- Cannot access environment variables directly — all config passed in

## Out of Scope

- Service start/stop lifecycle (handled by caller)
- Configuration loading (handled before bootstrap)
- Database connection establishment (connection passed in)
- HTTP server setup (separate concern)
