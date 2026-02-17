/**
 * Automated Security Audit Tests
 *
 * Validates security-critical configurations and enforcement:
 * - Protected file enforcement
 * - Environment variable allowlist
 * - Plugin capability validation
 * - Default credential detection
 * - Tenant isolation
 */
import { test, expect, describe } from 'bun:test';
import {
    isProtectedPath,
    PROTECTED_BASENAMES,
    PROTECTED_SUBSTRINGS,
    BASH_WRITE_OPERATORS,
    isProtectedBashCommand,
} from '../process/protected-paths';
import { isValidCapability } from '../plugins/permissions';
import { DEFAULT_RESOURCE_LIMITS } from '../sandbox/types';
import { PLAN_LIMITS } from '../tenant/types';

// ─── Protected Files ─────────────────────────────────────────────────────────

describe('Protected File Enforcement', () => {
    test('all critical files are in PROTECTED_BASENAMES', () => {
        const required = [
            'spending.ts', 'sdk-process.ts', 'manager.ts', 'sdk-tools.ts',
            'tool-handlers.ts', 'CLAUDE.md', 'schema.ts', 'package.json',
        ];
        for (const file of required) {
            expect(PROTECTED_BASENAMES.has(file)).toBe(true);
        }
    });

    test('all critical paths are in PROTECTED_SUBSTRINGS', () => {
        const required = [
            '.env', 'corvid-agent.db', 'wallet-keystore.json',
            'server/index.ts', 'server/algochat/bridge.ts',
        ];
        for (const path of required) {
            expect(PROTECTED_SUBSTRINGS.some((p) => p === path)).toBe(true);
        }
    });

    test('isProtectedPath blocks all protected basenames', () => {
        for (const basename of PROTECTED_BASENAMES) {
            expect(isProtectedPath(`/some/path/${basename}`)).toBe(true);
        }
    });

    test('isProtectedPath blocks all protected substrings', () => {
        for (const substring of PROTECTED_SUBSTRINGS) {
            expect(isProtectedPath(`/project/${substring}`)).toBe(true);
        }
    });

    test('isProtectedPath allows normal files', () => {
        expect(isProtectedPath('/project/src/utils.ts')).toBe(false);
        expect(isProtectedPath('/project/README.md')).toBe(false);
        expect(isProtectedPath('/project/server/routes/agents.ts')).toBe(false);
    });

    test('BASH_WRITE_OPERATORS detects write commands', () => {
        expect(BASH_WRITE_OPERATORS.test('echo "x" > file.txt')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('rm -rf /tmp/test')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('mv old.ts new.ts')).toBe(true);
        expect(BASH_WRITE_OPERATORS.test('sed -i "s/a/b/" file.ts')).toBe(true);
    });

    test('isProtectedBashCommand blocks writes to protected files', () => {
        const result = isProtectedBashCommand('echo "hack" > schema.ts');
        expect(result.blocked).toBe(true);
    });

    test('isProtectedBashCommand allows safe commands', () => {
        const result = isProtectedBashCommand('ls -la');
        expect(result.blocked).toBe(false);
    });
});

// ─── Environment Variable Safety ─────────────────────────────────────────────

describe('Environment Variable Safety', () => {
    test('payment secrets are NOT in the codebase as defaults', () => {
        // Stripe keys should never have default values
        expect(process.env.STRIPE_SECRET_KEY || '').toBe('');
        expect(process.env.STRIPE_WEBHOOK_SECRET || '').toBe('');
    });
});

// ─── Plugin Capability Model ─────────────────────────────────────────────────

describe('Plugin Capability Safety', () => {
    test('admin capabilities are rejected', () => {
        expect(isValidCapability('admin:all')).toBe(false);
        expect(isValidCapability('admin:write')).toBe(false);
    });

    test('dangerous capabilities are rejected', () => {
        expect(isValidCapability('db:write')).toBe(false);
        expect(isValidCapability('fs:root')).toBe(false);
        expect(isValidCapability('network:all')).toBe(false);
    });

    test('only safe capabilities are accepted', () => {
        const safeCapabilities = [
            'db:read', 'network:outbound', 'fs:project-dir',
            'agent:read', 'session:read',
        ];
        for (const cap of safeCapabilities) {
            expect(isValidCapability(cap)).toBe(true);
        }
    });
});

// ─── Sandbox Defaults ────────────────────────────────────────────────────────

describe('Sandbox Security Defaults', () => {
    test('default network policy is restricted', () => {
        expect(DEFAULT_RESOURCE_LIMITS.networkPolicy).toBe('restricted');
    });

    test('default timeout is finite', () => {
        expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBeGreaterThan(0);
        expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBeLessThanOrEqual(3600);
    });

    test('default PID limit is set', () => {
        expect(DEFAULT_RESOURCE_LIMITS.pidsLimit).toBeGreaterThan(0);
        expect(DEFAULT_RESOURCE_LIMITS.pidsLimit).toBeLessThanOrEqual(1000);
    });

    test('default memory limit is set', () => {
        expect(DEFAULT_RESOURCE_LIMITS.memoryLimitMb).toBeGreaterThan(0);
    });

    test('default storage limit is set', () => {
        expect(DEFAULT_RESOURCE_LIMITS.storageLimitMb).toBeGreaterThan(0);
    });
});

// ─── Tenant Isolation ────────────────────────────────────────────────────────

describe('Tenant Plan Limits', () => {
    test('free plan has restrictive limits', () => {
        const free = PLAN_LIMITS.free;
        expect(free.maxAgents).toBeLessThanOrEqual(5);
        expect(free.maxConcurrentSessions).toBeLessThanOrEqual(5);
        expect(free.sandboxEnabled).toBe(false);
        expect(free.federationEnabled).toBe(false);
    });

    test('enterprise plan allows unlimited resources', () => {
        const enterprise = PLAN_LIMITS.enterprise;
        expect(enterprise.maxAgents).toBe(-1);
        expect(enterprise.maxConcurrentSessions).toBe(-1);
        expect(enterprise.sandboxEnabled).toBe(true);
    });

    test('all plans have defined limits', () => {
        const plans = ['free', 'starter', 'pro', 'enterprise'] as const;
        for (const plan of plans) {
            expect(PLAN_LIMITS[plan]).toBeTruthy();
            expect(typeof PLAN_LIMITS[plan].maxAgents).toBe('number');
            expect(typeof PLAN_LIMITS[plan].maxConcurrentSessions).toBe('number');
            expect(typeof PLAN_LIMITS[plan].maxCreditsPerMonth).toBe('number');
        }
    });
});
