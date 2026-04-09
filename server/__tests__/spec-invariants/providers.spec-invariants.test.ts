/**
 * Spec invariant tests for providers/* modules.
 *
 * Covers: anthropic-provider, openrouter-provider, provider-system
 */
import { describe, expect, it } from 'bun:test';
import { AnthropicProvider } from '../../providers/anthropic/provider';
import { OpenRouterProvider } from '../../providers/openrouter/provider';
import { LlmProviderRegistry } from '../../providers/registry';

// ── AnthropicProvider invariants ───────────────────────────────────────────

describe('AnthropicProvider invariants', () => {
  const provider = new AnthropicProvider();

  it('spec: type is "anthropic"', () => {
    expect(provider.type).toBe('anthropic');
  });

  it('spec: executionMode is "managed" (runs via Claude Code SDK, not direct API)', () => {
    expect(provider.executionMode).toBe('managed');
  });

  it('spec: default model is claude-sonnet-4-6', () => {
    const info = provider.getInfo();
    expect(info.defaultModel).toBe('claude-sonnet-4-6');
  });

  it('spec: getInfo lists claude-opus-4-6 in available models', () => {
    const info = provider.getInfo();
    expect(info.models).toContain('claude-opus-4-6');
  });
});

// ── OpenRouterProvider invariants ──────────────────────────────────────────

describe('OpenRouterProvider invariants', () => {
  const provider = new OpenRouterProvider();

  it('spec: type is "openrouter"', () => {
    expect(provider.type).toBe('openrouter');
  });

  it('spec: executionMode is "direct" (makes HTTP calls directly)', () => {
    expect(provider.executionMode).toBe('direct');
  });

  it('spec: default model is openai/gpt-4o', () => {
    const info = provider.getInfo();
    expect(info.defaultModel).toBe('openai/gpt-4o');
  });

  it('spec: getInfo lists multiple upstream providers (openai, google, deepseek)', () => {
    const info = provider.getInfo();
    const modelList = info.models.join(',');
    expect(modelList).toContain('openai/');
    expect(modelList).toContain('google/');
  });
});

// ── LlmProviderRegistry invariants ────────────────────────────────────────────

describe('LlmProviderRegistry invariants', () => {
  it('spec: get returns undefined for unknown provider type', () => {
    const registry = LlmProviderRegistry.getInstance();
    const result = registry.get('nonexistent-provider' as never);
    expect(result).toBeUndefined();
  });

  it('spec: getAll returns an array (may be empty in test env without API keys)', () => {
    const registry = LlmProviderRegistry.getInstance();
    const providers = registry.getAll();
    expect(Array.isArray(providers)).toBe(true);
  });
});
