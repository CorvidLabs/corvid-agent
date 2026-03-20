/**
 * Tests for server/lib/ollama-complexity-warning.ts
 *
 * Covers:
 * - isOllamaProvider detection
 * - buildOllamaComplexityWarning: simple vs. complex task detection
 * - buildOllamaComplexityWarning: provider gating (non-Ollama → null)
 * - Warning message formatting
 * - Non-blocking behavior (returns string, never throws)
 */
import { test, expect, describe } from 'bun:test';
import { isOllamaProvider, buildOllamaComplexityWarning } from '../lib/ollama-complexity-warning';

// ─── isOllamaProvider ─────────────────────────────────────────────────────────

describe('isOllamaProvider', () => {
    test('returns true for "ollama"', () => {
        expect(isOllamaProvider('ollama')).toBe(true);
    });

    test('returns false for "anthropic"', () => {
        expect(isOllamaProvider('anthropic')).toBe(false);
    });

    test('returns false for "openai"', () => {
        expect(isOllamaProvider('openai')).toBe(false);
    });

    test('returns false for undefined', () => {
        expect(isOllamaProvider(undefined)).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(isOllamaProvider('')).toBe(false);
    });

    test('is case-sensitive — mixed case does not match', () => {
        expect(isOllamaProvider('Ollama')).toBe(false);
        expect(isOllamaProvider('OLLAMA')).toBe(false);
    });
});

// ─── buildOllamaComplexityWarning — provider gating ──────────────────────────

describe('buildOllamaComplexityWarning — provider gating', () => {
    const complexPrompt = 'Refactor the authentication system, migrate to JWT tokens, and optimize all database queries for performance and security.';

    test('returns null for anthropic provider even with complex prompt', () => {
        const result = buildOllamaComplexityWarning(complexPrompt, 'claude-sonnet-4-6', 'anthropic');
        expect(result).toBeNull();
    });

    test('returns null for openai provider even with complex prompt', () => {
        const result = buildOllamaComplexityWarning(complexPrompt, 'gpt-4o', 'openai');
        expect(result).toBeNull();
    });

    test('returns null for undefined provider even with complex prompt', () => {
        const result = buildOllamaComplexityWarning(complexPrompt, 'some-model', undefined);
        expect(result).toBeNull();
    });
});

// ─── buildOllamaComplexityWarning — simple tasks ─────────────────────────────

describe('buildOllamaComplexityWarning — simple tasks', () => {
    test('returns null for simple prompts with Ollama', () => {
        const result = buildOllamaComplexityWarning('list files', 'llama3.3', 'ollama');
        expect(result).toBeNull();
    });

    test('returns null for short status queries', () => {
        const result = buildOllamaComplexityWarning('show status', 'llama3.3', 'ollama');
        expect(result).toBeNull();
    });

    test('returns null for empty prompt', () => {
        const result = buildOllamaComplexityWarning('', 'llama3.3', 'ollama');
        expect(result).toBeNull();
    });

    test('returns null for whitespace-only prompt', () => {
        const result = buildOllamaComplexityWarning('   ', 'llama3.3', 'ollama');
        expect(result).toBeNull();
    });
});

// ─── buildOllamaComplexityWarning — complex tasks ────────────────────────────

describe('buildOllamaComplexityWarning — complex tasks', () => {
    test('returns warning for complex prompt with Ollama', () => {
        const result = buildOllamaComplexityWarning(
            'Refactor the authentication system and optimize database queries',
            'llama3.3',
            'ollama',
        );
        expect(result).not.toBeNull();
        expect(typeof result).toBe('string');
    });

    test('returns warning for expert-level multi-step prompt', () => {
        const result = buildOllamaComplexityWarning(
            'First analyze the security architecture. Then refactor the auth module, migrate to JWT, and implement comprehensive audit logging. After that, design a review process.',
            'qwen3:8b',
            'ollama',
        );
        expect(result).not.toBeNull();
    });

    test('warning includes the model name', () => {
        const model = 'llama3.3';
        const result = buildOllamaComplexityWarning(
            'Refactor and optimize the authentication system',
            model,
            'ollama',
        );
        expect(result).not.toBeNull();
        expect(result!).toContain(model);
    });

    test('warning suggests Claude tier upgrade', () => {
        const result = buildOllamaComplexityWarning(
            'Refactor and optimize the authentication system',
            'llama3.3',
            'ollama',
        );
        expect(result).not.toBeNull();
        expect(result!.toLowerCase()).toContain('claude');
    });

    test('warning includes complexity level', () => {
        const result = buildOllamaComplexityWarning(
            'Refactor and optimize the authentication system',
            'llama3.3',
            'ollama',
        );
        expect(result).not.toBeNull();
        // Should mention either "complex" or "expert"
        expect(result!).toMatch(/complex|expert/);
    });

    test('warning mentions task will proceed (non-blocking signal)', () => {
        const result = buildOllamaComplexityWarning(
            'Refactor and optimize the authentication system',
            'llama3.3',
            'ollama',
        );
        expect(result).not.toBeNull();
        expect(result!.toLowerCase()).toContain('proceed');
    });
});

// ─── Non-blocking behavior ────────────────────────────────────────────────────

describe('buildOllamaComplexityWarning — non-blocking', () => {
    test('never throws for any input combination', () => {
        const inputs: Array<[string, string, string | undefined]> = [
            ['', '', undefined],
            ['   ', 'model', 'ollama'],
            ['complex refactor task', 'llama3.3', 'ollama'],
            ['simple task', 'llama3.3', 'ollama'],
            ['refactor', 'claude-sonnet-4-6', 'anthropic'],
            ['x'.repeat(5000), 'llama3.3', 'ollama'], // very long prompt
        ];

        for (const [prompt, model, provider] of inputs) {
            expect(() => buildOllamaComplexityWarning(prompt, model, provider)).not.toThrow();
        }
    });

    test('returns string or null (never other types)', () => {
        const result = buildOllamaComplexityWarning(
            'Refactor the authentication system for security and performance',
            'llama3.3',
            'ollama',
        );
        expect(result === null || typeof result === 'string').toBe(true);
    });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildOllamaComplexityWarning — determinism', () => {
    test('returns same result for same inputs (stateless)', () => {
        const args: [string, string, string] = [
            'Refactor the authentication system and optimize queries',
            'llama3.3',
            'ollama',
        ];
        const first = buildOllamaComplexityWarning(...args);
        const second = buildOllamaComplexityWarning(...args);
        expect(first).toEqual(second);
    });
});
