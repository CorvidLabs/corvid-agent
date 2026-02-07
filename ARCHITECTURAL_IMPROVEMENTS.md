# CorvidAgent Architectural Improvements

## Overview

This document outlines the architectural improvements implemented to address scalability, security, and maintainability issues identified through a multi-agent council review.

## Architecture Principles

CorvidAgent is a **local-first** application. Each user runs their own instance on their own machine with their own AI provider credentials (e.g. Claude subscription). There is no multi-tenant server or shared infrastructure.

**Authentication model:** On-chain identity via Algorand addresses. The `ALGOCHAT_OWNER_ADDRESSES` environment variable controls who can execute privileged commands over AlgoChat. The dashboard API is open on localhost — no JWT/API-key authentication is needed since only the local user has access.

## Implemented Solutions

### 1. ProcessManager Memory Management

**Problem**: ProcessManager had unbounded growth of process maps, session metadata, and timer references, leading to memory leaks over time.

**Solution**: Comprehensive session lifecycle management:

#### Session Lifecycle Manager (`server/process/session-lifecycle.ts`)
- Automatic cleanup of expired sessions (configurable TTL, default 7 days)
- Session limits per project (default 100 sessions)
- Cleanup of orphaned messages and approval requests
- Memory usage monitoring and reporting
- Configurable cleanup intervals

#### ProcessManager Improvements (`server/process/manager.ts`)
- Integrated session lifecycle manager
- Proper resource cleanup in `shutdown()` method
- Session limit enforcement before creating new sessions
- Enhanced cleanup of timers, subscribers, and metadata maps
- Added comprehensive session statistics API

### 2. On-Chain Identity & Authorization

**Problem**: Need to control who can execute privileged commands via AlgoChat.

**Solution**: Algorand address-based authorization:

#### Owner Addresses (`server/algochat/config.ts`)
- `ALGOCHAT_OWNER_ADDRESSES` — comma-separated Algorand addresses
- Privileged commands (`/stop`, `/approve`, `/deny`, `/mode`, `/work`, `/agent`, `/council`) require owner authorization
- If no owners configured, all commands are open (backward compatible with warning)
- Address verified from on-chain transaction sender (cryptographic proof of ownership)

#### Allowlist System (`server/db/allowlist.ts`)
- Optional allowlist to restrict which addresses can message agents
- Open mode (empty allowlist) allows all addresses
- Managed via `/api/allowlist` endpoints

### 3. API Input Validation

**Problem**: Route handlers lacked consistent input validation, risking malformed data in the database.

**Solution**: Centralized Zod validation (`server/lib/validation.ts`):

- 20+ Zod schemas covering all API endpoints
- `parseBodyOrThrow()` — validates JSON body, throws `ValidationError` on failure
- `parseBody()` — safe variant returning `{ data, error }`
- `parseQuery()` — validates query/search parameters
- Schemas aligned with database types (`CreateAgentInput`, `SessionStatus`, `WorkTaskSource`, etc.)

### 4. Global Error Handling

**Problem**: Unhandled errors in route handlers could crash the server or return non-JSON responses.

**Solution**: Global error boundary in route dispatch (`server/routes/index.ts`):

- All route handlers wrapped in try/catch
- Unhandled errors return proper JSON 500 responses
- Structured error logging with stack traces
- CORS headers applied to error responses

### 5. Security Hardening

#### Agent Rate Limiting (`server/lib/rate-limiter.ts`)
- Per-agent operation limits (ops/minute, concurrent sessions, daily work tasks)
- Daily ALGO spending limits per agent
- Configurable per-agent via database
- Used by `SecureWorkTaskService` to prevent abuse

#### Secure Memory Management (`server/lib/secure-memory.ts`)
- Encrypted storage for wallet mnemonics and sensitive keys
- Automatic zeroing of buffers after use
- Constant-time comparison for timing-attack prevention

#### Docker Sandboxing (`server/work/docker-executor.ts`)
- Work tasks executed in isolated Docker containers
- CPU, memory, and network limits
- Configurable timeout per task

#### Transaction Retry Service (`server/algochat/retry-service.ts`)
- Automatic retry for failed Algorand transactions
- Exponential backoff with configurable limits
- Persistent tracking across restarts

### 6. Database Abstraction

**Problem**: SQLite limitations may prevent future horizontal scaling.

**Solution**: Database abstraction layer (`server/db/database-service.ts`):

- Abstract interface supporting multiple backends
- SQLite wrapper with transaction support
- PostgreSQL wrapper (structured for future implementation)
- Dual-write mode for zero-downtime migrations

## Configuration

### Environment Variables

```bash
# --- Algorand / AlgoChat ---
ALGOCHAT_MNEMONIC=word1 word2 ... word25
ALGORAND_NETWORK=testnet
ALGOCHAT_OWNER_ADDRESSES=YOURADDRESS1,YOURADDRESS2

# --- Server ---
PORT=3000
LOG_LEVEL=info

# --- Security ---
WALLET_ENCRYPTION_KEY=  # Auto-generated if not set

# --- Spending Limits ---
DAILY_ALGO_LIMIT_MICRO=10000000  # 10 ALGO

# --- CORS ---
CORS_ORIGIN=http://localhost:3000,http://localhost:4200
```

## Testing

### Test Coverage (167 tests)
- **Database tests** — CRUD operations, schema validation
- **Validation tests** — All Zod schemas, parse helpers, edge cases
- **API route tests** — Malformed input rejection, CRUD integration
- **Security tests** — Rate limiting, retry service, Docker executor, secure memory
- **Encryption tests** — SecureMemoryManager, wallet encryption

### Running Tests
```bash
bun test           # All tests
bun test --watch   # Watch mode
```

## Performance

### Memory Usage
- **Before**: Unbounded growth with session accumulation
- **After**: Stable memory with automatic cleanup (session TTL, project limits)

### Database
- SQLite with automatic cleanup and backup support
- PostgreSQL migration path available via dual-write mode

## Future Enhancements

### Phase 2
- Service registry pattern
- Event bus for component decoupling
- Process pooling for better resource utilization

### Phase 3
- Distributed agent process pools
- Redis for session state management
- Kubernetes orchestration support

## Council Recommendation Status

✅ **Memory leak fixes** — Session lifecycle management
✅ **Authorization** — On-chain identity via Algorand addresses
✅ **Input validation** — Zod schemas on all API routes
✅ **Security hardening** — Rate limiting, secure memory, Docker sandboxing
✅ **Error handling** — Global error boundary with JSON responses
✅ **Database scalability** — Abstraction layer with migration support
🔄 **Infrastructure monitoring** — Foundation laid, full implementation pending
🔄 **Service decoupling** — Planned for Phase 2
