---
spec: agent-utils.spec.md
---

## User Stories

- As a platform administrator, I want agents automatically assigned capability tiers based on their backing model so that iteration limits and council participation are enforced without per-agent configuration
- As an agent operator, I want delivery tracking for outbound messages to Discord, Telegram, and Slack so that I can monitor bridge reliability and diagnose delivery failures
- As an agent operator, I want GitHub token scopes validated at startup so that I receive early warnings about missing permissions before work tasks fail
- As an agent developer, I want project directories resolved via configurable strategies (persistent, clone-on-demand, ephemeral, worktree) so that concurrent sessions operate in isolated environments
- As a team agent, I want a communication tier hierarchy so that lower-tier agents cannot message higher-tier agents without authorization
- As an agent developer, I want cheerleading detection on response text so that agents producing vacuous output receive corrective nudges instead of wasting iterations
- As an agent developer, I want malicious code pattern scanning on git diffs so that dangerous patterns like eval(), reverse shells, and crypto mining URLs are flagged before merge
- As an agent operator, I want wallet encryption keys managed through a pluggable KeyProvider interface so that I can migrate from environment variables to a secrets manager
- As a platform administrator, I want a graceful shutdown coordinator so that active sessions drain before the process exits
- As an agent developer, I want retry utilities with exponential backoff and circuit breaker patterns so that transient failures in external services do not crash sessions
- As an agent operator, I want a first-run banner displayed on initial startup so that new users see onboarding guidance

## Acceptance Criteria

- `getAgentTier()` maps Claude/Anthropic/OpenAI models to `high`, standard Ollama families to `standard`, and unknown models to `limited`
- Cloud-suffixed models (`:cloud` or `-cloud`) are boosted one tier level
- `AgentTierConfig` includes `maxToolIterations`, `maxNudges`, `canVoteInCouncil`, and `minGovernanceTier` for each tier
- `DeliveryTracker` prunes receipts older than 1 hour on every `record()` call and caps `recentFailures` at 10
- `sendWithReceipt()` uses `withRetry` by default (2 attempts, 500ms base delay) and records a receipt regardless of success or failure
- `checkGitHubToken()` never throws; all errors are returned in the result object with `configured`, `valid`, `scopes`, `missingScopes`, and `fineGrained` fields
- Required GitHub scopes are `repo` and `read:org`; fine-grained tokens skip scope validation
- `resolveProjectDir()` defaults to `persistent` strategy when `dirStrategy` is unset
- `clone_on_demand` requires `gitUrl` and runs `git pull --ff-only` on existing clones; missing `gitUrl` returns an error in the result
- `ephemeral` strategy creates a temp directory with `--depth 1` shallow clone and `cleanupEphemeralDir()` removes it
- `scoreResponseQuality()` returns a score clamped to [0.0, 1.0]; empty text with tool calls scores 1.0; empty text without tool calls scores 0.0
- `ResponseQualityTracker` triggers a nudge after `CONSECUTIVE_LOW_QUALITY_TRIGGER` (default 2) consecutive low-quality responses
- `RepetitiveToolCallDetector` uses stable fingerprints (sorted JSON args) and triggers after `threshold` (default 3) consecutive identical calls
- `scanDiff()` only examines added lines, skips single-line comments, and deduplicates findings by (category, pattern, file)
- `formatScanReport()` separates critical findings from warnings and returns empty string for clean diffs
- `createKeyProvider()` always returns a valid `KeyProvider`; `EnvKeyProvider.getEncryptionPassphrase()` throws on testnet/mainnet when `WALLET_ENCRYPTION_KEY` is not set
- `assertProductionReady()` is a no-op on localnet but throws on testnet/mainnet if the passphrase is missing or shorter than 32 characters
- `createWorktree()` returns `{ success: false, error }` on failure rather than throwing; session creation must abort if worktree creation fails
- `checkCommunicationTier()` returns null when messaging is allowed or a descriptive error string when a lower-tier agent tries to message a higher-tier agent
- `withRetry()` implements exponential backoff with configurable max retries, base delay, and max delay
- `isOllamaProvider()` and `buildOllamaComplexityWarning()` are stateless and deterministic; warning is only emitted for complex/expert tasks on Ollama models

## Constraints

- All lib modules are leaf or near-leaf dependencies; they must not import from routes, middleware, or process managers
- `checkGitHubToken()` and `validateGitHubTokenOnStartup()` must never throw or block server startup
- Code scanner patterns are statically defined in `ALL_PATTERNS`; no runtime pattern loading
- `safeJsonParse()` and `withRetry()` must never throw to callers
- `WALLET_ENCRYPTION_KEY` must be at least 32 characters on non-localnet deployments
- `DeliveryTracker` is a global singleton via `getDeliveryTracker()`
- Communication tier hierarchy is hardcoded: top > mid > bottom; unknown agents default to bottom

## Out of Scope

- AWS Secrets Manager, HashiCorp Vault, or other KMS backend integrations (KeyProvider interface is ready but only EnvKeyProvider is implemented)
- Runtime code execution sandbox for scanned code
- Model fine-tuning or dynamic tier adjustment based on performance
- Custom communication tier configuration files
- Web search result caching or persistent indexing
