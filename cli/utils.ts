import { sep } from 'node:path';
import type { Project } from '../shared/types';
import type { CorvidClient } from './client';

/**
 * Truncate a string to a maximum length, appending an ellipsis if needed.
 */
export function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Format an uptime duration in seconds to a human-readable string (e.g. "2d 5h", "3h 12m", "7m").
 */
export function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/**
 * Resolve the current working directory to a project ID by matching against known projects.
 */
export async function resolveProjectFromCwd(client: CorvidClient): Promise<string | undefined> {
    try {
        const projects = await client.get<Project[]>('/api/projects');
        const cwd = process.cwd();
        const exact = projects.find(p => p.workingDir === cwd);
        if (exact) return exact.id;
        const prefix = projects.find(p => cwd.startsWith(p.workingDir + sep));
        if (prefix) return prefix.id;
    } catch {
        // Fall back to server default
    }
    return undefined;
}

/**
 * Extract an error message from an unknown thrown value and exit the process.
 */
export function handleError(err: unknown): void {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : String(err);
    // Lazy import to avoid circular dependency with render.ts
    const { printError } = require('./render') as { printError: (msg: string) => void };
    printError(message);
    process.exit(1);
}
