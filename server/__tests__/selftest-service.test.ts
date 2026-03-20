/**
 * Tests for server/selftest/service.ts and server/selftest/config.ts —
 * SelfTestService setup idempotency and test type prompt selection.
 */

import { test, expect, describe } from 'bun:test';
import { SELF_TEST_PROJECT, SELF_TEST_AGENT } from '../selftest/config';

describe('SELF_TEST_PROJECT config', () => {
    test('has correct name', () => {
        expect(SELF_TEST_PROJECT.name).toBe('corvid-agent (self)');
    });

    test('working dir is cwd', () => {
        expect(SELF_TEST_PROJECT.workingDir).toBe(process.cwd());
    });

    test('claudeMd includes test commands', () => {
        expect(SELF_TEST_PROJECT.claudeMd).toContain('bun test');
        expect(SELF_TEST_PROJECT.claudeMd).toContain('playwright');
    });
});

describe('SELF_TEST_AGENT config', () => {
    test('has required fields', () => {
        expect(SELF_TEST_AGENT.name).toBe('Self-Test Agent');
        expect(SELF_TEST_AGENT.model).toBeDefined();
        expect(SELF_TEST_AGENT.permissionMode).toBe('full-auto');
    });

    test('has appropriate tool access', () => {
        expect(SELF_TEST_AGENT.allowedTools).toContain('Bash');
        expect(SELF_TEST_AGENT.allowedTools).toContain('Read');
        expect(SELF_TEST_AGENT.allowedTools).toContain('Edit');
    });

    test('has a budget limit', () => {
        expect(SELF_TEST_AGENT.maxBudgetUsd).toBeGreaterThan(0);
        expect(SELF_TEST_AGENT.maxBudgetUsd).toBeLessThanOrEqual(10); // sanity check
    });

    test('algochat is disabled for self-test', () => {
        expect(SELF_TEST_AGENT.algochatEnabled).toBe(false);
    });

    test('system prompt matches claudeMd', () => {
        expect(SELF_TEST_AGENT.systemPrompt).toBe(SELF_TEST_PROJECT.claudeMd);
    });
});
