/**
 * SystemStateDetector — aggregates system health signals into actionable states
 * that the scheduler uses to gate or prioritize schedule execution.
 *
 * Signals are cached with a 60-second TTL to avoid excessive API calls on each
 * 30-second scheduler tick.
 */

import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('SystemState');

export type SystemState =
    | 'healthy'
    | 'ci_broken'
    | 'server_degraded'
    | 'p0_open'
    | 'disk_pressure';

export interface SystemStateResult {
    states: SystemState[];
    details: Record<string, string>;
    evaluatedAt: string;
    cached: boolean;
}

export interface SystemStateConfig {
    owner: string;
    repo: string;
    diskPressureThreshold: number;
    p0Labels: string[];
    cacheTtlMs: number;
}

const DEFAULT_CONFIG: SystemStateConfig = {
    owner: 'CorvidLabs',
    repo: 'corvid-agent',
    diskPressureThreshold: 0.90,
    p0Labels: ['priority:p0', 'critical', 'P0'],
    cacheTtlMs: 60_000,
};

export class SystemStateDetector {
    private config: SystemStateConfig;
    private cached: SystemStateResult | null = null;
    private cacheExpiry = 0;
    private healthCheckFn: (() => Promise<{ status: string }>) | null = null;

    constructor(_db: Database, config?: Partial<SystemStateConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    setHealthCheck(fn: () => Promise<{ status: string }>): void {
        this.healthCheckFn = fn;
    }

    async evaluate(): Promise<SystemStateResult> {
        const now = Date.now();
        if (this.cached && now < this.cacheExpiry) {
            return { ...this.cached, cached: true };
        }

        const states: SystemState[] = [];
        const details: Record<string, string> = {};

        const [ciState, serverState, p0State, diskState] = await Promise.all([
            this.checkCI().catch(err => { log.debug('CI check failed', { error: err instanceof Error ? err.message : String(err) }); return null; }),
            this.checkServerHealth().catch(err => { log.debug('Server health check failed', { error: err instanceof Error ? err.message : String(err) }); return null; }),
            this.checkP0Issues().catch(err => { log.debug('P0 issue check failed', { error: err instanceof Error ? err.message : String(err) }); return null; }),
            this.checkDiskPressure().catch(err => { log.debug('Disk check failed', { error: err instanceof Error ? err.message : String(err) }); return null; }),
        ]);

        if (ciState) { states.push('ci_broken'); details.ci_broken = ciState; }
        if (serverState) { states.push('server_degraded'); details.server_degraded = serverState; }
        if (p0State) { states.push('p0_open'); details.p0_open = p0State; }
        if (diskState) { states.push('disk_pressure'); details.disk_pressure = diskState; }
        if (states.length === 0) states.push('healthy');

        const result: SystemStateResult = { states, details, evaluatedAt: new Date(now).toISOString(), cached: false };
        this.cached = result;
        this.cacheExpiry = now + this.config.cacheTtlMs;

        if (states.length > 0 && !states.includes('healthy')) {
            log.info('System state evaluated', { states, details });
        }
        return result;
    }

    invalidateCache(): void { this.cached = null; this.cacheExpiry = 0; }

    private async checkCI(): Promise<string | null> {
        const token = process.env.GH_TOKEN;
        if (!token) return null;
        const { owner, repo } = this.config;
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=main&per_page=1&status=completed`, {
            headers: { Authorization: `token ${token}`, 'User-Agent': 'corvid-agent', Accept: 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as { workflow_runs?: Array<{ conclusion: string | null; name: string }> };
        const latestRun = data.workflow_runs?.[0];
        if (latestRun?.conclusion === 'failure') return `Latest CI run failed: ${latestRun.name}`;
        return null;
    }

    private async checkServerHealth(): Promise<string | null> {
        if (!this.healthCheckFn) return null;
        const result = await this.healthCheckFn();
        if (result.status === 'unhealthy') return 'Server health check reports unhealthy';
        if (result.status === 'degraded') return 'Server health check reports degraded';
        return null;
    }

    private async checkP0Issues(): Promise<string | null> {
        const token = process.env.GH_TOKEN;
        if (!token) return null;
        const { owner, repo, p0Labels } = this.config;
        const labelQuery = p0Labels.map(l => `label:"${l}"`).join('+');
        const resp = await fetch(`https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:issue+is:open+${labelQuery}&per_page=5`, {
            headers: { Authorization: `token ${token}`, 'User-Agent': 'corvid-agent', Accept: 'application/vnd.github.v3+json' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) return null;
        const data = await resp.json() as { total_count?: number; items?: Array<{ number: number; title: string }> };
        if (data.total_count && data.total_count > 0) {
            const issues = data.items?.slice(0, 3).map(i => `#${i.number}: ${i.title}`).join('; ') ?? '';
            return `${data.total_count} P0 issue(s) open: ${issues}`;
        }
        return null;
    }

    private async checkDiskPressure(): Promise<string | null> {
        try {
            const proc = Bun.spawn(['df', '-P', '.'], { stdout: 'pipe', stderr: 'pipe' });
            const stdout = await new Response(proc.stdout).text();
            await proc.exited;
            const lines = stdout.trim().split('\n');
            if (lines.length < 2) return null;
            const parts = lines[1].split(/\s+/);
            if (parts.length < 5) return null;
            const usage = parseInt(parts[4], 10) / 100;
            if (usage >= this.config.diskPressureThreshold) {
                return `Disk usage at ${Math.round(usage * 100)}% (threshold: ${Math.round(this.config.diskPressureThreshold * 100)}%)`;
            }
            return null;
        } catch { return null; }
    }
}
