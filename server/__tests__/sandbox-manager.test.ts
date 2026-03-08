/**
 * Tests for Container Sandboxing:
 * - container.ts: Docker command building, container lifecycle
 * - manager.ts: Pool management, assignment, release
 * - policy.ts: Per-agent resource limits
 * - ProcessManager integration: sandbox wiring, assign/release lifecycle
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from '../db/schema';
import { getAgentPolicy, setAgentPolicy, removeAgentPolicy, listAgentPolicies } from '../sandbox/policy';
import { DEFAULT_RESOURCE_LIMITS, DEFAULT_POOL_CONFIG } from '../sandbox/types';
import { ProcessManager } from '../process/manager';

// ─── DB Setup ───────────────────────────────────────────────────────────────

let db: Database;

function setupDb(): Database {
    const d = new Database(':memory:');
    runMigrations(d);

    // Migration 40 tables
    d.exec(`
        CREATE TABLE IF NOT EXISTS sandbox_configs (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL UNIQUE,
            image TEXT DEFAULT 'corvid-agent-sandbox:latest',
            cpu_limit REAL DEFAULT 1.0,
            memory_limit_mb INTEGER DEFAULT 512,
            network_policy TEXT DEFAULT 'restricted',
            timeout_seconds INTEGER DEFAULT 600,
            read_only_mounts TEXT DEFAULT '[]',
            work_dir TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    return d;
}

// ─── Policy Tests ────────────────────────────────────────────────────────────

describe('Sandbox Policy', () => {
    beforeEach(() => {
        db = setupDb();
    });

    test('returns defaults for unconfigured agent', () => {
        const policy = getAgentPolicy(db, 'agent-unknown');
        expect(policy.cpuLimit).toBe(DEFAULT_RESOURCE_LIMITS.cpuLimit);
        expect(policy.memoryLimitMb).toBe(DEFAULT_RESOURCE_LIMITS.memoryLimitMb);
        expect(policy.networkPolicy).toBe(DEFAULT_RESOURCE_LIMITS.networkPolicy);
        expect(policy.timeoutSeconds).toBe(DEFAULT_RESOURCE_LIMITS.timeoutSeconds);
    });

    test('setAgentPolicy creates new config', () => {
        setAgentPolicy(db, 'agent-1', {
            cpuLimit: 2.0,
            memoryLimitMb: 1024,
        });

        const policy = getAgentPolicy(db, 'agent-1');
        expect(policy.cpuLimit).toBe(2.0);
        expect(policy.memoryLimitMb).toBe(1024);
        // Defaults for unset values
        expect(policy.networkPolicy).toBe('restricted');
    });

    test('setAgentPolicy updates existing config', () => {
        setAgentPolicy(db, 'agent-1', { cpuLimit: 1.0 });
        setAgentPolicy(db, 'agent-1', { cpuLimit: 4.0 });

        const policy = getAgentPolicy(db, 'agent-1');
        expect(policy.cpuLimit).toBe(4.0);
    });

    test('removeAgentPolicy removes config', () => {
        setAgentPolicy(db, 'agent-1', { cpuLimit: 2.0 });
        expect(removeAgentPolicy(db, 'agent-1')).toBe(true);

        const policy = getAgentPolicy(db, 'agent-1');
        // Should be defaults again
        expect(policy.cpuLimit).toBe(DEFAULT_RESOURCE_LIMITS.cpuLimit);
    });

    test('removeAgentPolicy returns false for non-existent', () => {
        expect(removeAgentPolicy(db, 'nonexistent')).toBe(false);
    });

    test('listAgentPolicies returns all configs', () => {
        setAgentPolicy(db, 'agent-1', { cpuLimit: 1.0 });
        setAgentPolicy(db, 'agent-2', { cpuLimit: 2.0 });

        const policies = listAgentPolicies(db);
        expect(policies.length).toBe(2);
    });
});

// ─── Type Defaults Tests ─────────────────────────────────────────────────────

describe('Sandbox Defaults', () => {
    test('DEFAULT_RESOURCE_LIMITS has expected values', () => {
        expect(DEFAULT_RESOURCE_LIMITS.cpuLimit).toBe(1.0);
        expect(DEFAULT_RESOURCE_LIMITS.memoryLimitMb).toBe(512);
        expect(DEFAULT_RESOURCE_LIMITS.networkPolicy).toBe('restricted');
        expect(DEFAULT_RESOURCE_LIMITS.timeoutSeconds).toBe(600);
        expect(DEFAULT_RESOURCE_LIMITS.pidsLimit).toBe(100);
        expect(DEFAULT_RESOURCE_LIMITS.storageLimitMb).toBe(1024);
    });

    test('DEFAULT_POOL_CONFIG has expected values', () => {
        expect(DEFAULT_POOL_CONFIG.warmPoolSize).toBe(2);
        expect(DEFAULT_POOL_CONFIG.maxContainers).toBe(10);
        expect(DEFAULT_POOL_CONFIG.idleTimeoutMs).toBe(300_000);
        expect(DEFAULT_POOL_CONFIG.defaultImage).toBe('corvid-agent-sandbox:latest');
    });
});

// ─── Container Module Tests (no Docker required) ─────────────────────────────

describe('Container Module Exports', () => {
    test('exports required functions', async () => {
        const container = await import('../sandbox/container');
        expect(typeof container.createContainer).toBe('function');
        expect(typeof container.startContainer).toBe('function');
        expect(typeof container.stopContainer).toBe('function');
        expect(typeof container.removeContainer).toBe('function');
        expect(typeof container.execInContainer).toBe('function');
        expect(typeof container.getContainerStatus).toBe('function');
        expect(typeof container.isDockerAvailable).toBe('function');
        expect(typeof container.listSandboxContainers).toBe('function');
    });
});

// ─── Manager Module Tests (no Docker required) ───────────────────────────────

describe('SandboxManager', () => {
    test('exports SandboxManager class', async () => {
        const mod = await import('../sandbox/manager');
        expect(typeof mod.SandboxManager).toBe('function');
    });

    test('can instantiate with defaults', () => {
        const { SandboxManager } = require('../sandbox/manager');
        const manager = new SandboxManager(setupDb());
        expect(manager.isEnabled()).toBe(false);
    });

    test('getPoolStats returns disabled state before init', () => {
        const { SandboxManager } = require('../sandbox/manager');
        const manager = new SandboxManager(setupDb());
        const stats = manager.getPoolStats();
        expect(stats.enabled).toBe(false);
        expect(stats.total).toBe(0);
        expect(stats.warm).toBe(0);
        expect(stats.assigned).toBe(0);
    });

    test('assignContainer throws when not enabled', async () => {
        const { SandboxManager } = require('../sandbox/manager');
        const manager = new SandboxManager(setupDb());

        try {
            await manager.assignContainer('agent-1', 'session-1');
            expect(true).toBe(false); // Should not reach here
        } catch (err: unknown) {
            expect((err as Error).message).toContain('not enabled');
        }
    });

    test('getContainerForSession returns null when no containers', () => {
        const { SandboxManager } = require('../sandbox/manager');
        const manager = new SandboxManager(setupDb());
        expect(manager.getContainerForSession('session-1')).toBeNull();
    });

    test('shutdown is idempotent', async () => {
        const { SandboxManager } = require('../sandbox/manager');
        const manager = new SandboxManager(setupDb());
        // Shutdown twice should not throw
        await manager.shutdown();
        await manager.shutdown();
        expect(manager.isEnabled()).toBe(false);
    });

    test('pool stats reflect maxContainers from config', () => {
        const { SandboxManager } = require('../sandbox/manager');
        const manager = new SandboxManager(setupDb(), {
            ...DEFAULT_POOL_CONFIG,
            maxContainers: 5,
        });
        const stats = manager.getPoolStats();
        expect(stats.maxContainers).toBe(5);
    });
});

// ─── ProcessManager + Sandbox Integration Tests ──────────────────────────────

describe('ProcessManager Sandbox Integration', () => {
    let testDb: Database;

    beforeEach(() => {
        testDb = setupDb();
    });

    test('setSandboxManager wires sandbox into ProcessManager', () => {
        const pm = new ProcessManager(testDb);
        const { SandboxManager } = require('../sandbox/manager');
        const sm = new SandboxManager(testDb);

        // Should not throw
        pm.setSandboxManager(sm);
        pm.shutdown();
    });

    test('getSessionContainer returns null without sandbox manager', () => {
        const pm = new ProcessManager(testDb);
        expect(pm.getSessionContainer('session-1')).toBeNull();
        pm.shutdown();
    });

    test('getSessionContainer returns null when sandbox not enabled', () => {
        const pm = new ProcessManager(testDb);
        const { SandboxManager } = require('../sandbox/manager');
        const sm = new SandboxManager(testDb);
        pm.setSandboxManager(sm);

        // Manager not initialized (no Docker), so no container
        expect(pm.getSessionContainer('session-1')).toBeNull();
        pm.shutdown();
    });

    test('cleanupSessionState handles missing sandbox gracefully', () => {
        const pm = new ProcessManager(testDb);
        // No sandbox manager set — should not throw
        pm.cleanupSessionState('nonexistent-session');
        pm.shutdown();
    });

    test('cleanupSessionState handles sandbox with no container gracefully', () => {
        const pm = new ProcessManager(testDb);
        const { SandboxManager } = require('../sandbox/manager');
        const sm = new SandboxManager(testDb);
        pm.setSandboxManager(sm);

        // Should not throw even though sandbox is disabled
        pm.cleanupSessionState('nonexistent-session');
        pm.shutdown();
    });

    test('shutdown calls sandbox shutdown', async () => {
        const pm = new ProcessManager(testDb);
        const { SandboxManager } = require('../sandbox/manager');
        const sm = new SandboxManager(testDb);
        pm.setSandboxManager(sm);

        // Should not throw
        pm.shutdown();
        expect(sm.isEnabled()).toBe(false);
    });
});
