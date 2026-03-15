---
module: infra
version: 1
status: draft
files:
  - server/lib/logger.ts
  - server/lib/env.ts
  - server/lib/errors.ts
  - server/lib/response.ts
  - server/lib/validation.ts
db_tables: []
depends_on: []
---

# Infra

## Purpose

Core infrastructure utilities providing structured logging, environment safety, typed error hierarchy, HTTP response helpers, and Zod-based request validation schemas used across all server modules.

## Public API

### Exported Functions

#### logger.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createLogger` | `module: string` | `Logger` | Creates a structured logger instance scoped to the given module name. Supports JSON (production) and text (development) output formats controlled by `LOG_FORMAT` and `NODE_ENV` env vars. Minimum level controlled by `LOG_LEVEL`. |

#### env.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildSafeGhEnv` | _(none)_ | `Record<string, string>` | Builds an allowlisted environment variable map safe for `gh` CLI subprocesses, preventing leakage of API keys, mnemonics, and secrets. |

#### errors.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `isAppError` | `err: unknown` | `err is AppError` | Type guard that checks if a value is an instance of `AppError`. |

#### response.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `json` | `data: unknown, status?: number` | `Response` | Returns a JSON `Response` with the given HTTP status (default 200). |
| `badRequest` | `message: string` | `Response` | Returns a 400 Bad Request JSON error response. |
| `notFound` | `message: string` | `Response` | Returns a 404 Not Found JSON error response. |
| `unavailable` | `message: string` | `Response` | Returns a 503 Service Unavailable JSON error response. |
| `serverError` | `err: unknown` | `Response` | Returns a generic 500 Internal Server Error JSON response. Logs full error details server-side but never exposes them to the client. |
| `errorMessage` | `err: unknown` | `string` | Extracts a human-readable error message from an unknown thrown value. |
| `safeNumParam` | `value: string \| null, defaultValue: number` | `number` | Safely parses a numeric query parameter, returning the default if NaN or missing. |
| `handleRouteError` | `err: unknown` | `Response` | Standard route error handler. Maps `AppError` subclasses to correct HTTP status and consistent JSON body `{ error, code }`. Falls back to 500 for unknown errors. Includes `retryAfter` for `RateLimitError`. |

#### validation.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseBodyOrThrow` | `req: Request, schema: T extends z.ZodType` | `Promise<z.infer<T>>` | Parses and validates a JSON request body against a Zod schema. Throws `ValidationError` on failure. |
| `parseBody` | `req: Request, schema: T extends z.ZodType` | `Promise<{ data: z.infer<T> \| null; error: string \| null }>` | Safe variant of `parseBodyOrThrow`. Returns `{ data, error }` instead of throwing. |
| `parseQuery` | `params: Record<string, string \| null>, schema: T extends z.ZodType` | `{ data: z.infer<T>; error: null } \| { data: null; error: string }` | Validates query/search params (plain object) against a Zod schema. |
| `isAlgorandAddressFormat` | `(address: string)` | `boolean` | Synchronous format check: 58 uppercase A-Z2-7 characters. |
| `isValidAlgorandAddress` | `(address: string)` | `Promise<boolean>` | Full async validation with checksum via algosdk, falls back to format check. |

### Exported Constants

#### validation.ts
| Constant | Type | Description |
|----------|------|-------------|
| `AlgorandAddressSchema` | `z.ZodEffects<z.ZodString>` | Zod schema that trims, uppercases, and validates Algorand address format (58-char base32). |

### Exported Types

#### logger.ts
| Type | Description |
|------|-------------|
| `Logger` | Interface with `debug`, `info`, `warn`, `error` methods (each accepting `msg: string, ctx?: Record<string, unknown>`) and a `child(module: string): Logger` method for creating sub-loggers. |

### Exported Classes

