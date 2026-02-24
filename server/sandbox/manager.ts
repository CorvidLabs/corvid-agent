/**
 * SandboxManager — Warm container pool and session assignment.
 *
 * Manages a pool of pre-created containers that can be quickly assigned
 * to agent sessions, with automatic cleanup and recycling.
 */
import type { Database } from 'bun:sqlite';
import type { PoolConfig, SandboxConfig } from './types';
import { DEFAULT_POOL_CONFIG, DEFAULT_RESOURCE_LIMITS } from './types';
import {
    createContainer,
    startContainer,
    stopContainer,
    removeContainer,
    getContainerStatus,
    isDockerAvailable,
    listSandboxContainers,
} from './container';
import { getAgentPolicy } from './policy';
import { createLogger } from '../lib/logger';
import { ValidationError, ConflictError } from '../lib/errors';

const log = createLogger('SandboxManager');

interface PoolEntry {
    containerId: string;
    sessionId: string | null;
    sandboxId: string;
    assignedAt: number | null;
    createdAt: number;
}

export class SandboxManager {
    private db: Database;
    private poolConfig: PoolConfig;
    private pool: Map<string, PoolEntry> = new Map();
    private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
    private enabled: boolean = false;

    constructor(db: Database, poolConfig: PoolConfig = DEFAULT_POOL_CONFIG) {
        this.db = db;
        this.poolConfig = poolConfig;
    }

    /**
     * Initialize the sandbox manager. Checks Docker availability,
     * cleans up stale containers, and fills the warm pool.
     */
    async initialize(): Promise<boolean> {
        const available = await isDockerAvailable();
        if (!available) {
            log.warn('Docker not available — sandboxing disabled');
            return false;
        }

        this.enabled = true;
        log.info('Docker available — sandboxing enabled');

        // Cleanup stale containers from previous runs
        await this.cleanupStaleContainers();

        // Fill warm pool
        await this.fillPool();

        // Start maintenance loop (check idle, refill pool)
        this.maintenanceTimer = setInterval(() => {
            this.runMaintenance().catch((err) => {
                log.warn('Maintenance cycle failed', { error: err instanceof Error ? err.message : String(err) });
            });
        }, 30_000); // Every 30 seconds

        return true;
    }

