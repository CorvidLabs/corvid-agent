# Provider Parity Checklist: Ollama + Cursor vs Claude Baseline

> **Purpose:** Track parity requirements for Ollama and Cursor providers against the Claude (Anthropic SDK) baseline.
> **Scope:** Routing, defaults, fallback, error handling, multi-agent collaboration.
> **Reference issue:** [#1496](https://github.com/CorvidLabs/corvid-agent/issues/1496)
> **Council decision:** Claude-First dispatch (2026-03-13). Ollama + Cursor are opt-in; quality improvement is ongoing.

---

## 1. Provider Registration & Availability

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Registers in `LlmProviderRegistry` | ✅ Always | ✅ Behind `OLLAMA_LOCAL_EXPERIMENTAL=true` | ❌ Not registered as `LlmProvider` | **Cursor missing** |
| `isAvailable()` check | ✅ Checks `ANTHROPIC_API_KEY` | ✅ GPU detection + model cache | ❌ Only binary check in `cursor-process.ts` | **Cursor missing** |
| Startup health log | ✅ Logged on register | ✅ Logged on register | ❌ No registry entry to log | **Cursor missing** |
| Feature flag gating | N/A — always enabled | `OLLAMA_LOCAL_EXPERIMENTAL=true` | `CURSOR_AGENT_BIN` env or binary present | Acceptable |

**Actions:**
- [ ] [#ollama] Implement startup readiness probe (HTTP `/api/tags`) before registering Ollama
- [ ] [#cursor] Implement `CursorProvider` class extending `BaseLlmProvider` and register in `bootstrap.ts`

---

## 2. Routing & Default Selection

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Default provider when no config | ✅ `sdk` / Anthropic | Auto-routes when `isLocalOnly()` | ❌ Never auto-selected | **Cursor gap** |
| Agent model set to `auto` | Routes to Sonnet via `resolveModelForTier` | N/A | Routes to Cursor `auto` model | OK when binary present |
| `resolveProviderRouting()` coverage | Full | Covered: `no_claude_access` path | Covered: `cursor_binary_missing` fallback | OK |
| Cross-provider routing (missing binary) | N/A | Implicit (feature flag blocks it) | Falls back to SDK, clears cursor-only models | OK |
| `selectModel()` includes provider | ✅ All Anthropic models in `cost-table` | ✅ Ollama models in `cost-table` | ✅ Cursor models in `cost-table` | OK |
| `selectModelByTier()` throws if provider unavailable | ✅ Throws `ValidationError` | N/A (not tier-based) | N/A (not tier-based) | OK |

**Actions:**
- [ ] [#cursor] Add Cursor to `resolveProviderRouting()` auto-selection when binary present and no cloud access
- [ ] [#ollama] Define explicit Ollama default model in config (not hardcoded `qwen3:14b`)

---

## 3. Fallback Chains

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Appears in default fallback chains | ✅ `high-capability`, `balanced`, `cost-optimized` | ✅ `local`, `cloud` chains | ❌ No fallback chain entry | **Cursor gap** |
| Provider isolation enforced | ✅ No cross-provider fallback | ✅ Isolated to `local`/`cloud` chains | N/A (not in chains) | OK |
| Health tracking (3-strike cooldown) | ✅ FallbackManager | ✅ FallbackManager | ❌ Not registered in FallbackManager | **Cursor gap** |
| Exponential backoff on failure | ✅ | ✅ | ❌ | **Cursor gap** |
| Recovery after cooldown | ✅ | ✅ | ❌ | **Cursor gap** |

**Actions:**
- [ ] [#cursor] Add `cursor` fallback chain entry (e.g., `cursor-auto` chain)
- [ ] [#cursor] Register Cursor in `FallbackManager` health tracking once `CursorProvider` exists

---

## 4. Error Handling & Classification

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Transient error detection | ✅ rate limit, 429, 503, 502, timeout, ECONNREFUSED | ✅ Identical pattern via `FallbackManager` | ❌ Binary exit codes not mapped to transient/permanent | **Cursor gap** |
| Non-transient errors propagate | ✅ Auth, invalid model | ✅ | ❌ All cursor-process failures are opaque | **Cursor gap** |
| Stream idle timeout | Via SDK | 2 min idle timeout (`ollama-provider.ts`) | ❌ No explicit timeout on cursor process streams | **Cursor gap** |
| Request timeout | SDK handles | 30 min request timeout | ❌ No explicit timeout | **Cursor gap** |
| Retry on transient errors | ✅ 3 attempts, exponential backoff | ✅ 3 attempts, exponential backoff | ❌ No retry logic | **Cursor gap** |
| Error surfaced to session event bus | ✅ `error` event emitted | ✅ | ✅ `onExit` callback fires | OK (different path) |

**Actions:**
- [ ] [#cursor] Map cursor-agent exit codes and stderr patterns to transient vs permanent errors
- [ ] [#cursor] Add stream idle timeout and request timeout to `cursor-process.ts`
- [ ] [#ollama] Validate error classification covers all Ollama HTTP status codes (404 model-not-found, 400 bad request)

---

## 5. Tool Call Support

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Native tools API | ✅ Anthropic tools format | ✅ For most models; text-based for Qwen3 | ✅ cursor-agent handles natively | OK |
| Tool call extraction from text | N/A | ✅ `extractToolCallsFromText()` for Qwen3 | N/A | OK |
| Tool call tracking in metrics | ✅ | ✅ `DirectProcessMetrics` | ✅ Cursor event forwarding | OK |
| `supportsTools` flag in cost-table | ✅ | ✅ Most models | ✅ Cursor models marked | OK |

**Actions:**
- [ ] [#ollama] Audit `extractToolCallsFromText` reliability for Qwen3 vs native tool models

---

## 6. Concurrency & Rate Limiting

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Concurrency control | None (SDK manages) | ✅ Weight-based slot acquisition | ✅ Slot-based `acquireSlot`/`releaseSlot` (`CURSOR_MAX_CONCURRENT`, default 4) | OK |
| GPU-aware scheduling | N/A | ✅ Model weight + GPU detection | N/A | OK |
| Concurrent session handling | SDK handles | `acquireSlot()`/`releaseSlot()` | ✅ `acquireSlot()`/`releaseSlot()` with queue | OK |

**Actions:**
- [x] [#1532] Add process-level concurrency limit for cursor-agent spawning — done (`CURSOR_MAX_CONCURRENT`, default 4)

---

## 7. Observability & Metrics

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| `provider_selected` event emitted | ✅ | ✅ | ✅ `resolveProviderRouting()` handles cursor | OK |
| Token usage in completion result | ✅ `usage.inputTokens`, `outputTokens` | ✅ | ✅ Mapped from cursor events | OK |
| Session metrics (TTFT, latency) | ✅ `insertSessionMetrics` | ✅ | ✅ Cursor event forwarding | OK |
| Cost tracking | ✅ `recordApiCost` | ✅ (free, $0) | ✅ (free, $0) | OK |
| Model ID in result | ✅ | ✅ | ✅ cursor session captures model | OK |

---

## 8. Multi-Agent Collaboration (Buddy / Council)

| Behavior | Claude (baseline) | Ollama | Cursor | Gap? |
|---|---|---|---|---|
| Buddy mode (lead + reviewer) | ✅ | ✅ Tested in `buddy-mixed-provider.test.ts` | ✅ Tested in `buddy-mixed-provider.test.ts` | OK |
| Council participation | ✅ | ❌ No council test coverage | ❌ No council test coverage | **Both gap** |
| Cross-provider review handoff | N/A | ✅ Tested (Ollama lead → Anthropic review) | Partial (cursor fallback tested) | Gap for Cursor-lead |
| Approval detection works on output | ✅ | ✅ `isApproval()` provider-agnostic | ✅ | OK |
| Synthesis coherent across providers | ✅ | ✅ Tested | Partial | **Cursor gap** |
| Failure injection — provider goes offline | ✅ | ✅ Tested | ❌ No failure injection tests | **Cursor gap** |

**Actions:**
- [ ] [#ollama] Add Ollama council participation smoke tests
- [ ] [#cursor] Add Cursor council participation smoke tests
- [ ] [#cursor] Add Cursor failure-injection tests (binary missing mid-session, exit code failures)

---

## 9. Pass/Fail Acceptance Thresholds

### Smoke Tests (per provider, per release)
| Metric | Pass threshold | Fail threshold |
|---|---|---|
| Single-turn completion success rate | ≥ 95% | < 90% |
| Tool call success rate | ≥ 90% | < 80% |
| Fallback chain recovery rate | ≥ 95% | < 90% |
| Buddy approval detection accuracy | 100% (deterministic) | Any miss |
| Council participation completion | ≥ 90% | < 80% |

### Failure Injection Tests
| Scenario | Expected behavior | Pass criteria |
|---|---|---|
| Provider goes offline mid-session | FallbackManager routes to next in chain | ≤ 1 lost turn |
| All providers in chain fail | `ExternalServiceError` thrown with full error list | Error surfaced within 30s |
| Binary missing (Cursor) | Falls back to SDK, clears cursor-only model | Seamless fallback, correct model |
| Ollama ECONNREFUSED | Marked unhealthy after 3 failures, cooldown starts | Cooldown = 60s base |
| Ollama stream stall (>2min idle) | Session timeout event emitted | Within 2min of stall |

### Regression Cadence
- **Weekly:** Run full provider smoke suite (Ollama + Cursor standalone)
- **Per PR touching providers/:** Run provider-routing, provider-fallback, routes-cursor, routes-ollama tests
- **Monthly:** Run mixed-provider Buddy + Council integration suite
- **On incident:** Re-run failure injection suite for affected provider

---

## 10. Summary Gap Table

| Area | Ollama gaps | Cursor gaps |
|---|---|---|
| Registration | Startup readiness probe | Full `LlmProvider` implementation |
| Routing | Configurable default model | Auto-selection when binary present |
| Fallback chains | None | Add `cursor` chain |
| Error handling | Audit HTTP error classification | Map exit codes, add timeouts, add retry |
| Concurrency | None | Add process concurrency limit |
| Multi-agent tests | Council coverage | Council coverage + failure injection |

**Ollama total gaps: 3** | **Cursor total gaps: 8**

Cursor has significantly more gaps due to being implemented as a process spawner rather than a proper `LlmProvider`. The highest-priority action is implementing `CursorProvider` as a first-class `LlmProvider`.