#### errors.ts
| Class | Description |
|-------|-------------|
| `AppError` | Base error class. Carries `code: string`, `statusCode: number`, and optional `context: Record<string, unknown>`. Supports `cause` chaining. |
| `ValidationError` | 400 — `code: 'VALIDATION_ERROR'`. Has additional `detail: string` field. |
| `AuthenticationError` | 401 — `code: 'AUTHENTICATION_ERROR'`. |
| `AuthorizationError` | 403 — `code: 'AUTHORIZATION_ERROR'`. |
| `NotFoundError` | 404 — `code: 'NOT_FOUND'`. Constructor accepts `resource: string, id?: string`. |
| `ConflictError` | 409 — `code: 'CONFLICT'`. |
| `RateLimitError` | 429 — `code: 'RATE_LIMITED'`. Has optional `retryAfter: number` field. |
| `NotImplementedError` | 501 — `code: 'NOT_IMPLEMENTED'`. Constructor accepts `feature: string, context?: string`. |
| `ExternalServiceError` | 502 — `code: 'EXTERNAL_SERVICE_ERROR'`. Constructor accepts `service: string, message: string`. Auto-includes `service` in context. |

### Exported Zod Schemas (validation.ts)

| Schema | Domain | Description |
|--------|--------|-------------|
| `CreateProjectSchema` | Projects | Validates project creation: `name`, `workingDir` (required), optional `description`, `allowedTools`, `customInstructions`, `mcpServers`. |
| `UpdateProjectSchema` | Projects | Validates project update. At least one field required. |
| `CreateAgentSchema` | Agents | Validates agent creation: `name` (required), optional `model`, `provider`, `systemPrompt`, `appendPrompt`, `allowedTools`, `disallowedTools`, `permissionMode`, `maxBudgetUsd`, `algochatEnabled`, `algochatAuto`, `customFlags`, `defaultProjectId`, `mcpToolPermissions`, `voiceEnabled`, `voicePreset`. |
| `UpdateAgentSchema` | Agents | Validates agent update. All fields optional. |
| `FundAgentSchema` | Agents | Validates funding: `microAlgos` (1000..100_000_000). |
| `SetSpendingCapSchema` | Agents | Validates spending cap: `dailyLimitMicroalgos`, optional `dailyLimitUsdc`. |
| `InvokeAgentSchema` | Agents | Validates agent invocation: `toAgentId`, `content` (required), optional `paymentMicro`, `projectId`. |
| `CreateSessionSchema` | Sessions | Validates session creation: `projectId` (required), optional `agentId`, `name`, `initialPrompt`, `councilLaunchId`, `councilRole`. |
| `UpdateSessionSchema` | Sessions | Validates session update: optional `name`, `status`. |
| `ResumeSessionSchema` | Sessions | Validates session resume: optional `prompt`. Defaults to empty object. |
| `CreateCouncilSchema` | Councils | Validates council creation: `name`, `agentIds` (required non-empty array), optional `description`, `chairmanAgentId`, `discussionRounds`. |
| `UpdateCouncilSchema` | Councils | Validates council update. All fields optional. |
| `LaunchCouncilSchema` | Councils | Validates council launch: `projectId`, `prompt` (required). |
| `CouncilChatSchema` | Councils | Validates council chat message: `message` (required). |
| `CreateWorkTaskSchema` | Work Tasks | Validates work task creation: `agentId`, `description` (required), optional `projectId`, `source`, `sourceId`, `requesterInfo`. |
| `AddAllowlistSchema` | Allowlist | Validates allowlist add: `address` (required), optional `label`. |
| `UpdateAllowlistSchema` | Allowlist | Validates allowlist update: `label` (required). |
| `AddGitHubAllowlistSchema` | GitHub Allowlist | Validates GitHub allowlist add: `username` (validated against GitHub format), optional `label`. |
| `UpdateGitHubAllowlistSchema` | GitHub Allowlist | Validates GitHub allowlist update: `label` (required). |
| `McpSendMessageSchema` | MCP API | Validates MCP message send: `agentId`, `toAgent`, `message` (all required). |
| `McpSaveMemorySchema` | MCP API | Validates MCP memory save: `agentId`, `key`, `content` (all required). |
| `McpRecallMemorySchema` | MCP API | Validates MCP memory recall: `agentId` (required), optional `key`, `query`. |
| `EscalationResolveSchema` | Misc | Validates escalation resolution: `approved` (boolean required). |
| `OperationalModeSchema` | Misc | Validates operational mode: `mode` (enum: `normal`, `queued`, `paused`). |
| `SelfTestSchema` | Misc | Validates self-test: optional `testType` (default `all`). |
| `SwitchNetworkSchema` | Misc | Validates network switch: `network` (enum: `testnet`, `mainnet`). |
| `OllamaPullModelSchema` | Ollama | Validates Ollama pull: `model` (required). |
| `OllamaDeleteModelSchema` | Ollama | Validates Ollama delete: `model` (required). |
| `CreateScheduleSchema` | Schedules | Validates schedule creation with actions, cron/interval/trigger, approval policy. Requires at least one of `cronExpression`, `intervalMs`, or `triggerEvents`. |
| `UpdateScheduleSchema` | Schedules | Validates schedule update. All fields optional. |
| `ScheduleApprovalSchema` | Schedules | Validates schedule approval: `approved` (boolean required). |
| `BulkScheduleActionSchema` | Schedules | Validates bulk schedule action: `action` (pause/resume/delete), `ids` (1..50). |
| `CreateWebhookRegistrationSchema` | Webhooks | Validates webhook registration: `agentId`, `repo` (owner/name format), `events`, `mentionUsername` (all required). |
| `UpdateWebhookRegistrationSchema` | Webhooks | Validates webhook update. All fields optional. |
| `CreateMentionPollingSchema` | Mention Polling | Validates mention polling setup: `agentId`, `repo`, `mentionUsername` (required), optional `projectId`, `intervalSeconds` (30..3600), `eventFilter`, `allowedUsers`. |
| `UpdateMentionPollingSchema` | Mention Polling | Validates mention polling update. All fields optional. |
| `CreateWorkflowSchema` | Workflows | Validates workflow creation with typed nodes and edges. Must have at least one `start` node. |
| `UpdateWorkflowSchema` | Workflows | Validates workflow update. All fields optional. |
| `TriggerWorkflowSchema` | Workflows | Validates workflow trigger: optional `input` record. |
| `WorkflowRunActionSchema` | Workflows | Validates workflow run action: `action` (pause/resume/cancel). |
| `CreateListingSchema` | Marketplace | Validates marketplace listing creation: `agentId`, `name`, `description`, `category` (required). |
| `UpdateListingSchema` | Marketplace | Validates marketplace listing update. All fields optional. |
| `CreateReviewSchema` | Marketplace | Validates review creation: `rating` (1..5), `comment` (required). |
| `RegisterFederationInstanceSchema` | Marketplace | Validates federation instance: `url`, `name` (required). |
| `SubscribeSchema` | Marketplace | Validates marketplace subscription: `subscriberTenantId` (required), `billingCycle` (daily/weekly/monthly). |
| `CancelSubscriptionSchema` | Marketplace | Validates subscription cancellation: `subscriberTenantId` (required). |
| `CreateTierSchema` | Marketplace | Validates pricing tier creation: `name`, `priceCredits` (required), optional `description`, `billingCycle`, `rateLimit`, `features`, `sortOrder`. |
| `UpdateTierSchema` | Marketplace | Validates pricing tier update. All fields optional. |
| `TierUseSchema` | Marketplace | Validates tier use: `tierId` (required). |
| `TierSubscribeSchema` | Marketplace | Validates tier subscription: `tierId`, `subscriberTenantId` (required). |
| `StartTrialSchema` | Marketplace | Validates trial start: `tenantId` (required). |
| `RecordReputationEventSchema` | Reputation | Validates reputation event: `agentId`, `eventType`, `scoreImpact` (required). |
| `CreateSubscriptionSchema` | Billing | Validates subscription creation: `tenantId`, `stripeSubscriptionId`, `plan`, `periodStart`, `periodEnd` (required). |
| `UpsertPersonaSchema` | Personas | Validates persona upsert: optional `archetype`, `traits` (max 20), `voiceGuidelines`, `background`, `exampleMessages` (max 10). |
| `CreateSkillBundleSchema` | Skill Bundles | Validates skill bundle creation: `name` (required), optional `description`, `tools` (max 50), `promptAdditions`. |
| `UpdateSkillBundleSchema` | Skill Bundles | Validates skill bundle update. All fields optional. |
| `AssignSkillBundleSchema` | Skill Bundles | Validates skill bundle assignment: `bundleId` (required), optional `sortOrder`. |
| `AddRepoBlocklistSchema` | Repo Blocklist | Validates repo blocklist add: `repo` (required, `owner/name` format). |
| `CreateMcpServerConfigSchema` | MCP Server Configs | Validates MCP server config creation: `name`, `command` (required), optional `agentId`, `args`, `envVars`, `cwd`, `enabled`. |
| `UpdateMcpServerConfigSchema` | MCP Server Configs | Validates MCP server config update. All fields optional. |
| `SendA2ATaskSchema` | A2A | Validates A2A task: `message` required at top-level or inside `params`. |
| `UpdateCreditConfigSchema` | Settings | Validates credit config update. Strict object; at least one key required. |
| `LoadPluginSchema` | Plugins | Validates plugin load: `packageName` (required), optional `autoGrant`. |
| `PluginCapabilityActionSchema` | Plugins | Validates plugin capability action: `capability` (enum of granted capabilities). |
| `SetSandboxPolicySchema` | Sandbox | Validates sandbox policy: optional `cpuLimit`, `memoryLimitMb`, `networkPolicy`, `timeoutSeconds`. |
| `AssignSandboxSchema` | Sandbox | Validates sandbox assignment: `agentId`, `sessionId` (required), optional `workDir`. |
| `DeviceTokenSchema` | Auth Flow | Validates device token: `deviceCode` (required). |
| `DeviceAuthorizeSchema` | Auth Flow | Validates device authorization: `userCode`, `tenantId`, `email`, `approve` (all required). |
| `PSKContactNicknameSchema` | PSK Contacts | Validates PSK contact: `nickname` (required). |
| `CreditGrantSchema` | Wallet Credits | Validates credit grant: `amount` (positive finite number), optional `reference`. |
| `CastVoteSchema` | Councils | Validates council vote: `agentId` (required), `vote` (approve/reject/abstain), optional `reason`. |
| `HumanApprovalSchema` | Councils | Validates human approval: `approvedBy` (required). |
| `CreateProposalSchema` | Governance Proposals | Validates proposal creation: `councilId`, `title`, `authorId` (required), optional `description`, `governanceTier` (0-2), `affectedPaths`, `quorumThreshold`, `minimumVoters`. |
| `UpdateProposalSchema` | Governance Proposals | Validates proposal update: optional `title`, `description`, `affectedPaths`, `quorumThreshold`, `minimumVoters`. |
| `TransitionProposalSchema` | Governance Proposals | Validates proposal status transition: `status` (draft/open/voting/decided/enacted required), optional `decision` (approved/rejected). |
| `StartTrialSchema` | Marketplace | Validates trial start: `tenantId` (required). |
| `SubmitFeedbackSchema` | Reputation Feedback | Validates feedback submission: `agentId` (required), `sentiment` (positive/negative required), optional `sessionId`, `source`, `category`, `comment`, `submittedBy`. |