    /**
     * Assign a container to a session. Returns the container ID.
     * Creates a new container if the pool is empty.
     */
    async assignContainer(
        agentId: string,
        sessionId: string,
        workDir?: string | null,
    ): Promise<string> {
        if (!this.enabled) {
            throw new ValidationError('Sandboxing is not enabled');
        }

        // Find an available (unassigned) container from the pool
        let entry: PoolEntry | null = null;
        for (const [, poolEntry] of this.pool) {
            if (!poolEntry.sessionId) {
                entry = poolEntry;
                break;
            }
        }

        const limits = getAgentPolicy(this.db, agentId);

        if (!entry) {
            // No warm containers available — create one on demand
            if (this.pool.size >= this.poolConfig.maxContainers) {
                throw new ConflictError('Maximum container limit reached');
            }

            const sandboxId = crypto.randomUUID();
            const config: SandboxConfig = {
                id: sandboxId,
                agentId,
                image: this.poolConfig.defaultImage,
                cpuLimit: limits.cpuLimit,
                memoryLimitMb: limits.memoryLimitMb,
                networkPolicy: limits.networkPolicy,
                timeoutSeconds: limits.timeoutSeconds,
                readOnlyMounts: [],
                workDir: workDir ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const containerId = await createContainer(config, limits);
            entry = {
                containerId,
                sessionId: null,
                sandboxId,
                assignedAt: null,
                createdAt: Date.now(),
            };
            this.pool.set(containerId, entry);
        }

        // Assign session
        entry.sessionId = sessionId;
        entry.assignedAt = Date.now();

        // Start the container
        await startContainer(entry.containerId);

        log.info('Assigned container to session', {
            containerId: entry.containerId.slice(0, 12),
            sessionId,
            agentId,
        });

        // Trigger pool refill in background
        this.fillPool().catch(() => { /* best effort */ });

        return entry.containerId;
    }

    /**
     * Release a container from a session (stop and remove).
     */
    async releaseContainer(sessionId: string): Promise<void> {
        for (const [containerId, entry] of this.pool) {
            if (entry.sessionId === sessionId) {
                try {
                    await stopContainer(containerId);
                    await removeContainer(containerId);
                } catch (err) {
                    log.warn('Error releasing container', {
                        containerId: containerId.slice(0, 12),
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
                this.pool.delete(containerId);
                log.info('Released container', { containerId: containerId.slice(0, 12), sessionId });
                return;
            }
        }

        log.debug('No container found for session', { sessionId });
    }

    /**
     * Get info about a session's container.
     */
    getContainerForSession(sessionId: string): PoolEntry | null {
        for (const [, entry] of this.pool) {
            if (entry.sessionId === sessionId) return entry;
        }
        return null;
    }

    /**
     * Get pool stats.
     */
    getPoolStats(): {
        total: number;
        warm: number;
        assigned: number;
        maxContainers: number;
        enabled: boolean;
    } {
        let warm = 0;
        let assigned = 0;
        for (const [, entry] of this.pool) {
            if (entry.sessionId) assigned++;
            else warm++;
        }
        return {
            total: this.pool.size,
            warm,
            assigned,
            maxContainers: this.poolConfig.maxContainers,
            enabled: this.enabled,
        };
    }

    /**
     * Shutdown — stop all containers and cleanup.
     */
    async shutdown(): Promise<void> {
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }

        log.info('Shutting down sandbox manager', { containers: this.pool.size });

        const promises: Promise<void>[] = [];
        for (const [containerId] of this.pool) {
            promises.push(
                stopContainer(containerId)
                    .then(() => removeContainer(containerId))
                    .catch(() => { /* best effort cleanup */ }),
            );
        }
        await Promise.all(promises);
        this.pool.clear();
        this.enabled = false;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Fill the warm pool up to the configured size.
     */
    private async fillPool(): Promise<void> {
        const warmCount = [...this.pool.values()].filter((e) => !e.sessionId).length;
        const needed = this.poolConfig.warmPoolSize - warmCount;

        if (needed <= 0 || this.pool.size >= this.poolConfig.maxContainers) return;

        const toCreate = Math.min(needed, this.poolConfig.maxContainers - this.pool.size);

        for (let i = 0; i < toCreate; i++) {
            try {
                const sandboxId = crypto.randomUUID();
                const config: SandboxConfig = {
                    id: sandboxId,
                    agentId: '',
                    image: this.poolConfig.defaultImage,
                    cpuLimit: DEFAULT_RESOURCE_LIMITS.cpuLimit,
                    memoryLimitMb: DEFAULT_RESOURCE_LIMITS.memoryLimitMb,
                    networkPolicy: DEFAULT_RESOURCE_LIMITS.networkPolicy,
                    timeoutSeconds: DEFAULT_RESOURCE_LIMITS.timeoutSeconds,
                    readOnlyMounts: [],
                    workDir: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                const containerId = await createContainer(config);
                this.pool.set(containerId, {
                    containerId,
                    sessionId: null,
                    sandboxId,
                    assignedAt: null,
                    createdAt: Date.now(),
                });
            } catch (err) {
                log.warn('Failed to create warm container', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        log.debug('Pool fill complete', { poolSize: this.pool.size, warmTarget: this.poolConfig.warmPoolSize });
    }

    /**
     * Run maintenance: recycle idle containers, refill pool.
     */
    private async runMaintenance(): Promise<void> {
        const now = Date.now();

        // Check for idle assigned containers
        for (const [containerId, entry] of this.pool) {
            if (entry.sessionId && entry.assignedAt) {
                const idleTime = now - entry.assignedAt;
                if (idleTime > this.poolConfig.idleTimeoutMs) {
                    log.info('Recycling idle container', {
                        containerId: containerId.slice(0, 12),
                        sessionId: entry.sessionId,
                        idleMs: idleTime,
                    });
                    try {
                        await stopContainer(containerId);
                        await removeContainer(containerId);
                    } catch { /* best effort */ }
                    this.pool.delete(containerId);
                }
            }
        }

        // Verify warm containers are still alive
        for (const [containerId, entry] of this.pool) {
            if (!entry.sessionId) {
                const status = await getContainerStatus(containerId);
                if (!status || status.status === 'error') {
                    log.warn('Removing dead warm container', { containerId: containerId.slice(0, 12) });
                    await removeContainer(containerId).catch(() => {});
                    this.pool.delete(containerId);
                }
            }
        }

        // Refill pool
        await this.fillPool();
    }

    /**
     * Cleanup containers from previous runs.
     */
    private async cleanupStaleContainers(): Promise<void> {
        const containers = await listSandboxContainers();
        for (const containerId of containers) {
            try {
                await stopContainer(containerId);
                await removeContainer(containerId);
                log.info('Cleaned up stale container', { containerId: containerId.slice(0, 12) });
            } catch { /* best effort */ }
        }
    }
}
