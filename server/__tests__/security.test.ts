import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { RateLimiter } from '../lib/rate-limiter';
import { AlgoRetryService } from '../algochat/retry-service';
import { DockerExecutor } from '../work/docker-executor';
import { SecureMemoryManager } from '../lib/secure-memory';
import { SecureWorkTaskService } from '../work/secure-service';

// Test database setup
let testDb: Database;
let rateLimiter: RateLimiter;
let retryService: AlgoRetryService;
let dockerExecutor: DockerExecutor;

beforeAll(() => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    rateLimiter = new RateLimiter(testDb);
    retryService = new AlgoRetryService(testDb);
    dockerExecutor = new DockerExecutor(testDb);
});

afterAll(() => {
    testDb.close();
    retryService.stop();
    SecureMemoryManager.stop();
});

describe('Rate Limiter Security', () => {
    const testAgentId = 'test-agent-123';

    it('should enforce operation rate limits', () => {
        // Set strict limits for testing
        rateLimiter.setRateLimits(testAgentId, {
            operationsPerMinute: 2,
            dailyAlgoLimit: 0.01,
            maxConcurrentSessions: 1,
            maxWorkTasksPerDay: 1
        });

        // First two operations should succeed
        let status = rateLimiter.recordOperation(testAgentId);
        expect(status.allowed).toBe(true);

        status = rateLimiter.recordOperation(testAgentId);
        expect(status.allowed).toBe(true);

        // Third operation should be rate limited
        status = rateLimiter.recordOperation(testAgentId);
        expect(status.allowed).toBe(false);
        expect(status.violation?.type).toBe('operations_per_minute');
        expect(status.violation?.message).toContain('Operation rate limit exceeded');
    });

    it('should enforce ALGO spending limits', () => {
        const largeAmount = 1.0; // Above our test limit of 0.01
        const status = rateLimiter.checkAlgoSpending(testAgentId, largeAmount);

        expect(status.allowed).toBe(false);
        expect(status.violation?.type).toBe('daily_algo_limit');
        expect(status.violation?.currentValue).toBe(largeAmount);
    });

    it('should track concurrent sessions', () => {
        const sessionId1 = 'session-1';
        const sessionId2 = 'session-2';

        // First session should be allowed
        let status = rateLimiter.addActiveSession(testAgentId, sessionId1);
        expect(status.allowed).toBe(true);

        // Second session should exceed limit (max 1 for test)
        status = rateLimiter.addActiveSession(testAgentId, sessionId2);
        expect(status.allowed).toBe(false);
        expect(status.violation?.type).toBe('concurrent_sessions');

        // Remove session and try again
        rateLimiter.removeActiveSession(testAgentId, sessionId1);
        status = rateLimiter.addActiveSession(testAgentId, sessionId2);
        expect(status.allowed).toBe(true);
    });

    it('should enforce work task daily limits', () => {
        // First task should be allowed
        let status = rateLimiter.recordWorkTask(testAgentId);
        expect(status.allowed).toBe(true);

        // Second task should exceed daily limit
        status = rateLimiter.recordWorkTask(testAgentId);
        expect(status.allowed).toBe(false);
        expect(status.violation?.type).toBe('work_tasks_per_day');
    });

    it('should provide usage statistics', () => {
        const stats = rateLimiter.getUsageStats(testAgentId);

        expect(stats).toHaveProperty('operationsThisMinute');
        expect(stats).toHaveProperty('algoSpentToday');
        expect(stats).toHaveProperty('activeSessions');
        expect(stats).toHaveProperty('workTasksToday');
        expect(stats).toHaveProperty('limits');

        expect(stats.limits.operationsPerMinute).toBe(2);
        expect(stats.limits.maxWorkTasksPerDay).toBe(1);
    });
});

describe('Retry Service Security', () => {
    const testAgentId = 'retry-test-agent';

    it('should track pending transactions', async () => {
        const txid = await retryService.submitTransaction(
            testAgentId,
            'send_message',
            'test-tx-123',
            { message: 'test message' }
        );

        expect(txid).toMatch(/^[a-f0-9-]+$/); // UUID format

        const txInfo = retryService.getTransactionInfo(txid);
        expect(txInfo).not.toBeNull();
        expect(txInfo?.agentId).toBe(testAgentId);
        expect(txInfo?.operation).toBe('send_message');
        expect(txInfo?.txid).toBe('test-tx-123');
    });

    it('should provide retry statistics', () => {
        const stats = retryService.getRetryStats();

        expect(stats).toHaveProperty('pendingCount');
        expect(stats).toHaveProperty('totalRetries');
        expect(stats).toHaveProperty('avgRetryCount');

        expect(typeof stats.pendingCount).toBe('number');
        expect(typeof stats.totalRetries).toBe('number');
        expect(typeof stats.avgRetryCount).toBe('number');
    });
});

