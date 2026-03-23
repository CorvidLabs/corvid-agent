---
module: agent-utils
version: 1
status: draft
files:
  - server/lib/agent-tiers.ts
  - server/lib/delivery-tracker.ts
  - server/lib/github-token-check.ts
  - server/lib/project-dir.ts
db_tables: []
depends_on:
  - specs/lib/infra.spec.md
  - specs/lib/resilience.spec.md
---

# Agent Utils

## Purpose

Provides agent infrastructure utilities: a tier system that maps models to capability levels (iteration limits, rate caps, council participation), a delivery receipt tracker for outbound bridge messages with retry and per-platform metrics, GitHub token OAuth scope validation at startup, and a project directory resolver supporting persistent, clone-on-demand, ephemeral, and worktree strategies.

## Public API

### Exported Functions

#### agent-tiers.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getAgentTier` | `model: string` | `AgentTier` | Determines the agent tier from a model identifier. Heuristic: known API providers (Claude, OpenAI) map to `high`; cloud-suffixed models get boosted; Ollama families map to `standard` or `limited` based on family and parameter count; unknown models default to `limited`. |
| `getAgentTierConfig` | `model: string` | `AgentTierConfig` | Returns the full tier configuration for a model by resolving its tier via `getAgentTier`. |
| `getTierConfig` | `tier: AgentTier` | `AgentTierConfig` | Returns the tier configuration for a tier name directly (bypasses model detection). |
| `isCloudModel` | `name: string` | `boolean` | Returns true if the model name contains ":cloud" or ends with "-cloud". |

#### github-token-check.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `checkGitHubToken` | `token?: string, fetchFn?: (url: string, init?: RequestInit) => Promise<Response>` | `Promise<GitHubTokenCheckResult>` | Validates GH_TOKEN OAuth scopes by calling the GitHub API root endpoint. Returns scope information without blocking or throwing. Supports injectable fetch for testing. |
| `validateGitHubTokenOnStartup` | `fetchFn?: (url: string, init?: RequestInit) => Promise<Response>` | `Promise<void>` | Runs `checkGitHubToken` and logs results. Safe to call during startup — never throws or blocks. Warns on missing scopes, recognizes fine-grained tokens. |

#### project-dir.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `resolveProjectDir` | `project: Project` | `Promise<ResolvedDir>` | Resolves the effective working directory for a project based on its `dirStrategy`. Supports `persistent` (as-is), `clone_on_demand` (auto-clone/pull), `ephemeral` (fresh temp clone), and `worktree` (delegates to session-level worktree creation). |
| `cleanupEphemeralDir` | `resolved: ResolvedDir` | `Promise<void>` | Cleans up an ephemeral directory. No-op for non-ephemeral dirs. Logs warning on failure but does not throw. |

### Exported Types

#### agent-tiers.ts
| Type | Description |
|------|-------------|
| `AgentTier` | Union type: `'high' \| 'standard' \| 'limited'` -- capability tier for an agent based on its backing model. |
| `AgentTierConfig` | Full tier configuration: `tier`, `maxToolIterations`, `maxNudges`, `maxMidChainNudges`, `maxPrsPerSession`, `maxIssuesPerSession`, `maxMessagesPerSession`, `canVoteInCouncil`, `minGovernanceTier`. |

#### delivery-tracker.ts
| Type | Description |
|------|-------------|
| `DeliveryPlatform` | Union type: `'discord' \| 'telegram' \| 'slack'` -- supported external messaging platforms. |
| `DeliveryReceipt` | `{ platform: DeliveryPlatform; success: boolean; timestamp: number; error?: string; attempts: number }` -- receipt for a single delivery attempt. |
| `DeliveryMetrics` | `{ total: number; success: number; failure: number; successRate: number; recentFailures: Array<{ timestamp: number; error: string }> }` -- per-platform delivery metrics over a rolling window. |

#### github-token-check.ts
| Type | Description |
|------|-------------|
| `GitHubTokenCheckResult` | `{ configured: boolean; valid: boolean; scopes: string[]; missingScopes: string[]; fineGrained: boolean; error?: string }` -- result of GitHub token validation. |

#### project-dir.ts
| Type | Description |
|------|-------------|
| `ResolvedDir` | `{ dir: string; ephemeral: boolean; error?: string }` -- resolved working directory with ephemeral flag and optional error. |

