# CorvidAgent Security Architecture

This document describes the security hardening implemented in CorvidAgent Phase 0, addressing critical vulnerabilities and implementing defense-in-depth security measures.

> **Integration Status (Phase 0):** The security components below are implemented as standalone modules with well-defined interfaces. They are **not yet integrated** into the main application's `WorkTaskService`. The existing code in `server/index.ts` still uses the original `WorkTaskService`. Integration into the main application flow is planned for Phase 1. The `SecureWorkTaskService` demonstrates how the components compose together but is not yet wired into the application.

## Security Threat Model

### Critical Vulnerabilities Addressed

1. **Remote Code Execution (RCE)** - Work tasks previously executed arbitrary code without sandboxing
2. **Denial of Service (DoS)** - No rate limiting allowed agent spam and resource exhaustion
3. **Transaction Orphaning** - Failed blockchain transactions had no retry logic
4. **Memory Exposure** - Wallet private keys remained in memory without protection

## Security Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 CorvidAgent Security Layers             │
├─────────────────────────────────────────────────────────┤
│  1. Docker Containerization (RCE Protection)           │
│  2. Rate Limiting System (DoS Prevention)              │
│  3. Transaction Retry Logic (Reliability)              │
│  4. Secure Memory Management (Data Protection)         │
│  5. Comprehensive Audit Logging (Monitoring)           │
└─────────────────────────────────────────────────────────┘
```

## 1. Docker Containerization (RCE Mitigation)

### Problem
Work tasks previously executed directly through `Bun.spawn()` with full system access, allowing malicious agents to:
- Execute arbitrary system commands
- Access sensitive files outside the workspace
- Compromise the host system

### Solution: Secure Docker Sandbox

**Implementation**: `server/work/docker-executor.ts`

#### Security Features
- **Non-root execution** - All code runs as `corvidworker` user
- **Read-only filesystem** - Prevents tampering with system files
- **Network isolation** - No external network access (configurable)
- **Resource limits** - CPU: 1 core, Memory: 512MB, Timeout: 30 minutes
- **Capability dropping** - Removes ALL Linux capabilities, adds only essential ones
- **Tmpfs mounts** - Writable areas in memory only, no persistent changes

#### Container Security Profile
```dockerfile
# Security hardening in Dockerfile
RUN groupadd -r corvidworker && useradd -r -g corvidworker corvidworker
USER corvidworker
--read-only                              # Read-only filesystem
--tmpfs /tmp:rw,noexec,nosuid,size=100m # Secure temp space
--security-opt no-new-privileges:true   # Prevent privilege escalation
--cap-drop ALL                          # Drop all capabilities
--network none                          # No network access
--cpus 1.0 --memory 512m                # Resource limits
```

#### Usage
```typescript
import { DockerExecutor } from './work/docker-executor';

const executor = new DockerExecutor(db, {
    cpuLimit: "1.0",
    memoryLimit: "512m",
    timeoutMinutes: 30,
    networkAccess: false
});

const result = await executor.executeWorkTask(task, prompt, workingDir);
```

## 2. Rate Limiting System (DoS Prevention)

### Problem
Agents could spam operations leading to:
- ALGO fund drainage through message spam
- API cost explosion through excessive operations
- Resource exhaustion through concurrent session abuse

### Solution: Multi-Layer Rate Limiting

**Implementation**: `server/lib/rate-limiter.ts`

#### Rate Limit Categories
```typescript
interface RateLimitRule {
    dailyAlgoLimit: 0.1,        // 0.1 ALGO per day (~$0.02)
    operationsPerMinute: 10,    // 10 operations per minute
    maxConcurrentSessions: 3,   // Max 3 concurrent sessions
    maxWorkTasksPerDay: 5       // Max 5 work tasks per day
}
```

#### Real-time Enforcement
- **Operation counting** - Sliding window per minute
- **Spending tracking** - Daily ALGO spending accumulation
- **Session monitoring** - Active session count per agent
- **Work task quotas** - Daily work task creation limits

#### Database Schema
```sql
CREATE TABLE agent_rate_limits (
    agent_id TEXT PRIMARY KEY,
    daily_algo_limit REAL DEFAULT 0.1,
    operations_per_minute INTEGER DEFAULT 10,
    max_concurrent_sessions INTEGER DEFAULT 3,
    max_work_tasks_per_day INTEGER DEFAULT 5
);

CREATE TABLE daily_operation_counts (
    agent_id TEXT NOT NULL,
    date TEXT NOT NULL,
    work_tasks_created INTEGER DEFAULT 0,
    algo_spent REAL DEFAULT 0,
    PRIMARY KEY (agent_id, date)
);
```

#### Usage
```typescript
import { RateLimiter } from './lib/rate-limiter';

const limiter = new RateLimiter(db);

// Check before operation
const status = limiter.checkOperationLimit(agentId);
if (!status.allowed) {
    throw new Error(`Rate limit exceeded: ${status.violation.message}`);
}

