/**
 * Shared helpers for provider-matrix smoke tests.
 *
 * Reuses the createMockProvider / createMockRegistry patterns established in
 * fallback-manager.test.ts and provider-registry.test.ts so that buddy and
 * council mixed-provider tests share a single source of truth.
 */
import { mock } from 'bun:test';
import type { LlmProvider, LlmProviderType, LlmCompletionParams, LlmCompletionResult } from '../../providers/types';
import { LlmProviderRegistry } from '../../providers/registry';
import type { FallbackChain } from '../../providers/fallback';

// ─── Provider factory ─────────────────────────────────────────────────────────

/**
 * Build a minimal mock LlmProvider for the given type.
 *
 * @param type     - provider type (e.g. 'ollama', 'anthropic', 'cursor')
 * @param model    - default model string returned in getInfo
 * @param impl     - optional override for the `complete` implementation
 */
export function createProviderAgent(
    type: LlmProviderType,
    model: string,
    impl?: (params: LlmCompletionParams) => Promise<LlmCompletionResult>,
): LlmProvider {
    return {
        type,
        executionMode: type === 'ollama' || type === 'cursor' ? 'direct' : 'managed',
        getInfo: () => ({
            type,
            name: `mock-${type}`,
            executionMode: type === 'ollama' || type === 'cursor' ? 'direct' : 'managed',
            models: [model],
            defaultModel: model,
            supportsTools: true,
            supportsStreaming: true,
        }),
        complete: impl ?? mock(() => Promise.resolve(makeResult('ok', model))),
        isAvailable: mock(() => Promise.resolve(true)),
    };
}

// ─── Registry factory ─────────────────────────────────────────────────────────

/**
 * Build a lightweight mock registry from a list of providers.
 * Mirrors the pattern used in fallback-manager.test.ts.
 */
export function createMockRegistry(providers: LlmProvider[]): LlmProviderRegistry {
    return {
        get(type: LlmProviderType) {
            return providers.find((p) => p.type === type);
        },
        getAll() {
            return providers;
        },
        getDefault() {
            return providers[0];
        },
    } as unknown as LlmProviderRegistry;
}

// ─── Response factories ───────────────────────────────────────────────────────

/** Build a valid LlmCompletionResult. */
export function makeResult(content: string, model: string): LlmCompletionResult {
    return { content, model, usage: { inputTokens: 10, outputTokens: 20 } };
}

/** Build a minimal LlmCompletionParams for tests. */
export function makeParams(overrides?: Partial<LlmCompletionParams>): LlmCompletionParams {
    return {
        model: 'test-model',
        systemPrompt: 'You are a test assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
        ...overrides,
    };
}

// ─── Provider response helpers ────────────────────────────────────────────────

/**
 * Return a `complete` implementation that resolves with the given content.
 * Use this to simulate a successful provider response.
 */
export function mockProviderResponse(
    response: string,
    model: string,
): (params: LlmCompletionParams) => Promise<LlmCompletionResult> {
    return mock((_params: LlmCompletionParams) => Promise.resolve(makeResult(response, model)));
}

/**
 * Return a `complete` implementation that rejects with the given error.
 * Use this to simulate a provider failure (connection error, 503, etc.).
 */
export function mockProviderFailure(
    error: Error | string,
): (params: LlmCompletionParams) => Promise<LlmCompletionResult> {
    const err = typeof error === 'string' ? new Error(error) : error;
    return mock((_params: LlmCompletionParams) => Promise.reject(err));
}

// ─── Chain factory ────────────────────────────────────────────────────────────

/** Build a FallbackChain from provider/model pairs. */
export function makeChain(...entries: Array<{ provider: LlmProviderType; model: string }>): FallbackChain {
    return { chain: entries };
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Assert that the `complete` mock on the given provider was called at least once.
 * Providers returned by createProviderAgent store their `complete` as a Bun mock.
 */
export function assertProviderUsed(provider: LlmProvider): void {
    const completeMock = provider.complete as ReturnType<typeof mock>;
    if (typeof completeMock.mock === 'undefined') {
        throw new Error('assertProviderUsed: provider.complete is not a bun mock');
    }
    if (completeMock.mock.calls.length === 0) {
        throw new Error(`Expected provider '${provider.type}' to be called, but it was not.`);
    }
}

/**
 * Assert that the `complete` mock on the given provider was NOT called.
 */
export function assertProviderNotUsed(provider: LlmProvider): void {
    const completeMock = provider.complete as ReturnType<typeof mock>;
    if (typeof completeMock.mock === 'undefined') {
        throw new Error('assertProviderNotUsed: provider.complete is not a bun mock');
    }
    if (completeMock.mock.calls.length > 0) {
        throw new Error(`Expected provider '${provider.type}' NOT to be called, but it was called ${completeMock.mock.calls.length} time(s).`);
    }
}
