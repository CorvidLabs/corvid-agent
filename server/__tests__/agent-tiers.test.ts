import { describe, it, expect } from 'bun:test';
import { getAgentTier, getAgentTierConfig, getTierConfig, type AgentTier } from '../lib/agent-tiers';

describe('agent-tiers', () => {
    describe('getAgentTier', () => {
        it('classifies Claude models as high tier', () => {
            expect(getAgentTier('claude-3-opus')).toBe('high');
            expect(getAgentTier('claude-3.5-sonnet')).toBe('high');
            expect(getAgentTier('anthropic/claude-3-haiku')).toBe('high');
        });

        it('classifies OpenAI models as high tier', () => {
            expect(getAgentTier('gpt-4-turbo')).toBe('high');
            expect(getAgentTier('openai/gpt-4')).toBe('high');
        });

        it('classifies large llama models as standard tier', () => {
            expect(getAgentTier('llama3.1:70b')).toBe('standard');
            expect(getAgentTier('llama3.1:405b')).toBe('standard');
        });

        it('classifies small llama models as limited tier', () => {
            expect(getAgentTier('llama3.1:8b')).toBe('limited');
            expect(getAgentTier('llama3.2:3b')).toBe('limited');
            expect(getAgentTier('llama3.2:1b')).toBe('limited');
        });

        it('classifies large qwen models as standard tier', () => {
            expect(getAgentTier('qwen2.5:72b')).toBe('standard');
            expect(getAgentTier('qwen3:32b')).toBe('standard');
        });

        it('classifies small qwen models as limited tier', () => {
            expect(getAgentTier('qwen2.5:7b')).toBe('limited');
            expect(getAgentTier('qwen3:8b')).toBe('limited');
        });

        it('classifies mistral models as standard tier (large)', () => {
            expect(getAgentTier('mistral:latest')).toBe('standard');
            expect(getAgentTier('mixtral:47b')).toBe('standard');
        });

        it('classifies small mistral models as limited tier', () => {
            expect(getAgentTier('mistral:7b')).toBe('limited');
        });

        it('classifies phi models as limited tier', () => {
            expect(getAgentTier('phi3:latest')).toBe('limited');
            expect(getAgentTier('phi3:3.8b')).toBe('limited');
        });

        it('classifies gemma models as limited tier', () => {
            expect(getAgentTier('gemma2:9b')).toBe('limited');
            expect(getAgentTier('gemma:7b')).toBe('limited');
        });

        it('classifies unknown models as limited tier', () => {
            expect(getAgentTier('some-random-model')).toBe('limited');
            expect(getAgentTier('custom-finetune:latest')).toBe('limited');
        });

        it('classifies large unknown models as standard tier', () => {
            expect(getAgentTier('custom-model:70b')).toBe('standard');
        });

        it('classifies deepseek as standard (large)', () => {
            expect(getAgentTier('deepseek-coder:33b')).toBe('standard');
        });

        it('classifies cloud models from standard families as high tier', () => {
            expect(getAgentTier('qwen3.5:cloud')).toBe('high');
            expect(getAgentTier('deepseek-v3.2:cloud')).toBe('high');
            expect(getAgentTier('qwen3-coder-next:cloud')).toBe('high');
            expect(getAgentTier('minimax-m2.5:cloud')).toBe('high');
            expect(getAgentTier('kimi-k2.5:cloud')).toBe('high');
        });

        it('classifies cloud models from limited families as standard tier', () => {
            expect(getAgentTier('glm-5:cloud')).toBe('standard');
            expect(getAgentTier('devstral-small-2:cloud')).toBe('standard');
            expect(getAgentTier('nemotron-3-super:cloud')).toBe('standard');
            expect(getAgentTier('gemini-3-flash-preview:cloud')).toBe('standard');
        });

        it('classifies new families correctly without cloud suffix', () => {
            expect(getAgentTier('minimax-m2.5')).toBe('standard');
            expect(getAgentTier('kimi-k2.5')).toBe('standard');
            expect(getAgentTier('glm-5')).toBe('limited');
            expect(getAgentTier('devstral-small')).toBe('limited');
            expect(getAgentTier('gemini-flash')).toBe('limited');
        });
    });

    describe('getAgentTierConfig', () => {
        it('returns correct config for high tier', () => {
            const config = getAgentTierConfig('claude-3-opus');
            expect(config.tier).toBe('high');
            expect(config.maxToolIterations).toBe(25);
            expect(config.maxNudges).toBe(2);
            expect(config.maxPrsPerSession).toBe(5);
            expect(config.canVoteInCouncil).toBe(true);
        });

        it('returns correct config for standard tier', () => {
            const config = getAgentTierConfig('llama3.1:70b');
            expect(config.tier).toBe('standard');
            expect(config.maxToolIterations).toBe(15);
            expect(config.maxNudges).toBe(4);
            expect(config.maxPrsPerSession).toBe(2);
            expect(config.canVoteInCouncil).toBe(true);
        });

        it('returns correct config for limited tier', () => {
            const config = getAgentTierConfig('phi3:3.8b');
            expect(config.tier).toBe('limited');
            expect(config.maxToolIterations).toBe(8);
            expect(config.maxNudges).toBe(5);
            expect(config.maxPrsPerSession).toBe(1);
            expect(config.canVoteInCouncil).toBe(false);
        });
    });

    describe('getTierConfig', () => {
        it('returns config for each tier name', () => {
            const tiers: AgentTier[] = ['high', 'standard', 'limited'];
            for (const tier of tiers) {
                const config = getTierConfig(tier);
                expect(config.tier).toBe(tier);
                expect(config.maxToolIterations).toBeGreaterThan(0);
            }
        });

        it('high tier has more iterations than standard', () => {
            const high = getTierConfig('high');
            const standard = getTierConfig('standard');
            expect(high.maxToolIterations).toBeGreaterThan(standard.maxToolIterations);
        });

        it('standard tier has more iterations than limited', () => {
            const standard = getTierConfig('standard');
            const limited = getTierConfig('limited');
            expect(standard.maxToolIterations).toBeGreaterThan(limited.maxToolIterations);
        });

        it('limited tier has more nudges than high tier', () => {
            const high = getTierConfig('high');
            const limited = getTierConfig('limited');
            expect(limited.maxNudges).toBeGreaterThan(high.maxNudges);
        });
    });
});
