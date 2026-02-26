export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyHealth {
    status: HealthStatus;
    latency_ms?: number;
    error?: string;
    [key: string]: unknown;
}

export interface ShutdownInfo {
    phase: 'idle' | 'shutting_down' | 'completed' | 'forced';
    registeredHandlers: number;
}

export interface HealthCheckResult {
    status: HealthStatus;
    version: string;
    uptime: number;
    timestamp: string;
    dependencies: Record<string, DependencyHealth>;
    shutdown?: ShutdownInfo;
}
