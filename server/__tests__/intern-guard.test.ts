/**
 * Tests for intern-guard.ts — Issue #1542
 *
 * Verifies that intern-tier model detection and the PR guard work correctly
 * across known model names, ollama local vs cloud, and edge cases.
 */

import { describe, expect, test } from 'bun:test';
import { checkInternPrGuard, isInternTierModel } from '../work/intern-guard';

// ─── isInternTierModel ────────────────────────────────────────────────────────

describe('isInternTierModel', () => {
  describe('explicit intern designation', () => {
    test('returns true for literal "intern"', () => {
      expect(isInternTierModel('intern')).toBe(true);
    });
  });

  describe('Claude models — not intern', () => {
    test('claude-opus-4-6 is NOT intern', () => {
      expect(isInternTierModel('claude-opus-4-6')).toBe(false);
    });

    test('claude-sonnet-4-6 is NOT intern', () => {
      expect(isInternTierModel('claude-sonnet-4-6')).toBe(false);
    });

    test('claude-haiku-4-5-20251001 is NOT intern', () => {
      expect(isInternTierModel('claude-haiku-4-5-20251001')).toBe(false);
    });
  });

  describe('OpenAI models — not intern', () => {
    test('gpt-4.1 is NOT intern', () => {
      expect(isInternTierModel('gpt-4.1')).toBe(false);
    });

    test('gpt-4.1-mini is NOT intern', () => {
      expect(isInternTierModel('gpt-4.1-mini')).toBe(false);
    });

    test('o3 is NOT intern', () => {
      expect(isInternTierModel('o3')).toBe(false);
    });
  });

  describe('Ollama local models — IS intern', () => {
    test('llama3.3 (local) IS intern', () => {
      expect(isInternTierModel('llama3.3')).toBe(true);
    });

    test('qwen3:32b (local) IS intern', () => {
      expect(isInternTierModel('qwen3:32b')).toBe(true);
    });

    test('qwen2.5-coder (local) IS intern', () => {
      expect(isInternTierModel('qwen2.5-coder')).toBe(true);
    });
  });

  describe('Ollama cloud models — not intern', () => {
    test('qwen3.5:cloud is NOT intern', () => {
      expect(isInternTierModel('qwen3.5:cloud')).toBe(false);
    });

    test('minimax-m2.5:cloud is NOT intern', () => {
      expect(isInternTierModel('minimax-m2.5:cloud')).toBe(false);
    });

    test('nemotron-3-nano:cloud is NOT intern', () => {
      expect(isInternTierModel('nemotron-3-nano:cloud')).toBe(false);
    });

    test('deepseek-v3.2:cloud is NOT intern', () => {
      expect(isInternTierModel('deepseek-v3.2:cloud')).toBe(false);
    });
  });

  describe('unknown model heuristics', () => {
    test('ollama/ prefixed model IS intern', () => {
      expect(isInternTierModel('ollama/llama2')).toBe(true);
    });

    test(':latest suffix IS intern', () => {
      expect(isInternTierModel('some-model:latest')).toBe(true);
    });

    test('empty string returns false', () => {
      expect(isInternTierModel('')).toBe(false);
    });
  });
});

// ─── checkInternPrGuard ───────────────────────────────────────────────────────

describe('checkInternPrGuard', () => {
  test('returns blocked=true for a local Ollama model', () => {
    const result = checkInternPrGuard('llama3.3', 'task-abc');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('#1542');
    expect(result.reason).toContain('llama3.3');
  });

  test('returns blocked=true for explicit intern model', () => {
    const result = checkInternPrGuard('intern');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('intern');
  });

  test('returns blocked=false for claude-sonnet-4-6', () => {
    const result = checkInternPrGuard('claude-sonnet-4-6', 'task-xyz');
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  test('returns blocked=false for claude-opus-4-6', () => {
    const result = checkInternPrGuard('claude-opus-4-6');
    expect(result.blocked).toBe(false);
  });

  test('returns blocked=false for an Ollama cloud model', () => {
    const result = checkInternPrGuard('qwen3.5:cloud');
    expect(result.blocked).toBe(false);
  });

  test('reason includes model name when blocked', () => {
    const result = checkInternPrGuard('qwen3:32b', 'task-999');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('qwen3:32b');
  });
});
