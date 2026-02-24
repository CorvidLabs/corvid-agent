/**
 * Container — Docker container lifecycle management via Bun.spawn.
 *
 * Manages creating, starting, stopping, and executing commands inside
 * Docker containers for sandboxed agent execution.
 */
import type { ContainerInfo, ContainerStatus, ResourceLimits, SandboxConfig } from './types';
import { DEFAULT_RESOURCE_LIMITS } from './types';
import { createLogger } from '../lib/logger';
import { AuthorizationError, ExternalServiceError } from '../lib/errors';

const log = createLogger('Container');

export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Run a docker CLI command and return the result.
 */
async function dockerExec(args: string[], timeoutMs: number = 30_000): Promise<ExecResult> {
    const proc = Bun.spawn(['docker', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const timer = timeoutMs > 0
        ? setTimeout(() => proc.kill(), timeoutMs)
        : null;

    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    if (timer) clearTimeout(timer);

    return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * Create a Docker container with the given config and resource limits.
 * Returns the container ID.
 */
export async function createContainer(
    config: SandboxConfig,
    limits: ResourceLimits = DEFAULT_RESOURCE_LIMITS,
): Promise<string> {
    const args: string[] = [
        'create',
        '--name', `corvid-sandbox-${config.id}`,
        '--cpus', String(limits.cpuLimit),
        '--memory', `${limits.memoryLimitMb}m`,
        '--pids-limit', String(limits.pidsLimit),
        '--storage-opt', `size=${limits.storageLimitMb}M`,
    ];

    // Network policy
    if (limits.networkPolicy === 'none') {
        args.push('--network', 'none');
    } else if (limits.networkPolicy === 'restricted') {
        // Use default bridge with no DNS (restricted outbound)
        args.push('--dns', '0.0.0.0');
    }
    // 'host' uses default Docker networking

    // Read-only mounts
    for (const mount of config.readOnlyMounts) {
        args.push('-v', `${mount}:${mount}:ro`);
    }

    // Working directory — validate to prevent path traversal attacks
    if (config.workDir) {
        const { resolve } = await import('node:path');
        const resolved = resolve(config.workDir);
        // Block paths that escape via traversal or target system directories
        if (resolved !== config.workDir && config.workDir.includes('..')) {
            throw new AuthorizationError(`Path traversal denied: '${config.workDir}' resolves outside allowed directory`);
        }
        args.push('-v', `${resolved}:/workspace`);
        args.push('-w', '/workspace');
    }

    // Timeout as env var for the entrypoint
    if (config.timeoutSeconds > 0) {
        args.push('-e', `SANDBOX_TIMEOUT=${config.timeoutSeconds}`);
    }

    args.push(config.image);

    log.info('Creating container', { sandboxId: config.id, image: config.image });
    const result = await dockerExec(args);

    if (result.exitCode !== 0) {
        throw new ExternalServiceError("Docker", `Failed to create container: ${result.stderr}`);
    }

    return result.stdout; // Container ID
}

/**
 * Start an existing container.
 */
export async function startContainer(containerId: string): Promise<void> {
    const result = await dockerExec(['start', containerId]);
    if (result.exitCode !== 0) {
        throw new ExternalServiceError("Docker", `Failed to start container ${containerId}: ${result.stderr}`);
    }
    log.info('Started container', { containerId: containerId.slice(0, 12) });
}

/**
 * Stop a running container.
 */
export async function stopContainer(containerId: string, timeoutSeconds: number = 10): Promise<void> {
    const result = await dockerExec(['stop', '-t', String(timeoutSeconds), containerId], (timeoutSeconds + 5) * 1000);
    if (result.exitCode !== 0) {
        log.warn('Stop failed, killing container', { containerId: containerId.slice(0, 12) });
        await dockerExec(['kill', containerId]);
    }
    log.info('Stopped container', { containerId: containerId.slice(0, 12) });
}

/**
 * Remove a container (must be stopped first).
 */
export async function removeContainer(containerId: string): Promise<void> {
    const result = await dockerExec(['rm', '-f', containerId]);
    if (result.exitCode !== 0) {
        log.warn('Failed to remove container', { containerId: containerId.slice(0, 12), error: result.stderr });
    }
}

/**
 * Execute a command inside a running container.
 */
export async function execInContainer(
    containerId: string,
    command: string[],
    timeoutMs: number = 600_000,
): Promise<ExecResult> {
    const args = ['exec', containerId, ...command];
    return dockerExec(args, timeoutMs);
}

/**
 * Get container status by inspecting it.
 */
export async function getContainerStatus(containerId: string): Promise<ContainerInfo | null> {
    const result = await dockerExec([
        'inspect',
        '--format',
        '{{json .}}',
        containerId,
    ]);

    if (result.exitCode !== 0) return null;

    try {
        const info = JSON.parse(result.stdout);
        const state = info.State || {};

        let status: ContainerStatus = 'stopped';
        if (state.Running) status = 'running';
        else if (state.Status === 'created') status = 'ready';
        else if (state.Error) status = 'error';

        return {
            containerId: info.Id,
            sessionId: null,
            status,
            image: info.Config?.Image ?? '',
            createdAt: new Date(info.Created).getTime(),
            startedAt: state.StartedAt ? new Date(state.StartedAt).getTime() : null,
            pid: state.Pid ?? null,
        };
    } catch {
        log.warn('Failed to parse container inspect output', { containerId: containerId.slice(0, 12) });
        return null;
    }
}

/**
 * Check if Docker is available on this system.
 */
export async function isDockerAvailable(): Promise<boolean> {
    try {
        const result = await dockerExec(['version', '--format', '{{.Server.Version}}'], 5_000);
        return result.exitCode === 0;
    } catch {
        return false;
    }
}

/**
 * List containers with the corvid-sandbox prefix.
 */
export async function listSandboxContainers(): Promise<string[]> {
    const result = await dockerExec([
        'ps', '-a',
        '--filter', 'name=corvid-sandbox-',
        '--format', '{{.ID}}',
    ]);

    if (result.exitCode !== 0) return [];
    return result.stdout ? result.stdout.split('\n').filter(Boolean) : [];
}
