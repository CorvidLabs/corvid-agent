/**
 * HealthMonitorService — periodic self-check with status-transition alerting.
 *
 * Runs every 5 minutes, stores results in server_health_snapshots, and fires
 * notifications via NotificationService when the status transitions
 * (healthy → unhealthy or back).
 */

import type { Database } from 'bun:sqlite';
import type { HealthCheckDeps } from './service';
import type { NotificationService } from '../notifications/service';
import { getHealthCheck } from './service';
import { insertHealthSnapshot, pruneHealthSnapshots } from '../db/health-snapshots';
import { createLogger } from '../lib/logger';
import type { HealthStatus } from './types';

const log = createLogger('HealthMonitor');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const SNAPSHOT_RETENTION_DAYS = 30;
const SYSTEM_AGENT_ID = 'system';

export class HealthMonitorService {
    private db: Database;
    private healthDeps: HealthCheckDeps;
    private notificationService: NotificationService | null = null;
    private checkTimer: ReturnType<typeof setInterval> | null = null;
    private pruneTimer: ReturnType<typeof setInterval> | null = null;
    private lastStatus: HealthStatus | null = null;
    private consecutiveFailures = 0;
    private static readonly ALERT_THRESHOLD = 2; // alert after 2 consecutive unhealthy checks

    constructor(db: Database, healthDeps: HealthCheckDeps) {
        this.db = db;
        this.healthDeps = healthDeps;
    }

    setNotificationService(service: NotificationService): void {
        this.notificationService = service;
    }

    start(): void {
        if (this.checkTimer) return;
        log.info('HealthMonitor started', { intervalMs: CHECK_INTERVAL_MS });

        this.checkTimer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
        this.pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL_MS);

        // Run first check after a short delay (let services finish starting)
        setTimeout(() => this.check(), 30_000);
    }

    stop(): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
            this.pruneTimer = null;
        }
        log.info('HealthMonitor stopped');
    }

    /** Run a single health check, store snapshot, and alert on status transitions. */
    async check(): Promise<void> {
        const start = performance.now();
        try {
            const result = await getHealthCheck(this.healthDeps);
            const responseTimeMs = Math.round(performance.now() - start);

            insertHealthSnapshot(this.db, {
                status: result.status,
                responseTimeMs,
                dependencies: result.dependencies,
                source: 'internal',
            });

            // Track consecutive failures for alert threshold
            if (result.status === 'unhealthy') {
                this.consecutiveFailures++;
            } else {
                this.consecutiveFailures = 0;
            }

            // Alert on significant status transitions
            if (this.lastStatus !== null && this.lastStatus !== result.status) {
                await this.onStatusChange(this.lastStatus, result.status, result.dependencies);
            }

            // Alert after sustained unhealthy state (ALERT_THRESHOLD consecutive checks)
            if (
                result.status === 'unhealthy' &&
                this.consecutiveFailures === HealthMonitorService.ALERT_THRESHOLD
            ) {
                await this.alertUnhealthy(result.dependencies);
            }

            this.lastStatus = result.status;

            log.debug('Health check completed', {
                status: result.status,
                responseTimeMs,
                consecutiveFailures: this.consecutiveFailures,
            });
        } catch (err) {
            const responseTimeMs = Math.round(performance.now() - start);
            log.error('Health check failed', {
                error: err instanceof Error ? err.message : String(err),
                responseTimeMs,
            });

            insertHealthSnapshot(this.db, {
                status: 'unhealthy',
                responseTimeMs,
                source: 'internal',
            });

            this.consecutiveFailures++;
            if (this.consecutiveFailures === HealthMonitorService.ALERT_THRESHOLD) {
                await this.alertUnhealthy({});
            }
            this.lastStatus = 'unhealthy';
        }
    }

    private async onStatusChange(
        from: HealthStatus,
        to: HealthStatus,
        dependencies: Record<string, unknown>,
    ): Promise<void> {
        if (to === 'healthy' && from === 'unhealthy') {
            // Recovery — notify that the system is back
            log.info('Health recovered', { from, to });
            await this.sendNotification(
                'Server recovered',
                `Server status changed from **${from}** to **${to}**. All systems operational.`,
                'info',
            );
        } else if (to === 'unhealthy' && from !== 'unhealthy') {
            // Don't alert on first unhealthy — wait for ALERT_THRESHOLD
            log.warn('Health degraded', { from, to, dependencies });
        } else if (to === 'degraded' && from === 'healthy') {
            log.warn('Health degraded', { from, to, dependencies });
            await this.sendNotification(
                'Server degraded',
                `Server status changed from **${from}** to **${to}**. Some dependencies may be unavailable.\n\nDependencies: ${JSON.stringify(dependencies, null, 2)}`,
                'warning',
            );
        }
    }

    private async alertUnhealthy(dependencies: Record<string, unknown>): Promise<void> {
        log.error('Server unhealthy — alerting', {
            consecutiveFailures: this.consecutiveFailures,
        });

        const depSummary = Object.entries(dependencies)
            .map(([k, v]) => `- **${k}**: ${JSON.stringify(v)}`)
            .join('\n');

        await this.sendNotification(
            'SERVER DOWN — health check failing',
            `The server has been **unhealthy** for ${this.consecutiveFailures} consecutive checks (${this.consecutiveFailures * 5} minutes).\n\n` +
            `### Dependency Status\n${depSummary || 'No dependency data available'}\n\n` +
            `See \`docs/incident-response.md\` for recovery steps.`,
            'critical',
        );
    }

    private async sendNotification(title: string, message: string, level: string): Promise<void> {
        if (!this.notificationService) {
            log.warn('NotificationService not set — cannot send health alert', { title });
            return;
        }
        try {
            await this.notificationService.notify({
                agentId: SYSTEM_AGENT_ID,
                title,
                message,
                level,
            });
        } catch (err) {
            log.error('Failed to send health notification', {
                title,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    private prune(): void {
        try {
            const deleted = pruneHealthSnapshots(this.db, SNAPSHOT_RETENTION_DAYS);
            if (deleted > 0) {
                log.info('Pruned old health snapshots', { deleted, retentionDays: SNAPSHOT_RETENTION_DAYS });
            }
        } catch (err) {
            log.error('Failed to prune health snapshots', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
