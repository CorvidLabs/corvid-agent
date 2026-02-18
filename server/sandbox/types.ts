// ─── Container Configuration ────────────────────────────────────────────────

export interface SandboxConfig {
    id: string;
    agentId: string;
    /** Docker image to use (default: corvid-agent-sandbox:latest) */
    image: string;
    /** CPU limit in cores (e.g. 1.0 = 1 core) */
    cpuLimit: number;
    /** Memory limit in MB */
    memoryLimitMb: number;
    /** Network policy */
    networkPolicy: NetworkPolicy;
    /** Max execution time in seconds (0 = unlimited) */
    timeoutSeconds: number;
    /** Directories to mount read-only */
    readOnlyMounts: string[];
    /** Working directory bind mount (read-write) */
    workDir: string | null;
    createdAt: string;
    updatedAt: string;
}

export type NetworkPolicy = 'none' | 'host' | 'restricted';

export interface ContainerInfo {
    containerId: string;
    sessionId: string | null;
    status: ContainerStatus;
    image: string;
    createdAt: number;
    startedAt: number | null;
    pid: number | null;
}

export type ContainerStatus = 'creating' | 'ready' | 'running' | 'stopped' | 'error';

// ─── Container Pool ─────────────────────────────────────────────────────────

export interface PoolConfig {
    /** Number of warm containers to keep pre-created */
    warmPoolSize: number;
    /** Max total containers */
    maxContainers: number;
    /** Container idle timeout before recycling (ms) */
    idleTimeoutMs: number;
    /** Default image for pool */
    defaultImage: string;
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
    warmPoolSize: 2,
    maxContainers: 10,
    idleTimeoutMs: 300_000, // 5 minutes
    defaultImage: 'corvid-agent-sandbox:latest',
};

// ─── Resource Limits ────────────────────────────────────────────────────────

export interface ResourceLimits {
    cpuLimit: number;
    memoryLimitMb: number;
    networkPolicy: NetworkPolicy;
    timeoutSeconds: number;
    /** Max number of processes inside container */
    pidsLimit: number;
    /** Max writable storage in MB */
    storageLimitMb: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
    cpuLimit: 1.0,
    memoryLimitMb: 512,
    networkPolicy: 'restricted',
    timeoutSeconds: 600,
    pidsLimit: 100,
    storageLimitMb: 1024,
};

// ─── DB Record ──────────────────────────────────────────────────────────────

export interface SandboxConfigRecord {
    id: string;
    agent_id: string;
    image: string;
    cpu_limit: number;
    memory_limit_mb: number;
    network_policy: string;
    timeout_seconds: number;
    read_only_mounts: string;
    work_dir: string | null;
    created_at: string;
    updated_at: string;
}
