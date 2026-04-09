---
module: bootstrap
version: 1
status: draft
files:
  - server/bootstrap.ts
db_tables: []
depends_on:
  - specs/process/process-manager.spec.md
  - specs/process/session-lifecycle.spec.md
  - specs/db/agents/memory-sync.spec.md
  - specs/algochat/bridge.spec.md
  - specs/algochat/config.spec.md
  - specs/buddy/service.spec.md
  - specs/usage/usage.spec.md
  - specs/workflow/service.spec.md
  - specs/notifications/service.spec.md
  - specs/marketplace/service.spec.md
  - specs/reputation/scorer.spec.md
  - specs/telegram/bridge.spec.md
  - specs/discord/bridge.spec.md
  - specs/slack/bridge.spec.md
  - specs/tenant/tenant.spec.md
---

# Bootstrap

## Purpose

Service composition root that constructs and wires all application services. Centralizes dependency injection to keep the main entry point thin and readable. Creates service instances but does not start them — lifecycle management is the caller's responsibility.

## Public API

### Exported Interfaces

| Interface | Description |
|-----------|-------------|
| `AlgoChatState` | Container for AlgoChat-related services (bridge, messenger, directory, wallet service) — all optional |
| `ServiceContainer` | Complete set of all bootstrapped services returned to caller |

### ServiceContainer Properties

| Property | Type | Description |
|----------|------|-------------|
| `processManager` | `ProcessManager` | Core process/session management |
| `sessionLifecycleManager` | `SessionLifecycleManager` | Session lifecycle tracking |
| `sessionCheerleadingDetector` | `SessionCheerleadingDetector` | Detects repetitive/agentic patterns |
| `ollamaStallEscalator` | `OllamaStallEscalator` | Handles Ollama timeout escalation |
| `memorySyncService` | `MemorySyncService` | Syncs memories between tiers |
| `memoryGraduationService` | `MemoryGraduationService` | Graduates short-term to long-term |
| `librarySyncService` | `LibrarySyncService` | Syncs shared library entries |
| `selfTestService` | `SelfTestService` | Self-testing capabilities |
| `workTaskService` | `WorkTaskService` | Work task management |
| `buddyService` | `BuddyService` | Buddy pairing management |
| `taskQueueService` | `TaskQueueService` | Task queue management |
| `schedulerService` | `SchedulerService` | Cron/interval scheduling |
| `usageMonitor` | `UsageMonitor` | Usage tracking and alerting |
| `webhookService` | `WebhookService` | Webhook delivery |
| `mentionPollingService` | `MentionPollingService` | Mention polling from Discord |
| `workflowService` | `WorkflowService` | Workflow execution |
| `notificationService` | `NotificationService` | Multi-channel notifications |
| `questionDispatcher` | `QuestionDispatcher` | Routes questions to channels |
| `responsePollingService` | `ResponsePollingService` | Polls for responses |
| `sandboxManager` | `SandboxManager` | Sandbox lifecycle |
| `sandboxLifecycleAdapter` | `SandboxLifecycleAdapter` | Adapts sandbox to process manager |
| `marketplaceService` | `MarketplaceService` | Marketplace listings |
| `marketplaceFederation` | `MarketplaceFederation` | Cross-instance federation |
| `reputationScorer` | `ReputationScorer` | Reputation calculation |
| `reputationAttestation` | `ReputationAttestation` | Reputation attestations |
| `reputationVerifier` | `ReputationVerifier` | Verifies reputation |
| `memoryManager` | `MemoryManager` | Memory management |
| `autonomousLoopService` | `AutonomousLoopService` | Autonomous improvement |
| `outcomeTrackerService` | `OutcomeTrackerService` | Tracks PR outcomes |
| `dailyReviewService` | `DailyReviewService` | Daily review generation |
| `telegramBridge` | `TelegramBridge` | Telegram integration |
| `discordBridge` | `DiscordBridge` | Discord integration |
| `slackBridge` | `SlackBridge` | Slack integration |
| `tenantService` | `TenantService` | Multi-tenant support |

### Exported Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `bootstrapServices` | `(db: Database, startTime: number)` | `Promise<ServiceContainer>` | Constructs and wires all services |

## Invariants

1. All services are constructed in dependency order — no service receives an uninitialized dependency.
2. Services requiring the database receive the same `db` instance passed to bootstrap.
3. AlgoChat services are optional — bootstrap succeeds even if AlgoChat is not configured.
4. No service is started during bootstrap — only constructed and wired.
5. Bridges (Discord, Telegram, Slack) are constructed but not connected.
6. The returned `ServiceContainer` contains all service instances ready for lifecycle management.

## Behavioral Examples

### Scenario: Successful bootstrap with full AlgoChat
- **Given** database connection established, AlgoChat configured
- **When** `bootstrapServices(db, Date.now())` is called
- **Then** returns ServiceContainer with all 30+ services constructed

### Scenario: Bootstrap without AlgoChat
- **Given** database connection, no AlgoChat configuration
- **When** `bootstrapServices(db, Date.now())` is called
- **Then** returns ServiceContainer with AlgoChat-related properties undefined, other services constructed normally

### Scenario: Service dependency resolution
- **Given** ProcessManager requires SessionLifecycleManager
- **When** services are bootstrapped
- **Then** SessionLifecycleManager is constructed before ProcessManager and passed to it

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Database connection invalid | Throws error (database validation happens before bootstrap) |
| Circular dependency | JavaScript/TypeScript runtime error on initialization |
| Service constructor throws | Bootstrap fails, error propagates to caller |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `process` | ProcessManager, SessionLifecycleManager, SessionCheerleadingDetector, OllamaStallEscalator |
| `db` | MemorySyncService |
| `memory` | MemoryGraduationService, LibrarySyncService, MemoryManager |
| `algochat` | Bridge, AgentMessenger, AgentDirectory, AgentWalletService |
| `selftest` | SelfTestService |
| `work` | WorkTaskService, TaskQueueService |
| `buddy` | BuddyService |
| `scheduler` | SchedulerService |
| `usage` | UsageMonitor |
| `webhooks` | WebhookService |
| `polling` | MentionPollingService |
| `workflow` | WorkflowService |
| `notifications` | NotificationService, QuestionDispatcher, ResponsePollingService |
| `sandbox` | SandboxManager, SandboxLifecycleAdapter |
| `marketplace` | MarketplaceService, MarketplaceFederation |
| `reputation` | ReputationScorer, ReputationAttestation, ReputationVerifier |
| `improvement` | AutonomousLoopService, DailyReviewService |
| `feedback` | OutcomeTrackerService |
| `telegram` | TelegramBridge |
| `discord` | DiscordBridge |
| `slack` | SlackBridge |
| `tenant` | TenantService |

### Consumed By

| Module | What is used |
|--------|-------------|
| `server/index.ts` | Calls `bootstrapServices` to initialize all services before starting HTTP server |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-31 | corvid-agent | Initial spec |
