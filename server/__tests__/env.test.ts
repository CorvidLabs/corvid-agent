import { describe, it, expect, afterEach } from 'bun:test';
import { buildSafeGhEnv } from '../lib/env';

describe('buildSafeGhEnv', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore env to original state
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        Object.assign(process.env, originalEnv);
    });

    it('includes PATH when present', () => {
        const env = buildSafeGhEnv();
        if (process.env.PATH) {
            expect(env.PATH).toBe(process.env.PATH);
        }
    });

    it('includes HOME when present', () => {
        const env = buildSafeGhEnv();
        if (process.env.HOME) {
            expect(env.HOME).toBe(process.env.HOME);
        }
    });

    it('includes GH_TOKEN when set', () => {
        process.env.GH_TOKEN = 'ghp_test123';
        const env = buildSafeGhEnv();
        expect(env.GH_TOKEN).toBe('ghp_test123');
    });

    it('includes GITHUB_TOKEN when set', () => {
        process.env.GITHUB_TOKEN = 'ghp_another';
        const env = buildSafeGhEnv();
        expect(env.GITHUB_TOKEN).toBe('ghp_another');
    });

    it('does NOT include ANTHROPIC_API_KEY', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-secret';
        const env = buildSafeGhEnv();
        expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('does NOT include ALGORAND_MNEMONIC', () => {
        process.env.ALGORAND_MNEMONIC = 'abandon abandon abandon';
        const env = buildSafeGhEnv();
        expect(env.ALGORAND_MNEMONIC).toBeUndefined();
    });

    it('does NOT include API_KEY', () => {
        process.env.API_KEY = 'secret-api-key';
        const env = buildSafeGhEnv();
        expect(env.API_KEY).toBeUndefined();
    });

    it('does NOT include DATABASE_URL', () => {
        process.env.DATABASE_URL = 'postgres://secret';
        const env = buildSafeGhEnv();
        expect(env.DATABASE_URL).toBeUndefined();
    });

    it('omits undefined env vars from the result', () => {
        delete process.env.COMSPEC; // Windows-only, likely not set on macOS
        const env = buildSafeGhEnv();
        expect('COMSPEC' in env).toBe(false);
    });

    it('includes git author env vars when set', () => {
        process.env.GIT_AUTHOR_NAME = 'corvid-agent';
        process.env.GIT_AUTHOR_EMAIL = 'agent@corvid.dev';
        const env = buildSafeGhEnv();
        expect(env.GIT_AUTHOR_NAME).toBe('corvid-agent');
        expect(env.GIT_AUTHOR_EMAIL).toBe('agent@corvid.dev');
    });

    it('returns only string values', () => {
        const env = buildSafeGhEnv();
        for (const [key, val] of Object.entries(env)) {
            expect(typeof key).toBe('string');
            expect(typeof val).toBe('string');
        }
    });
});