// Record successful operation
limiter.recordOperation(agentId);
```

## 3. Transaction Retry Logic (Reliability)

### Problem
Failed Algorand transactions had no retry mechanism, leading to:
- Lost messages with deducted fees
- Orphaned transaction state
- Poor reliability for on-chain operations

### Solution: Exponential Backoff Retry Service

**Implementation**: `server/algochat/retry-service.ts`

#### Retry Configuration
```typescript
interface RetryConfig {
    maxRetries: 3,                    // Maximum retry attempts
    baseDelayMs: 5000,               // 5 second initial delay
    backoffMultiplier: 2,            // Exponential backoff
    maxDelayMs: 60000,               // 1 minute max delay
    confirmationTimeoutMs: 30000     // 30 second confirmation window
}
```

#### Retry Flow
1. **Submit transaction** - Store pending transaction with retry metadata
2. **Confirmation check** - Poll for transaction confirmation (stub: requires algod integration)
3. **Retry logic** - Resubmit with exponential backoff if failed (stub: requires AlgoChat bridge integration)
4. **State tracking** - Mark as confirmed/failed/expired

> **Note:** Transaction confirmation and resubmission are currently stubs. They require integration with the Algorand `algod` client and the AlgoChat bridge respectively. The retry loop, backoff logic, and persistence layer are fully implemented.

#### Database Schema
```sql
CREATE TABLE pending_transactions (
    id TEXT PRIMARY KEY,
    txid TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    operation TEXT NOT NULL,  -- send_message, publish_key, fund_wallet
    payload TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    next_retry_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pending'  -- pending, confirmed, failed, expired
);
```

#### Usage
```typescript
import { AlgoRetryService } from './algochat/retry-service';

const retryService = new AlgoRetryService(db);

// Submit transaction for retry tracking
const retryId = await retryService.submitTransaction(
    agentId,
    'send_message',
    txid,
    { message: 'Hello, agent!' }
);

// Check status later
const status = retryService.getTransactionInfo(retryId);
```

## 4. Secure Memory Management (Data Protection)

### Problem
Private keys and mnemonics remained in memory after use, vulnerable to:
- Memory dumps exposing sensitive data
- Accidental logging of private keys
- Prolonged exposure increasing attack surface

### Solution: Automatic Memory Protection

**Implementation**: `server/lib/secure-memory.ts`

#### Security Features
- **Automatic zeroing** - Sensitive data cleared after use
- **Secure buffers** - Wrapped Uint8Array with protection
- **Constant-time comparison** - Prevents timing attacks
- **Execution contexts** - Automatic cleanup on function completion

#### API Design
```typescript
import { SecureMemoryManager } from './lib/secure-memory';

// Automatic cleanup with context
await SecureMemoryManager.withSecureContext(
    privateKey,
    async (buffer) => {
        // Use sensitive data
        const signature = await signTransaction(buffer);
        return signature;
        // Buffer automatically zeroed when function exits
    }
);

// Manual buffer management
const buffer = SecureMemoryManager.fromString(privateKey);
try {
    // Use buffer.data for operations
    const result = performCryptographicOperation(buffer.data);
} finally {
    buffer.zero(); // Always clean up
}
```

#### Wallet Operations
```typescript
// Secure wallet operations with automatic cleanup
await SecureMemoryManager.withPrivateKey(
    encryptedMnemonic,
    decryptionKey,
    async (mnemonic) => {
        // Create and use wallet
        const wallet = await createWalletFromMnemonic(mnemonic);
        return wallet.address;
        // Mnemonic automatically zeroed
    }
);
```

## 5. Comprehensive Audit Logging

### Security Event Tracking
All security-relevant events are logged with structured data:

```typescript
// Work task creation audit
log.info('AUDIT: Work task creation requested', {
    timestamp: new Date().toISOString(),
    agentId,
    agentName,
    projectName,
    description: input.description.slice(0, 100),
    securityLevel: 'sandboxed',
    rateLimitStatus: 'enabled'
});

// Rate limit violations
log.warn('AUDIT: Rate limit exceeded', {
    agentId,
    violationType: 'operations_per_minute',
    currentValue: 15,
    limit: 10,
    action: 'request_denied'
});

// Docker execution security
log.info('AUDIT: Sandboxed execution started', {
    taskId,
    containerId,
    securityProfile: 'restricted',
    resourceLimits: { cpu: '1.0', memory: '512m' }
});
```

## Secure Work Task Service Integration

### Enhanced WorkTaskService

**Implementation**: `server/work/secure-service.ts`

The `SecureWorkTaskService` integrates all security layers:

```typescript
export class SecureWorkTaskService {
    private dockerExecutor: DockerExecutor;
    private rateLimiter: RateLimiter;
    private retryService: AlgoRetryService;

