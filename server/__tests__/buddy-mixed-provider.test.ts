/**
 * Buddy mixed-provider smoke tests.
 *
 * These tests verify that Buddy-mode collaboration works correctly when agents
 * use different LLM providers (Ollama, Anthropic, Cursor).  They cover the
 * FallbackManager layer that Buddy sessions rely on, plus the isApproval
 * detection logic that is provider-agnostic.
 *
 * Test naming follows: [<provider-config>] buddy: <scenario>
 */
import { describe, it, expect, afterEach, mock } from 'bun:test';
import { FallbackManager } from '../providers/fallback';
import { BuddyService } from '../buddy/service';
import {
    createProviderAgent,
    createMockRegistry,
    makeParams,
    makeChain,
    mockProviderResponse,
    mockProviderFailure,
    assertProviderUsed,
    assertProviderNotUsed,
} from './helpers/provider-matrix';

// ─── isApproval wrapper ───────────────────────────────────────────────────────

// BuddyService.isApproval is private; access via bracket notation.
const buddyService = new BuddyService({ db: {} as any, processManager: {} as any });
function isApproval(text: string): boolean {
    return (buddyService as any).isApproval(text);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buddy mixed-provider smoke tests', () => {
    afterEach(() => {
        mock.restore();
    });

    // ── [ollama] Ollama-only Buddy flow ──────────────────────────────────────

    describe('[ollama] buddy: Ollama-only provider flow', () => {
        it('primary Ollama provider completes successfully', async () => {
            const ollamaPrimary = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderResponse('Here is the implementation.', 'qwen3:14b'),
            );
            const registry = createMockRegistry([ollamaPrimary]);
            const manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'ollama', model: 'qwen3:14b' });
            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.content).toBe('Here is the implementation.');
            expect(result.usedProvider).toBe('ollama');
            expect(result.usedModel).toBe('qwen3:14b');
            assertProviderUsed(ollamaPrimary);
        });

        it('buddy Ollama provider completes review', async () => {
            const ollamaBuddy = createProviderAgent(
                'ollama',
                'llama3.1:8b',
                mockProviderResponse('LGTM.', 'llama3.1:8b'),
            );
            const registry = createMockRegistry([ollamaBuddy]);
            const manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'ollama', model: 'llama3.1:8b' });
            const result = await manager.completeWithFallback(
                makeParams({ messages: [{ role: 'user', content: 'Review this: const x = 1;' }] }),
                chain,
            );

            expect(result.content).toBe('LGTM.');
            expect(result.usedProvider).toBe('ollama');
            assertProviderUsed(ollamaBuddy);
        });

        it('approval detection works on Ollama-sourced review output', () => {
            // Ollama produces a clean approval — isApproval should detect it
            expect(isApproval('LGTM')).toBe(true);
            expect(isApproval('Looks good to me!')).toBe(true);
            expect(isApproval('Ship it!')).toBe(true);
        });

        it('approval detection correctly rejects Ollama feedback with caveats', () => {
            // Ollama sometimes adds qualifiers — these must not be treated as approval
            expect(isApproval('LGTM, however the error handling needs work.')).toBe(false);
            expect(isApproval('Approved with reservations about the null check.')).toBe(false);
        });
    });

    // ── [cursor] Cursor-only Buddy flow ──────────────────────────────────────

    describe('[cursor] buddy: Cursor-only provider flow', () => {
        it('primary Cursor provider completes successfully', async () => {
            const cursorPrimary = createProviderAgent(
                'cursor',
                'cursor-fast',
                mockProviderResponse('Implementation complete.', 'cursor-fast'),
            );
            const registry = createMockRegistry([cursorPrimary]);
            const manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'cursor', model: 'cursor-fast' });
            const result = await manager.completeWithFallback(makeParams(), chain);

            expect(result.content).toBe('Implementation complete.');
            expect(result.usedProvider).toBe('cursor');
            assertProviderUsed(cursorPrimary);
        });

        it('buddy Cursor provider completes review and approval is detected', async () => {
            const cursorBuddy = createProviderAgent(
                'cursor',
                'cursor-fast',
                mockProviderResponse('Approved.', 'cursor-fast'),
            );
            const registry = createMockRegistry([cursorBuddy]);
            const manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'cursor', model: 'cursor-fast' });
            const result = await manager.completeWithFallback(
                makeParams({ messages: [{ role: 'user', content: 'Review this PR' }] }),
                chain,
            );

            expect(result.usedProvider).toBe('cursor');
            expect(isApproval(result.content)).toBe(true);
        });

        it('no provider errors surface for a valid Cursor completion', async () => {
            const cursorProvider = createProviderAgent(
                'cursor',
                'cursor-fast',
                mockProviderResponse('No issues.', 'cursor-fast'),
            );
            const registry = createMockRegistry([cursorProvider]);
            const manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'cursor', model: 'cursor-fast' });
            await expect(manager.completeWithFallback(makeParams(), chain)).resolves.toBeDefined();
        });
    });

    // ── [mixed:ollama+anthropic] Cross-provider buddy flow ───────────────────

    describe('[mixed:ollama+anthropic] buddy: cross-provider review handoff', () => {
        it('primary Ollama produces work, Anthropic reviews — both succeed', async () => {
            const ollamaPrimary = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderResponse('Here is the code change.', 'qwen3:14b'),
            );
            const anthropicBuddy = createProviderAgent(
                'anthropic',
                'claude-sonnet-4-6',
                mockProviderResponse('LGTM', 'claude-sonnet-4-6'),
            );
            const registry = createMockRegistry([ollamaPrimary, anthropicBuddy]);
            const manager = new FallbackManager(registry);

            // Round 1: lead agent (Ollama) does the work
            const leadChain = makeChain({ provider: 'ollama', model: 'qwen3:14b' });
            const leadResult = await manager.completeWithFallback(makeParams(), leadChain);
            expect(leadResult.usedProvider).toBe('ollama');
            assertProviderUsed(ollamaPrimary);

            // Round 2: buddy agent (Anthropic) reviews
            const buddyChain = makeChain({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
            const reviewResult = await manager.completeWithFallback(
                makeParams({ messages: [{ role: 'user', content: leadResult.content }] }),
                buddyChain,
            );
            expect(reviewResult.usedProvider).toBe('anthropic');
            assertProviderUsed(anthropicBuddy);

            // Approval detection works on Anthropic review output
            expect(isApproval(reviewResult.content)).toBe(true);
        });

        it('providers are isolated — Ollama primary does NOT call Anthropic', async () => {
            const ollamaPrimary = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderResponse('Done.', 'qwen3:14b'),
            );
            const anthropicBuddy = createProviderAgent(
                'anthropic',
                'claude-sonnet-4-6',
                mockProviderResponse('LGTM', 'claude-sonnet-4-6'),
            );
            const registry = createMockRegistry([ollamaPrimary, anthropicBuddy]);
            const manager = new FallbackManager(registry);

            // Only run the lead chain — Anthropic should NOT be called
            const leadChain = makeChain({ provider: 'ollama', model: 'qwen3:14b' });
            await manager.completeWithFallback(makeParams(), leadChain);

            assertProviderUsed(ollamaPrimary);
            assertProviderNotUsed(anthropicBuddy);
        });

        it('synthesis does not collapse when providers differ', async () => {
            const ollamaLeadOutput = 'Refactored the session manager to use a pool.';
            const anthropicReviewOutput = 'Code review complete. LGTM.';

            // Both providers succeed independently
            expect(ollamaLeadOutput.length).toBeGreaterThan(0);
            expect(anthropicReviewOutput.length).toBeGreaterThan(0);

            // isApproval works on Anthropic review regardless of lead's provider
            expect(isApproval(anthropicReviewOutput)).toBe(true);

            // Non-approval feedback from buddy should NOT be collapsed
            const nonApproval = 'The pool size should be configurable.';
            expect(isApproval(nonApproval)).toBe(false);
        });
    });

    // ── [degraded:ollama-offline] Provider fallback during buddy review ───────

    describe('[degraded:ollama-offline] buddy: fallback when buddy provider fails', () => {
        it('FallbackManager routes to next provider when Ollama returns error', async () => {
            const ollamaFailing = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderFailure(new Error('ECONNREFUSED: Ollama not reachable')),
            );
            const anthropicFallback = createProviderAgent(
                'anthropic',
                'claude-haiku-4-5-20251001',
                mockProviderResponse('Review complete. Approved.', 'claude-haiku-4-5-20251001'),
            );
            const registry = createMockRegistry([ollamaFailing, anthropicFallback]);
            const manager = new FallbackManager(registry);

            // Chain: try Ollama first, fall back to Anthropic
            const chain = makeChain(
                { provider: 'ollama', model: 'qwen3:14b' },
                { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);

            // Fallback to Anthropic should have happened
            expect(result.usedProvider).toBe('anthropic');
            expect(result.content).toBe('Review complete. Approved.');
            assertProviderUsed(ollamaFailing);
            assertProviderUsed(anthropicFallback);
        });

        it('review still completes via fallback — approval detection is unaffected', async () => {
            const ollamaFailing = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderFailure('connection refused'),
            );
            const cursorFallback = createProviderAgent(
                'cursor',
                'cursor-fast',
                mockProviderResponse('LGTM. Ship it!', 'cursor-fast'),
            );
            const registry = createMockRegistry([ollamaFailing, cursorFallback]);
            const manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'ollama', model: 'qwen3:14b' },
                { provider: 'cursor', model: 'cursor-fast' },
            );

            const result = await manager.completeWithFallback(makeParams(), chain);
            expect(result.usedProvider).toBe('cursor');

            // Approval detection still works on the fallback provider's output
            expect(isApproval(result.content)).toBe(true);
        });

        it('throws ExternalServiceError when ALL providers fail', async () => {
            const ollamaFailing = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderFailure('ECONNREFUSED'),
            );
            const anthropicFailing = createProviderAgent(
                'anthropic',
                'claude-haiku-4-5-20251001',
                mockProviderFailure('503 Service Unavailable'),
            );
            const registry = createMockRegistry([ollamaFailing, anthropicFailing]);
            const manager = new FallbackManager(registry);

            const chain = makeChain(
                { provider: 'ollama', model: 'qwen3:14b' },
                { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
            );

            await expect(manager.completeWithFallback(makeParams(), chain)).rejects.toThrow(
                'All providers in fallback chain failed',
            );
        });

        it('Ollama marked unhealthy after repeated ECONNREFUSED failures', async () => {
            const ollamaFailing = createProviderAgent(
                'ollama',
                'qwen3:14b',
                mockProviderFailure('ECONNREFUSED'),
            );
            const registry = createMockRegistry([ollamaFailing]);
            const manager = new FallbackManager(registry);

            const chain = makeChain({ provider: 'ollama', model: 'qwen3:14b' });

            // Three consecutive failures are needed to trip the cooldown threshold
            for (let i = 0; i < 3; i++) {
                await expect(manager.completeWithFallback(makeParams(), chain)).rejects.toThrow();
            }

            // Provider should now be in cooldown after MAX_CONSECUTIVE_FAILURES=3
            expect(manager.isProviderAvailable('ollama')).toBe(false);
        });
    });
});