### Exported Classes

#### delivery-tracker.ts
| Class | Description |
|-------|-------------|
| `DeliveryTracker` | Tracks delivery receipts for outbound bridge messages with per-platform metrics over a rolling 1-hour window. Supports retry via `withRetry`. |

#### DeliveryTracker Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `sendWithReceipt` | `platform: DeliveryPlatform, sendFn: () => Promise<T>, retryOptions?: RetryOptions \| false` | `Promise<{ result: T; receipt: DeliveryReceipt }>` | Sends a message with delivery tracking and optional retry. Returns both the send result and a delivery receipt. Re-throws on failure after recording the failed receipt. |
| `getMetrics` | `platform: DeliveryPlatform` | `DeliveryMetrics` | Returns delivery metrics for a single platform over the last 1-hour window. |
| `getAllMetrics` | _(none)_ | `Record<DeliveryPlatform, DeliveryMetrics>` | Returns delivery metrics for all three platforms. |
| `reset` | _(none)_ | `void` | Clears all tracked receipts. |

### Exported Functions (Singletons)

#### delivery-tracker.ts
| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getDeliveryTracker` | _(none)_ | `DeliveryTracker` | Returns the global singleton `DeliveryTracker` instance, creating it on first call. |

## Invariants

1. `getAgentTier` maps all Claude/Anthropic/OpenAI/GPT-4 model identifiers to `high` tier.
2. Cloud models (`:cloud` suffix or `-cloud` suffix) are boosted: standard-family cloud models become `high`; limited-family cloud models become `standard`.
3. Small models (parameter count < 20B detected in name) from standard families are downgraded to `limited`.
4. Large models (parameter count >= 30B detected in name) from limited or unknown families are upgraded to `standard`.
5. Unknown model families default to `limited` tier (conservative).
6. Tier configs are statically defined and immutable.
7. `DeliveryTracker` prunes receipts older than 1 hour (3,600,000ms) on every `record` call.
8. `DeliveryTracker.getMetrics` only considers receipts within the 1-hour rolling window.
9. `DeliveryTracker.recentFailures` is capped at 10 most recent failures.
10. `sendWithReceipt` uses `withRetry` for retry logic by default (2 attempts, 500ms base delay); passing `false` disables retry.
11. `sendWithReceipt` records a receipt regardless of success or failure, then re-throws the original error on failure.
12. `checkGitHubToken` never throws — all errors are caught and returned in the result object.
13. `validateGitHubTokenOnStartup` never throws — has an absolute safety-net catch block.
14. Fine-grained GitHub tokens (no `X-OAuth-Scopes` header) are accepted without scope validation.
15. Required GitHub scopes are `repo` and `read:org`.
16. `resolveProjectDir` defaults to `persistent` strategy when `dirStrategy` is not set.
17. `clone_on_demand` requires `gitUrl` on the project; falls back to `workingDir` with error if missing.
18. `ephemeral` strategy creates a temp directory and cleans up the empty dir on clone failure.
19. `cleanupEphemeralDir` is a no-op for non-ephemeral resolved dirs.
20. `worktree` strategy delegates to `persistent` at the directory level; worktree creation happens at the session level.

## Behavioral Examples

### Scenario: Claude model resolves to high tier
- **Given** a model identifier `"claude-3-opus"`
- **When** `getAgentTier` is called
- **Then** it returns `'high'`

### Scenario: Small Ollama model resolves to limited tier
- **Given** a model identifier `"llama3.1:8b"`
- **When** `getAgentTier` is called
- **Then** it returns `'limited'` (standard family but small parameter count)

### Scenario: Large unknown model resolves to standard tier
- **Given** a model identifier `"some-new-model:70b"`
- **When** `getAgentTier` is called
- **Then** it returns `'standard'` (unknown family but large parameter count)

### Scenario: Successful delivery with retry
- **Given** a `DeliveryTracker` and a send function that fails on first attempt then succeeds
- **When** `sendWithReceipt('discord', sendFn)` is called
- **Then** it returns `{ result, receipt }` with `receipt.success: true` and `receipt.attempts: 2`

### Scenario: Failed delivery records receipt and re-throws
- **Given** a `DeliveryTracker` and a send function that always throws
- **When** `sendWithReceipt('slack', sendFn)` is called
- **Then** the error is re-thrown, but a failed receipt is recorded in metrics

### Scenario: GitHub token with missing scopes
- **Given** a `GH_TOKEN` that has `repo` scope but not `read:org`
- **When** `checkGitHubToken` is called
- **Then** result has `valid: true`, `missingScopes: ['read:org']`

### Scenario: Fine-grained GitHub token
- **Given** a fine-grained personal access token (no `X-OAuth-Scopes` header returned)
- **When** `checkGitHubToken` is called
- **Then** result has `fineGrained: true`, `missingScopes: []`

### Scenario: Resolving a clone-on-demand project with existing clone
- **Given** a project with `dirStrategy: 'clone_on_demand'` and the clone directory already exists with `.git`
- **When** `resolveProjectDir` is called
- **Then** it runs `git pull --ff-only` on the existing clone and returns `{ dir: cloneDir, ephemeral: false }`

### Scenario: Resolving an ephemeral project
- **Given** a project with `dirStrategy: 'ephemeral'` and a valid `gitUrl`
- **When** `resolveProjectDir` is called
- **Then** it creates a temp directory, performs a shallow clone (`--depth 1`), and returns `{ dir: tempDir, ephemeral: true }`

### Scenario: Cleaning up an ephemeral directory
- **Given** a `ResolvedDir` with `ephemeral: true`
- **When** `cleanupEphemeralDir` is called
- **Then** the directory is recursively deleted

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown model name with no parameter count | `getAgentTier` returns `'limited'` (conservative default) |
| `sendWithReceipt` with retry disabled and send fails | Receipt recorded with `attempts: 1` and `success: false`; error re-thrown |
| `GH_TOKEN` not set | `checkGitHubToken` returns `{ configured: false, valid: false, error: 'GH_TOKEN not set' }` |
| GitHub API returns non-200 status | `checkGitHubToken` returns `{ valid: false, error: 'GitHub API returned HTTP <status>' }` |
| Network error during `checkGitHubToken` | Returns `{ valid: false, error: <message> }` without throwing |
| `validateGitHubTokenOnStartup` encounters unexpected error | Logs warning and returns without throwing |
| `clone_on_demand` without `gitUrl` | Returns `{ dir: workingDir, ephemeral: false, error: 'gitUrl is required...' }` |
| `ephemeral` without `gitUrl` | Returns `{ dir: workingDir, ephemeral: false, error: 'gitUrl is required...' }` |
| `git clone` fails | Returns `{ dir: workingDir, ephemeral: false, error: 'git clone failed: ...' }` |
| `git pull` fails in clone_on_demand | Returns `{ dir: cloneDir, ephemeral: false }` (pull failure is non-fatal; clone dir still usable) |
| `cleanupEphemeralDir` on non-ephemeral dir | No-op (returns immediately) |
| `cleanupEphemeralDir` fails to delete | Logs warning but does not throw |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `lib/logger` | `createLogger` for structured logging in delivery-tracker, github-token-check, project-dir |
| `lib/resilience` | `withRetry`, `RetryOptions` for retry logic in delivery-tracker |
| `providers/ollama/tool-prompt-templates` | `detectModelFamily`, `ModelFamily` for model family detection in agent-tiers |
| `shared/types` | `Project`, `DirStrategy` for project type definitions in project-dir |

### Consumed By

| Module | What is used |
|--------|-------------|
| `lib/agent-session-limits` | `getAgentTierConfig`, `AgentTierConfig` for tier-based session rate limiting |
| `process/sdk-process`, `process/ollama-process` | `getAgentTierConfig` for iteration limits and nudge budgets |
| `councils/*` | `getAgentTier`, `AgentTierConfig.canVoteInCouncil` for council vote eligibility |
| `discord/bridge`, `telegram/bridge`, `slack/bridge` | `DeliveryTracker`, `getDeliveryTracker` for message delivery tracking |
| `routes/health`, `routes/admin` | `DeliveryTracker.getAllMetrics` for delivery health reporting |
| `middleware/startup` | `validateGitHubTokenOnStartup` for startup token validation |
| `work/service`, `process/manager` | `resolveProjectDir`, `cleanupEphemeralDir` for session working directory resolution |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-03-13 | corvid-agent | Initial spec covering agent-tiers, delivery-tracker, github-token-check, and project-dir |
