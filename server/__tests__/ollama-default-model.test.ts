/**
 * Tests for OLLAMA_DEFAULT_MODEL env var support (#1526).
 *
 * Verifies that:
 * - OLLAMA_DEFAULT_LOCAL_MODEL constant reads from env var
 * - DEFAULT_FALLBACK_CHAINS['local'] uses the constant
 * - OllamaProviderConfig type accepts defaultModel field
 * - config loader maps OLLAMA_DEFAULT_MODEL env var correctly
 */
import { describe, it, expect } from 'bun:test';
import { OLLAMA_DEFAULT_LOCAL_MODEL, DEFAULT_FALLBACK_CHAINS } from '../providers/fallback';

describe('OLLAMA_DEFAULT_MODEL configuration', () => {
    describe('OLLAMA_DEFAULT_LOCAL_MODEL constant', () => {
        it('reads from OLLAMA_DEFAULT_MODEL env var when set', () => {
            // The constant is set at module load time, so this test
            // verifies the value is consistent with current env state.
            const expected = process.env.OLLAMA_DEFAULT_MODEL ?? 'qwen3:14b';
            expect(OLLAMA_DEFAULT_LOCAL_MODEL).toBe(expected);
        });

        it('falls back to qwen3:14b when env var is unset', () => {
            if (!process.env.OLLAMA_DEFAULT_MODEL) {
                expect(OLLAMA_DEFAULT_LOCAL_MODEL).toBe('qwen3:14b');
            }
        });

        it('is a non-empty string', () => {
            expect(typeof OLLAMA_DEFAULT_LOCAL_MODEL).toBe('string');
            expect(OLLAMA_DEFAULT_LOCAL_MODEL.length).toBeGreaterThan(0);
        });
    });

    describe('DEFAULT_FALLBACK_CHAINS local chain', () => {
        it('uses OLLAMA_DEFAULT_LOCAL_MODEL for the local chain model', () => {
            const local = DEFAULT_FALLBACK_CHAINS['local'];
            expect(local.chain).toHaveLength(1);
            expect(local.chain[0].model).toBe(OLLAMA_DEFAULT_LOCAL_MODEL);
        });

        it('local chain provider is ollama', () => {
            const local = DEFAULT_FALLBACK_CHAINS['local'];
            expect(local.chain[0].provider).toBe('ollama');
        });
    });
});

describe('OllamaProviderConfig defaultModel field', () => {
    it('type accepts defaultModel as optional string', () => {
        // Type-only test: ensure the interface compiles with defaultModel
        const config: import('../../shared/types/agent-config').OllamaProviderConfig = {
            host: 'http://localhost:11434',
            defaultModel: 'llama3:8b',
        };
        expect(config.defaultModel).toBe('llama3:8b');
    });

    it('type allows omitting defaultModel', () => {
        const config: import('../../shared/types/agent-config').OllamaProviderConfig = {
            host: 'http://localhost:11434',
        };
        expect(config.defaultModel).toBeUndefined();
    });
});

describe('config loader OLLAMA_DEFAULT_MODEL mapping', () => {
    it('configFromEnv maps OLLAMA_DEFAULT_MODEL to providers.ollama.defaultModel', () => {
        const { configFromEnv } = require('../config/loader');
        const saved = process.env.OLLAMA_DEFAULT_MODEL;
        process.env.OLLAMA_DEFAULT_MODEL = 'llama3.2:3b';
        try {
            const config = configFromEnv();
            expect(config.providers.ollama?.defaultModel).toBe('llama3.2:3b');
        } finally {
            if (saved === undefined) {
                delete process.env.OLLAMA_DEFAULT_MODEL;
            } else {
                process.env.OLLAMA_DEFAULT_MODEL = saved;
            }
        }
    });

    it('configFromEnv sets ollama.defaultModel to undefined when env var is not set', () => {
        const { configFromEnv } = require('../config/loader');
        const saved = process.env.OLLAMA_DEFAULT_MODEL;
        delete process.env.OLLAMA_DEFAULT_MODEL;
        try {
            const config = configFromEnv();
            expect(config.providers.ollama?.defaultModel).toBeUndefined();
        } finally {
            if (saved !== undefined) {
                process.env.OLLAMA_DEFAULT_MODEL = saved;
            }
        }
    });
});