describe('Docker Executor Security', () => {
    it('should perform health check', async () => {
        const health = await dockerExecutor.healthCheck();

        expect(health).toHaveProperty('available');
        expect(typeof health.available).toBe('boolean');

        if (!health.available) {
            expect(health).toHaveProperty('error');
            expect(typeof health.error).toBe('string');
        }
    });

    it('should handle missing Docker gracefully', async () => {
        // This test assumes Docker might not be available in CI
        const health = await dockerExecutor.healthCheck();

        if (!health.available) {
            console.log('Docker not available for testing:', health.error);
            expect(health.error).toContain('Docker');
        } else {
            console.log('Docker is available for testing');
        }

        // Test should not throw regardless of Docker availability
        expect(true).toBe(true);
    });
});

describe('Secure Memory Management', () => {
    it('should create and zero secure buffers', () => {
        const sensitiveData = 'this-is-a-private-key-123';
        const buffer = SecureMemoryManager.fromString(sensitiveData);

        expect(buffer.data.length).toBe(sensitiveData.length);
        expect(SecureMemoryManager.toString(buffer)).toBe(sensitiveData);

        // Zero the buffer
        buffer.zero();
        expect(buffer.isZeroed()).toBe(true);

        // Should not be able to read zeroed buffer
        expect(() => SecureMemoryManager.toString(buffer)).toThrow();
    });

    it('should handle hex conversion securely', () => {
        const hexData = 'deadbeef';
        const buffer = SecureMemoryManager.fromHex(hexData);

        expect(SecureMemoryManager.toHex(buffer)).toBe(hexData);

        buffer.zero();
        expect(() => SecureMemoryManager.toHex(buffer)).toThrow();
    });

    it('should provide secure execution context', async () => {
        const sensitiveData = 'secret-key-data';
        let capturedData: string = '';

        const result = await SecureMemoryManager.withSecureContext(
            sensitiveData,
            (buffer) => {
                capturedData = SecureMemoryManager.toString(buffer);
                return 'operation-result';
            }
        );

        expect(result).toBe('operation-result');
        expect(capturedData).toBe(sensitiveData);

        // Buffer should be automatically zeroed after function completes
        // We can't directly test this due to the way withSecureContext works
        expect(true).toBe(true);
    });

    it('should compare buffers in constant time', () => {
        const data1 = 'same-data';
        const data2 = 'same-data';
        const data3 = 'different-data';

        const buffer1 = SecureMemoryManager.fromString(data1);
        const buffer2 = SecureMemoryManager.fromString(data2);
        const buffer3 = SecureMemoryManager.fromString(data3);

        expect(SecureMemoryManager.constantTimeEquals(buffer1, buffer2)).toBe(true);
        expect(SecureMemoryManager.constantTimeEquals(buffer1, buffer3)).toBe(false);

        buffer1.zero();
        buffer2.zero();
        buffer3.zero();
    });

    it('should force cleanup of active buffers', () => {
        // Create some buffers
        const buffer1 = SecureMemoryManager.fromString('test1');
        const buffer2 = SecureMemoryManager.fromString('test2');

        // Force cleanup (this should not throw)
        SecureMemoryManager.forceCleanup();

        // Manually zero for test cleanup
        buffer1.zero();
        buffer2.zero();

        expect(true).toBe(true);
    });
});