### Re-exports (validation.ts)
| Export | Source | Description |
|--------|--------|-------------|
| `ValidationError` | `./errors` | Re-exported so existing `import { ValidationError } from '../lib/validation'` paths continue to work. |

## Invariants

1. `createLogger` respects `LOG_LEVEL` env var for minimum log level (default: `info`) and `LOG_FORMAT` / `NODE_ENV` for output format (JSON in production, text otherwise).
2. Logger `warn` and `error` write to stderr; `debug` and `info` write to stdout.
3. Logger lazily loads trace context from `../observability/trace-context` to avoid circular imports.
4. `buildSafeGhEnv` only includes vars from a hardcoded allowlist -- it never passes through arbitrary env vars.
5. All `AppError` subclasses carry a machine-readable `code` and HTTP `statusCode`; the global error handler uses these for consistent JSON responses.
6. `serverError` never exposes internal details (stack traces, error messages) to the client; it always returns a generic `"Internal server error"` message.
7. `handleRouteError` maps `AppError` instances to their `statusCode`; unknown errors fall through to `serverError` (500).
8. `parseBodyOrThrow` throws `ValidationError` on invalid JSON or schema mismatch; `parseBody` returns `{ data: null, error }` instead.
9. All Zod schemas are statically defined at module level and are immutable.
10. `ValidationError` is re-exported from `validation.ts` to maintain backward compatibility with existing import paths.