    async create(input: CreateWorkTaskInput): Promise<WorkTask> {
        // Security Check 1: Rate limiting
        const rateLimitStatus = await this.checkRateLimits(input.agentId);
        if (!rateLimitStatus.allowed) {
            throw new Error(`Rate limit exceeded: ${rateLimitStatus.violation?.message}`);
        }

        // Security Check 2: Audit logging
        this.auditWorkTaskCreation(input, agent.name, project.name);

        // Security Check 3: Sandboxed execution
        if (this.config.enableSandboxing) {
            return await this.executeInDockerSandbox(task, branchName, description, projectWorkingDir);
        }
    }
}
```

## Security Configuration

### Environment Variables
```bash
# Docker security settings
DOCKER_SANDBOX_ENABLED=true
DOCKER_CPU_LIMIT=1.0
DOCKER_MEMORY_LIMIT=512m
DOCKER_TIMEOUT_MINUTES=30
DOCKER_NETWORK_ACCESS=false

# Rate limiting configuration
RATE_LIMIT_ENABLED=true
RATE_LIMIT_OPERATIONS_PER_MINUTE=10
RATE_LIMIT_DAILY_ALGO_LIMIT=0.1
RATE_LIMIT_MAX_CONCURRENT_SESSIONS=3
RATE_LIMIT_MAX_WORK_TASKS_PER_DAY=5

# Retry service settings
RETRY_SERVICE_ENABLED=true
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY_MS=5000
RETRY_MAX_DELAY_MS=60000

# Memory protection
SECURE_MEMORY_ENABLED=true
SECURE_MEMORY_CLEANUP_INTERVAL=30000
```

### Security Modes
1. **Maximum Security** (Production)
   - All protections enabled
   - Strict rate limits
   - Full audit logging

2. **Development Mode**
   - Sandboxing enabled but relaxed limits
   - Enhanced logging for debugging

3. **Testing Mode**
   - Mock security services for unit tests
   - Bypass for controlled testing scenarios

## Security Testing

### Test Coverage
**Implementation**: `server/__tests__/security.test.ts`

Comprehensive tests validate:
- Rate limiting enforcement
- Docker sandbox isolation
- Memory protection mechanisms
- Transaction retry logic
- Security integration layers

### Running Security Tests
```bash
# Run all security tests
bun test server/__tests__/security.test.ts

# Test specific security layer
bun test --grep "Rate Limiter Security"
bun test --grep "Docker Executor Security"
bun test --grep "Secure Memory Management"
```

## Security Monitoring

### Health Checks
```typescript
// Docker availability
const dockerHealth = await dockerExecutor.healthCheck();

// Rate limiter status
const rateLimitStatus = rateLimiter.getUsageStats(agentId);

// Retry service statistics
const retryStats = retryService.getRetryStats();
```

### Security Metrics
- **Sandbox execution rate** - Percentage of tasks using sandboxing
- **Rate limit violations** - Count and types of violations
- **Transaction retry success rate** - Retry effectiveness
- **Memory protection coverage** - Sensitive operations protected

### Alerts
- Docker service unavailable
- Rate limit violation patterns
- High transaction failure rates
- Memory protection failures

## Security Best Practices

### For Developers
1. **Use secure services when integrated** - Once `SecureWorkTaskService` is wired into the application, prefer it over the legacy service
2. **Test security features** - Include security tests in all new features
3. **Audit logging** - Log all security-relevant events
4. **Memory protection** - Use `SecureMemoryManager` for sensitive data

### For Operators
1. **Monitor security metrics** - Set up alerts for violations
2. **Regular security reviews** - Review logs and update policies
3. **Keep containers updated** - Update sandbox images regularly
4. **Backup security configs** - Version control security settings

### For Agents
1. **Respect rate limits** - Implement proper backoff and retry logic
2. **Use secure coding practices** - Follow security guidelines in generated code
3. **Report security issues** - Flag potential vulnerabilities in outputs

## Future Security Enhancements

### Planned Improvements
1. **Hardware Security Module (HSM) integration** - External key management
2. **Network segmentation** - Separate agent networks
3. **Advanced monitoring** - ML-based anomaly detection
4. **Zero-trust architecture** - Verify every operation
5. **Formal verification** - Mathematical proofs of security properties

### Security Roadmap
- **Phase 0** (Current): Core security modules implemented as standalone components
- **Phase 1** (Next): Integrate security modules into main application flow, add algod/AlgoChat bridge integration
- **Phase 2** (Future): Advanced threat detection
- **Phase 3** (Future): Zero-trust implementation
- **Phase 4** (Future): Formal security verification

## Security Contact

For security issues or questions:
- **Security Team**: [security@corvidlabs.ai](mailto:security@corvidlabs.ai)
- **Bug Bounty**: Report security vulnerabilities through responsible disclosure
- **Emergency**: Critical security issues require immediate attention

---

**Security is a journey, not a destination.** This architecture provides strong foundation security, but ongoing vigilance and updates are essential for maintaining protection against evolving threats.