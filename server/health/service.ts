import type { Database } from 'bun:sqlite';
import { statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { HealthStatus, DependencyHealth, HealthCheckResult } from './types';
import { hasClaudeAccess } from '../providers/router';
import type { AuthConfig } from '../middleware/auth';
import { isApiKeyExpired, getApiKeyExpiryWarning } from '../middleware/auth';

export interface HealthCheckDeps {
    db: Database;
    startTime: number;
    version: string;
    getActiveSessions: () => string[];
    isAlgoChatConnected: () => boolean;
    isShuttingDown: () => boolean;
    getSchedulerStats: () => Record<string, unknown>;
    getMentionPollingStats: () => Record<string, unknown>;
    getWorkflowStats: () => Record<string, unknown>;
    getAuthConfig?: () => AuthConfig | null;
}

/** Cached health check result with TTL. */
let cachedResult: HealthCheckResult | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5_000; // 5-second TTL to prevent thundering herd

async function checkDatabase(db: Database): Promise<DependencyHealth> {
    const start = performance.now();
    try {
        const row = db.query('SELECT 1 AS ok').get() as { ok: number } | null;
        const latency_ms = Math.round((performance.now() - start) * 100) / 100;
        if (row?.ok === 1) {
            return { status: 'healthy', latency_ms };
        }
        return { status: 'unhealthy', latency_ms, error: 'unexpected query result' };
    } catch (err) {
        const latency_ms = Math.round((performance.now() - start) * 100) / 100;
        return { status: 'unhealthy', latency_ms, error: err instanceof Error ? err.message : String(err) };
    }
}

async function checkGitHub(): Promise<DependencyHealth> {
    const token = process.env.GH_TOKEN;
    if (!token) {
        return { status: 'healthy', configured: false };
    }
    const start = performance.now();
    try {
        const resp = await fetch('https://api.github.com/rate_limit', {
            headers: { Authorization: `token ${token}`, 'User-Agent': 'corvid-agent' },
            signal: AbortSignal.timeout(5_000),
        });
        const latency_ms = Math.round((performance.now() - start) * 100) / 100;
        if (resp.ok) {
            const data = (await resp.json()) as { rate?: { remaining?: number; limit?: number } };
            return {
                status: 'healthy',
                latency_ms,
                rate_limit_remaining: data.rate?.remaining,
                rate_limit_total: data.rate?.limit,
            };
        }
        return { status: 'degraded', latency_ms, error: `HTTP ${resp.status}` };
    } catch (err) {
        const latency_ms = Math.round((performance.now() - start) * 100) / 100;
        return { status: 'degraded', latency_ms, error: err instanceof Error ? err.message : String(err) };
    }
}

async function checkAlgorand(isConnected: boolean): Promise<DependencyHealth> {
    if (!isConnected) {
        return { status: 'healthy', configured: false };
    }
    return { status: 'healthy', configured: true };
}

async function checkLlmProviders(): Promise<DependencyHealth> {
    const hasAnthropic = hasClaudeAccess();
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

    // Check Ollama connectivity (lightweight, local)
    let ollamaStatus: 'healthy' | 'unhealthy' = 'unhealthy';
    try {
        const resp = await fetch(`${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(3_000) });
        if (resp.ok) ollamaStatus = 'healthy';
    } catch {
        // Ollama not running is fine if Anthropic is available
    }

    if (hasAnthropic || ollamaStatus === 'healthy') {
        return {
            status: 'healthy',
            anthropic: hasAnthropic ? 'healthy' : 'not_configured',
            ollama: ollamaStatus,
        };
    }
    return {
        status: 'degraded',
        error: 'no LLM provider available',
        anthropic: 'not_configured',
        ollama: ollamaStatus,
    };
}

function checkDiskAndWal(db: Database): DependencyHealth {
    try {
        // Get WAL file size
        let walSizeBytes = 0;
        try {
            const dbPath = (db.query("PRAGMA database_list").all() as Array<{ file: string }>)[0]?.file;
            if (dbPath) {
                try { walSizeBytes = statSync(dbPath + '-wal').size; } catch { /* no WAL file */ }
            }
        } catch { /* ignore */ }

        // Get free disk space (Unix only — df is not available on Windows)
        let freeBytes = -1;
        try {
            const dfOutput = execSync('df -k . 2>/dev/null | tail -1', { encoding: 'utf-8', timeout: 3000 });
            const parts = dfOutput.trim().split(/\s+/);
            // df -k output: filesystem blocks used available ...
            const parsed = parseInt(parts[3] ?? '', 10);
            if (!isNaN(parsed)) freeBytes = parsed * 1024;
        } catch { /* not available on this platform */ }

        const walMB = Math.round(walSizeBytes / (1024 * 1024) * 100) / 100;

        // If we couldn't determine free space, only check WAL size
        if (freeBytes < 0) {
            if (walMB > 100) {
                return { status: 'degraded', warning: `Large WAL file (${walMB}MB)`, wal_mb: walMB };
            }
            return { status: 'healthy', wal_mb: walMB };
        }

        const freeMB = Math.round(freeBytes / (1024 * 1024));

        // Warn at 500MB free, unhealthy at 100MB
        if (freeMB < 100) {
            return { status: 'unhealthy', error: `Critical: only ${freeMB}MB disk free`, free_mb: freeMB, wal_mb: walMB };
        }
        if (freeMB < 500 || walMB > 100) {
            return { status: 'degraded', warning: `Low disk (${freeMB}MB free) or large WAL (${walMB}MB)`, free_mb: freeMB, wal_mb: walMB };
        }
        return { status: 'healthy', free_mb: freeMB, wal_mb: walMB };
    } catch (err) {
        return { status: 'degraded', error: err instanceof Error ? err.message : String(err) };
    }
}

function checkApiKey(getAuthConfig?: () => AuthConfig | null): DependencyHealth {
    if (!getAuthConfig) {
        return { status: 'healthy', configured: false };
    }
    const config = getAuthConfig();
    if (!config || !config.apiKeyExpiresAt) {
        return { status: 'healthy', configured: true, expiry: 'none' };
    }

    if (isApiKeyExpired(config)) {
        return { status: 'unhealthy', error: 'API key expired — rotation required' };
    }

    const warning = getApiKeyExpiryWarning(config);
    if (warning) {
        const daysRemaining = Math.ceil((config.apiKeyExpiresAt - Date.now()) / (24 * 60 * 60 * 1000));
        return { status: 'degraded', warning, days_remaining: daysRemaining };
    }

    return { status: 'healthy', configured: true };
}

function deriveOverallStatus(deps: Record<string, DependencyHealth>): HealthStatus {
    let hasDegraded = false;
    for (const dep of Object.values(deps)) {
        // Database is critical - if it's unhealthy, the whole system is unhealthy
        if (dep.status === 'unhealthy') return 'unhealthy';
        if (dep.status === 'degraded') hasDegraded = true;
    }
    return hasDegraded ? 'degraded' : 'healthy';
}

export async function getHealthCheck(deps: HealthCheckDeps): Promise<HealthCheckResult> {
    const now = Date.now();
    if (cachedResult && now < cacheExpiry) {
        return cachedResult;
    }

    const [database, github, algorand, llm] = await Promise.all([
        checkDatabase(deps.db),
        checkGitHub(),
        checkAlgorand(deps.isAlgoChatConnected()),
        checkLlmProviders(),
    ]);

    const apiKey = checkApiKey(deps.getAuthConfig);
    const diskWal = checkDiskAndWal(deps.db);

    const dependencies: Record<string, DependencyHealth> = {
        database,
        github,
        algorand,
        llm,
        apiKey,
        diskWal,
    };

    const derivedStatus = deps.isShuttingDown() ? 'unhealthy' as HealthStatus : deriveOverallStatus(dependencies);

    const result: HealthCheckResult = {
        status: derivedStatus,
        version: deps.version,
        uptime: Math.round((now - deps.startTime) / 1000),
        timestamp: new Date(now).toISOString(),
        dependencies,
    };

    cachedResult = result;
    cacheExpiry = now + CACHE_TTL_MS;

    return result;
}

/** Liveness check - is the process alive and able to respond? */
export function getLivenessCheck(): { status: 'ok' } {
    return { status: 'ok' };
}

/** Readiness check - is the service ready to accept traffic? */
export function getReadinessCheck(deps: HealthCheckDeps): { status: 'ready' | 'not_ready'; checks: Record<string, boolean> } {
    let dbReady = false;
    try {
        const row = deps.db.query('SELECT 1 AS ok').get() as { ok: number } | null;
        dbReady = row?.ok === 1;
    } catch {
        dbReady = false;
    }

    const checks = {
        database: dbReady,
        not_shutting_down: !deps.isShuttingDown(),
    };
    const allReady = Object.values(checks).every(Boolean);

    return {
        status: allReady ? 'ready' : 'not_ready',
        checks,
    };
}

/** Reset the cache (for testing). */
export function resetHealthCache(): void {
    cachedResult = null;
    cacheExpiry = 0;
}