## Behavioral Examples

### Scenario: Creating a logger and logging at various levels
- **Given** `LOG_LEVEL` is set to `warn`
- **When** calling `createLogger('MyModule')` and invoking `.info('hello')` then `.error('oops')`
- **Then** the `info` message is suppressed; the `error` message is written to stderr.

### Scenario: Building a safe gh environment
- **Given** `process.env` contains `PATH`, `HOME`, `ANTHROPIC_API_KEY`, and `GH_TOKEN`
- **When** calling `buildSafeGhEnv()`
- **Then** the returned object contains `PATH`, `HOME`, `GH_TOKEN` but not `ANTHROPIC_API_KEY`.

### Scenario: Handling a route error from an AppError subclass
- **Given** a `NotFoundError('Project', 'abc123')` is thrown in a route handler
- **When** `handleRouteError` processes the error
- **Then** it returns a 404 JSON response `{ error: "Project abc123 not found", code: "NOT_FOUND" }`.

### Scenario: Validating a request body
- **Given** a `POST` request with body `{ "name": "" }`
- **When** `parseBodyOrThrow(req, CreateProjectSchema)` is called
- **Then** a `ValidationError` is thrown because `name` must be at least 1 character.

### Scenario: Safe body parsing without throwing
- **Given** a `POST` request with invalid JSON
- **When** `parseBody(req, CreateProjectSchema)` is called
- **Then** it returns `{ data: null, error: "Invalid JSON body" }` without throwing.

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown `LOG_LEVEL` env value | Falls back to `info` level. |
| `LOG_FORMAT` not `json` or `text` | Defaults based on `NODE_ENV` (json if production, text otherwise). |
| Trace context module unavailable | Logger silently continues without trace/request IDs. |
| `serverError` called with non-Error value | Converts to string for logging; still returns generic 500 response. |
| `parseBodyOrThrow` receives non-JSON body | Throws `ValidationError('Invalid JSON body')`. |
| `parseBody` encounters unexpected error | Returns `{ data: null, error: 'Invalid request' }`. |
| `handleRouteError` receives non-AppError | Delegates to `serverError` (500). |
| `RateLimitError` passed to `handleRouteError` | Response body includes `retryAfter` field if set. |