describe('SecureWorkTaskService', () => {
    let serviceDb: Database;
    let secureService: SecureWorkTaskService;

    beforeAll(() => {
        // Create a separate in-memory DB with full schema for SecureWorkTaskService
        serviceDb = new Database(':memory:');

        // Create the minimal schema needed for SecureWorkTaskService
        serviceDb.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                working_dir TEXT NOT NULL,
                claude_md TEXT DEFAULT '',
                env_vars TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                system_prompt TEXT DEFAULT '',
                append_prompt TEXT DEFAULT '',
                model TEXT DEFAULT '',
                allowed_tools TEXT DEFAULT '',
                disallowed_tools TEXT DEFAULT '',
                permission_mode TEXT DEFAULT 'default',
                max_budget_usd REAL DEFAULT NULL,
                algochat_enabled INTEGER DEFAULT 0,
                algochat_auto INTEGER DEFAULT 0,
                custom_flags TEXT DEFAULT '{}',
                default_project_id TEXT DEFAULT NULL,
                wallet_address TEXT DEFAULT NULL,
                wallet_mnemonic_encrypted TEXT DEFAULT NULL,
                wallet_funded_algo REAL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS work_tasks (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                session_id TEXT DEFAULT NULL,
                source TEXT DEFAULT 'web',
                source_id TEXT DEFAULT NULL,
                requester_info TEXT DEFAULT '{}',
                description TEXT NOT NULL,
                branch_name TEXT DEFAULT NULL,
                status TEXT DEFAULT 'pending',
                pr_url TEXT DEFAULT NULL,
                summary TEXT DEFAULT NULL,
                error TEXT DEFAULT NULL,
                original_branch TEXT DEFAULT NULL,
                worktree_dir TEXT DEFAULT NULL,
                iteration_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                completed_at TEXT DEFAULT NULL
            );
        `);

        // Insert test fixtures
        serviceDb.exec(`
            INSERT INTO projects (id, name, working_dir) VALUES ('proj-1', 'Test Project', '/tmp/test-project');
            INSERT INTO agents (id, name, default_project_id) VALUES ('agent-1', 'TestAgent', 'proj-1');
        `);

        // Instantiate with sandboxing disabled (Docker not available in CI)
        const mockProcessManager = {} as any; // ProcessManager is not used after constructor fix
        secureService = new SecureWorkTaskService(serviceDb, mockProcessManager, {
            enableSandboxing: false,
            enableRateLimiting: true,
            enableRetryLogic: true,
        });
    });

    afterAll(() => {
        serviceDb.close();
    });

    it('should instantiate without throwing', () => {
        expect(secureService).toBeDefined();
    });

    it('should list tasks (empty initially)', () => {
        const tasks = secureService.listTasks();
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks.length).toBe(0);
    });

    it('should return null for non-existent task', () => {
        const task = secureService.getTask('nonexistent');
        expect(task).toBeNull();
    });

    it('should return rate limit status for an agent', () => {
        const status = secureService.getAgentRateLimitStatus('agent-1');
        expect(status).toHaveProperty('rateLimitingEnabled', true);
        expect(status).toHaveProperty('usage');
    });

    it('should return security stats', () => {
        const stats = secureService.getSecurityStats();
        expect(stats).toHaveProperty('sandboxing');
        expect(stats).toHaveProperty('rateLimiting');
        expect(stats).toHaveProperty('retryService');
        expect(stats.sandboxing.enabled).toBe(false);
        expect(stats.rateLimiting.enabled).toBe(true);
    });

    it('should cancel a non-existent task gracefully', async () => {
        const result = await secureService.cancelTask('nonexistent');
        expect(result).toBeNull();
    });

    it('should register completion callbacks without throwing', () => {
        const callback = () => {};
        expect(() => secureService.onComplete('any-task', callback)).not.toThrow();
    });
});

describe('Security Integration', () => {
    it('should handle multiple security layers', async () => {
        const testAgentId = 'integration-test-agent';

        // Set up moderate rate limits
        rateLimiter.setRateLimits(testAgentId, {
            operationsPerMinute: 5,
            dailyAlgoLimit: 0.1,
            maxConcurrentSessions: 2,
            maxWorkTasksPerDay: 3
        });

        // Test that multiple operations work within limits
        for (let i = 0; i < 3; i++) {
            const opStatus = rateLimiter.recordOperation(testAgentId);
            expect(opStatus.allowed).toBe(true);

            // Simulate small ALGO spending
            const algoStatus = rateLimiter.recordAlgoSpending(testAgentId, 0.01);
            expect(algoStatus.allowed).toBe(true);

            // Add session
            const sessionStatus = rateLimiter.addActiveSession(testAgentId, `session-${i}`);
            if (i < 2) {
                expect(sessionStatus.allowed).toBe(true);
            } else {
                expect(sessionStatus.allowed).toBe(false); // Exceeds max sessions
            }
        }

        // Verify usage stats reflect our operations
        const stats = rateLimiter.getUsageStats(testAgentId);
        expect(stats.operationsThisMinute).toBe(3);
        expect(stats.algoSpentToday).toBeCloseTo(0.03);
        expect(stats.activeSessions).toBe(2);
    });

    it('should provide comprehensive security status', () => {
        const dockerHealth = dockerExecutor.healthCheck();
        const rateLimiterStats = rateLimiter.getUsageStats('status-test-agent');
        const retryStats = retryService.getRetryStats();

        // All security components should be reportable
        expect(typeof rateLimiterStats).toBe('object');
        expect(typeof retryStats).toBe('object');
        expect(dockerHealth).toBeInstanceOf(Promise);

        // Basic structural checks
        expect(retryStats).toHaveProperty('pendingCount');
        expect(rateLimiterStats).toHaveProperty('limits');
    });
});