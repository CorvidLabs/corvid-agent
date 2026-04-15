---
spec: bootstrap.spec.md
sources:
  - server/bootstrap.ts
---

## Layout

The bootstrap module is a single file: `server/bootstrap.ts`. It is the composition root for all application services and is called once during server startup by `server/index.ts`.

```
server/
  bootstrap.ts   — bootstrapServices(db, startTime): Promise<ServiceContainer>
  index.ts       — calls bootstrapServices, then starts HTTP/WS server
```

## Components

### bootstrapServices(db, startTime)
The single exported function. Construction happens in dependency order:

**Tier 1 — Core infrastructure (no inter-service deps)**
- `ProcessManager` — central session/process lifecycle
- `SessionLifecycleManager` — session state tracking
- `SessionCheerleadingDetector` — pattern detection
- `OllamaStallEscalator` — timeout handling for Ollama

**Tier 2 — Data services (depend on db)**
- `MemorySyncService`, `MemoryGraduationService`, `LibrarySyncService`

**Tier 3 — Feature services (depend on Tier 1/2)**
- `SelfTestService`, `WorkTaskService`, `TaskQueueService`, `BuddyService`
- `SchedulerService`, `UsageMonitor`, `WebhookService`
- `MentionPollingService`, `WorkflowService`, `NotificationService`
- `QuestionDispatcher`, `ResponsePollingService`

**Tier 4 — Platform services (depend on feature services)**
- `SandboxManager`, `SandboxLifecycleAdapter`
- `MarketplaceService`, `MarketplaceFederation`
- `ReputationScorer`, `ReputationAttestation`, `ReputationVerifier`
- `MemoryManager`, `AutonomousLoopService`, `OutcomeTrackerService`, `DailyReviewService`

**Tier 5 — Bridge services (depend on many feature services)**
- `TelegramBridge`, `DiscordBridge`, `SlackBridge`
- `TenantService`

**AlgoChat (optional)** — constructed only when AlgoChat is configured. `AlgoChatState` container holds `bridge`, `messenger`, `directory`, `agentWalletService` (all optional).

### ServiceContainer
A plain interface holding references to all constructed services. The caller (`server/index.ts`) is responsible for calling `start()` / `connect()` on services that require it. Bootstrap only constructs — it never starts.

## Tokens

No configurable constants are defined in `bootstrap.ts` itself. The function reads configuration via the services it constructs (e.g., `AlgoChatConfig` determines whether AlgoChat services are created).

## Assets

### Dependencies
`bootstrap.ts` imports from ~25 different server modules. Adding a new service requires:
1. Importing the service class
2. Constructing it in dependency order
3. Adding it to the `ServiceContainer` return value
4. Updating the `ServiceContainer` interface in the spec

### Consumed By
Only `server/index.ts` calls `bootstrapServices`. The returned `ServiceContainer` is used to wire routes, WebSocket handlers, and lifecycle hooks.