## Dependencies

### Consumes
| Module | What is used |
|--------|-------------|
| `zod` | Schema definition and validation in `validation.ts`. |
| `node:os` | `hostname()` in `logger.ts`. |
| `../observability/trace-context` | Lazy-loaded `getTraceId` and `getRequestId` for structured log correlation. |

### Consumed By
| Module | What is used |
|--------|-------------|
| All route handlers | `json`, `badRequest`, `notFound`, `unavailable`, `serverError`, `handleRouteError`, `safeNumParam`, `errorMessage` from `response.ts`; validation schemas and `parseBody`/`parseBodyOrThrow`/`parseQuery` from `validation.ts`. |
| All server modules | `createLogger` from `logger.ts` for structured logging. |
| `server/lib/resilience.ts` | `AppError` as base class for `CircuitOpenError`. |
| `server/lib/web-search.ts` | `ExternalServiceError` from `errors.ts`, `createLogger` from `logger.ts`. |
| `server/lib/shutdown-coordinator.ts` | `createLogger` from `logger.ts`. |
| `server/process/*` | Error classes for typed error handling in session lifecycle. |
| `server/middleware/*` | Error classes for auth/authorization rejections. |
| Subprocess spawning code | `buildSafeGhEnv` from `env.ts` for safe `gh` CLI invocation. |

## Change Log
| Date | Author | Change |
|------|--------|--------|
| 2026-03-04 | corvid-agent | Initial spec |
| 2026-03-08 | corvid-agent | Documented `CastVoteSchema` and `HumanApprovalSchema` Zod schemas |
