import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { SandboxConfig, ResourceLimits } from '../sandbox/types';
import { DEFAULT_RESOURCE_LIMITS } from '../sandbox/types';
import { AuthorizationError, ExternalServiceError } from '../lib/errors';

// ─── Mock helpers ──────────────────────────────────────────────────────────────

interface SpawnCall {
    cmd: string[];
}

let spawnCalls: SpawnCall[];
let spawnResults: Array<{ exitCode: number; stdout: string; stderr: string }>;

/**
 * Build a mock Bun.spawn result that mimics the real Bun subprocess API.
 * container.ts reads stdout/stderr via `new Response(proc.stdout).text()`
 * and awaits `proc.exited` for the exit code.
 */
function makeMockProc(result: { exitCode: number; stdout: string; stderr: string }) {
    return {
        stdout: new Blob([result.stdout]).stream(),
        stderr: new Blob([result.stderr]).stream(),
        exited: Promise.resolve(result.exitCode),
        pid: 99999,
        kill: mock(() => {}),
    };
}

/** Queue a spawn result. Calls are served FIFO. */
function queueSpawn(exitCode: number, stdout = '', stderr = '') {
    spawnResults.push({ exitCode, stdout, stderr });
}

/** Make a minimal SandboxConfig for testing. */
function makeSandboxConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
    return {
        id: 'test-123',
        agentId: 'agent-1',
        image: 'corvid-sandbox:latest',
        cpuLimit: 1.0,
        memoryLimitMb: 512,
        networkPolicy: 'restricted',
        timeoutSeconds: 600,
        readOnlyMounts: [],
        workDir: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        ...overrides,
    };
}

// Wrap in a top-level describe to scope beforeEach/afterEach Bun.spawn mocks
// to this file only, preventing leakage into parallel test files.
describe('sandbox/container', () => {

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
    spawnCalls = [];
    spawnResults = [];

    spyOn(Bun, 'spawn').mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string[];
        spawnCalls.push({ cmd });

        const result = spawnResults.shift() ?? { exitCode: 0, stdout: '', stderr: '' };
        return makeMockProc(result) as unknown as ReturnType<typeof Bun.spawn>;
    });
});

afterEach(() => {
    mock.restore();
});

// We must import the module AFTER the mock is set up in beforeEach,
// but since Bun.spawn is a global, mocking it before import works.
// We use dynamic imports inside each describe block to ensure fresh state isn't needed.

// ─── createContainer ───────────────────────────────────────────────────────────

describe('createContainer', () => {
    it('constructs correct docker create command with default limits', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig();
        const containerId = 'abc123def456';
        queueSpawn(0, containerId);

        const result = await createContainer(config);

        expect(result).toBe(containerId);
        expect(spawnCalls).toHaveLength(1);
        const cmd = spawnCalls[0].cmd;
        expect(cmd[0]).toBe('docker');
        expect(cmd[1]).toBe('create');
        expect(cmd).toContain('--name');
        expect(cmd).toContain('corvid-sandbox-test-123');
        expect(cmd).toContain('--cpus');
        expect(cmd).toContain(String(DEFAULT_RESOURCE_LIMITS.cpuLimit));
        expect(cmd).toContain('--memory');
        expect(cmd).toContain(`${DEFAULT_RESOURCE_LIMITS.memoryLimitMb}m`);
        expect(cmd).toContain('--pids-limit');
        expect(cmd).toContain(String(DEFAULT_RESOURCE_LIMITS.pidsLimit));
        expect(cmd).toContain('--storage-opt');
        expect(cmd).toContain(`size=${DEFAULT_RESOURCE_LIMITS.storageLimitMb}M`);
        // Image should be last arg
        expect(cmd[cmd.length - 1]).toBe('corvid-sandbox:latest');
    });

    it('applies network=none when policy is none', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ networkPolicy: 'none' });
        const limits: ResourceLimits = { ...DEFAULT_RESOURCE_LIMITS, networkPolicy: 'none' };
        queueSpawn(0, 'container-id');

        await createContainer(config, limits);

        const cmd = spawnCalls[0].cmd;
        const netIdx = cmd.indexOf('--network');
        expect(netIdx).toBeGreaterThan(-1);
        expect(cmd[netIdx + 1]).toBe('none');
    });

    it('applies restricted DNS when policy is restricted', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ networkPolicy: 'restricted' });
        const limits: ResourceLimits = { ...DEFAULT_RESOURCE_LIMITS, networkPolicy: 'restricted' };
        queueSpawn(0, 'container-id');

        await createContainer(config, limits);

        const cmd = spawnCalls[0].cmd;
        const dnsIdx = cmd.indexOf('--dns');
        expect(dnsIdx).toBeGreaterThan(-1);
        expect(cmd[dnsIdx + 1]).toBe('0.0.0.0');
        // Should NOT have --network flag
        expect(cmd).not.toContain('--network');
    });

    it('uses default networking when policy is host', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ networkPolicy: 'host' });
        const limits: ResourceLimits = { ...DEFAULT_RESOURCE_LIMITS, networkPolicy: 'host' };
        queueSpawn(0, 'container-id');

        await createContainer(config, limits);

        const cmd = spawnCalls[0].cmd;
        expect(cmd).not.toContain('--network');
        expect(cmd).not.toContain('--dns');
    });

    it('adds read-only volume mounts', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({
            readOnlyMounts: ['/data/shared', '/etc/config'],
        });
        queueSpawn(0, 'container-id');

        await createContainer(config);

        const cmd = spawnCalls[0].cmd;
        expect(cmd).toContain('-v');
        expect(cmd).toContain('/data/shared:/data/shared:ro');
        expect(cmd).toContain('/etc/config:/etc/config:ro');
    });

    it('mounts workDir as /workspace when provided', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ workDir: '/tmp/my-project' });
        queueSpawn(0, 'container-id');

        await createContainer(config);

        const cmd = spawnCalls[0].cmd;
        expect(cmd).toContain('-w');
        expect(cmd).toContain('/workspace');
        // Should have a volume mount for the workDir
        // Find the volume entry that maps to /workspace
        const workspaceMount = cmd.find(arg => arg.includes(':/workspace'));
        expect(workspaceMount).toBeDefined();
    });

    it('throws AuthorizationError on path traversal in workDir', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ workDir: '/tmp/../etc/shadow' });
        queueSpawn(0, 'container-id');

        try {
            await createContainer(config);
            expect(true).toBe(false); // should not reach
        } catch (err) {
            expect(err).toBeInstanceOf(AuthorizationError);
            expect((err as AuthorizationError).message).toContain('Path traversal denied');
        }
    });

    it('sets SANDBOX_TIMEOUT env var when timeoutSeconds > 0', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ timeoutSeconds: 300 });
        queueSpawn(0, 'container-id');

        await createContainer(config);

        const cmd = spawnCalls[0].cmd;
        const envIdx = cmd.indexOf('-e');
        expect(envIdx).toBeGreaterThan(-1);
        expect(cmd[envIdx + 1]).toBe('SANDBOX_TIMEOUT=300');
    });

    it('omits SANDBOX_TIMEOUT when timeoutSeconds is 0', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig({ timeoutSeconds: 0 });
        queueSpawn(0, 'container-id');

        await createContainer(config);

        const cmd = spawnCalls[0].cmd;
        expect(cmd).not.toContain('SANDBOX_TIMEOUT=0');
    });

    it('throws ExternalServiceError on docker failure', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig();
        queueSpawn(1, '', 'image not found');

        try {
            await createContainer(config);
            expect(true).toBe(false); // should not reach
        } catch (err) {
            expect(err).toBeInstanceOf(ExternalServiceError);
            expect((err as ExternalServiceError).message).toContain('Failed to create container');
            expect((err as ExternalServiceError).message).toContain('image not found');
        }
    });

    it('accepts custom resource limits', async () => {
        const { createContainer } = await import('../sandbox/container');
        const config = makeSandboxConfig();
        const customLimits: ResourceLimits = {
            cpuLimit: 2.5,
            memoryLimitMb: 1024,
            networkPolicy: 'none',
            timeoutSeconds: 300,
            pidsLimit: 200,
            storageLimitMb: 2048,
        };
        queueSpawn(0, 'container-id');

        await createContainer(config, customLimits);

        const cmd = spawnCalls[0].cmd;
        expect(cmd).toContain('2.5');
        expect(cmd).toContain('1024m');
        expect(cmd).toContain('200');
        expect(cmd).toContain('size=2048M');
    });
});

// ─── startContainer ────────────────────────────────────────────────────────────

describe('startContainer', () => {
    it('calls docker start with containerId', async () => {
        const { startContainer } = await import('../sandbox/container');
        queueSpawn(0);

        await startContainer('abc123');

        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0].cmd).toEqual(['docker', 'start', 'abc123']);
    });

    it('throws ExternalServiceError when start fails', async () => {
        const { startContainer } = await import('../sandbox/container');
        queueSpawn(1, '', 'no such container');

        try {
            await startContainer('missing-id');
            expect(true).toBe(false);
        } catch (err) {
            expect(err).toBeInstanceOf(ExternalServiceError);
            expect((err as ExternalServiceError).message).toContain('Failed to start container');
            expect((err as ExternalServiceError).message).toContain('no such container');
        }
    });
});

// ─── stopContainer ─────────────────────────────────────────────────────────────

describe('stopContainer', () => {
    it('calls docker stop with default timeout', async () => {
        const { stopContainer } = await import('../sandbox/container');
        queueSpawn(0);

        await stopContainer('abc123');

        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0].cmd).toEqual(['docker', 'stop', '-t', '10', 'abc123']);
    });

    it('calls docker stop with custom timeout', async () => {
        const { stopContainer } = await import('../sandbox/container');
        queueSpawn(0);

        await stopContainer('abc123', 30);

        expect(spawnCalls[0].cmd).toEqual(['docker', 'stop', '-t', '30', 'abc123']);
    });

    it('falls back to docker kill when stop fails', async () => {
        const { stopContainer } = await import('../sandbox/container');
        queueSpawn(1, '', 'timeout'); // stop fails
        queueSpawn(0); // kill succeeds

        await stopContainer('abc123');

        expect(spawnCalls).toHaveLength(2);
        expect(spawnCalls[0].cmd).toEqual(['docker', 'stop', '-t', '10', 'abc123']);
        expect(spawnCalls[1].cmd).toEqual(['docker', 'kill', 'abc123']);
    });
});

// ─── removeContainer ───────────────────────────────────────────────────────────

describe('removeContainer', () => {
    it('calls docker rm -f with containerId', async () => {
        const { removeContainer } = await import('../sandbox/container');
        queueSpawn(0);

        await removeContainer('abc123');

        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0].cmd).toEqual(['docker', 'rm', '-f', 'abc123']);
    });

    it('does not throw when rm fails (logs warning only)', async () => {
        const { removeContainer } = await import('../sandbox/container');
        queueSpawn(1, '', 'already removed');

        // Should not throw
        await removeContainer('abc123');

        expect(spawnCalls).toHaveLength(1);
    });
});

// ─── execInContainer ───────────────────────────────────────────────────────────

describe('execInContainer', () => {
    it('calls docker exec with container and command', async () => {
        const { execInContainer } = await import('../sandbox/container');
        queueSpawn(0, 'hello world', '');

        const result = await execInContainer('abc123', ['echo', 'hello', 'world']);

        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0].cmd).toEqual(['docker', 'exec', 'abc123', 'echo', 'hello', 'world']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('hello world');
        expect(result.stderr).toBe('');
    });

    it('returns non-zero exit code on command failure', async () => {
        const { execInContainer } = await import('../sandbox/container');
        queueSpawn(127, '', 'command not found');

        const result = await execInContainer('abc123', ['nonexistent']);

        expect(result.exitCode).toBe(127);
        expect(result.stderr).toBe('command not found');
    });

    it('passes custom timeout to dockerExec', async () => {
        const { execInContainer } = await import('../sandbox/container');
        queueSpawn(0, 'done');

        // The timeout is passed to dockerExec internally; we verify
        // the function accepts it without error.
        const result = await execInContainer('abc123', ['sleep', '1'], 5000);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('done');
    });
});

// ─── getContainerStatus ────────────────────────────────────────────────────────

describe('getContainerStatus', () => {
    it('returns ContainerInfo for a running container', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        const inspectOutput = JSON.stringify({
            Id: 'abc123def456789',
            State: {
                Running: true,
                Status: 'running',
                Pid: 42,
                StartedAt: '2025-01-15T10:00:00Z',
            },
            Config: {
                Image: 'corvid-sandbox:latest',
            },
            Created: '2025-01-15T09:00:00Z',
        });
        queueSpawn(0, inspectOutput);

        const info = await getContainerStatus('abc123');

        expect(info).not.toBeNull();
        expect(info!.containerId).toBe('abc123def456789');
        expect(info!.status).toBe('running');
        expect(info!.image).toBe('corvid-sandbox:latest');
        expect(info!.pid).toBe(42);
        expect(info!.startedAt).toBe(new Date('2025-01-15T10:00:00Z').getTime());
        expect(info!.createdAt).toBe(new Date('2025-01-15T09:00:00Z').getTime());
        expect(info!.sessionId).toBeNull();
    });

    it('returns status=ready for created container', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        const inspectOutput = JSON.stringify({
            Id: 'abc123',
            State: { Running: false, Status: 'created', Pid: 0 },
            Config: { Image: 'test:latest' },
            Created: '2025-01-15T09:00:00Z',
        });
        queueSpawn(0, inspectOutput);

        const info = await getContainerStatus('abc123');

        expect(info).not.toBeNull();
        expect(info!.status).toBe('ready');
    });

    it('returns status=error when state has error', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        const inspectOutput = JSON.stringify({
            Id: 'abc123',
            State: { Running: false, Status: 'exited', Error: 'OOM killed', Pid: 0 },
            Config: { Image: 'test:latest' },
            Created: '2025-01-15T09:00:00Z',
        });
        queueSpawn(0, inspectOutput);

        const info = await getContainerStatus('abc123');

        expect(info).not.toBeNull();
        expect(info!.status).toBe('error');
    });

    it('returns status=stopped for exited container without error', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        const inspectOutput = JSON.stringify({
            Id: 'abc123',
            State: { Running: false, Status: 'exited', Pid: 0 },
            Config: { Image: 'test:latest' },
            Created: '2025-01-15T09:00:00Z',
        });
        queueSpawn(0, inspectOutput);

        const info = await getContainerStatus('abc123');

        expect(info).not.toBeNull();
        expect(info!.status).toBe('stopped');
    });

    it('returns null when container does not exist', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        queueSpawn(1, '', 'No such container');

        const info = await getContainerStatus('nonexistent');

        expect(info).toBeNull();
    });

    it('returns null when inspect output is invalid JSON', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        queueSpawn(0, 'not valid json');

        const info = await getContainerStatus('abc123');

        expect(info).toBeNull();
    });

    it('handles missing Config.Image gracefully', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        const inspectOutput = JSON.stringify({
            Id: 'abc123',
            State: { Running: true, Pid: 1 },
            Config: {},
            Created: '2025-01-15T09:00:00Z',
        });
        queueSpawn(0, inspectOutput);

        const info = await getContainerStatus('abc123');

        expect(info).not.toBeNull();
        expect(info!.image).toBe('');
    });

    it('handles missing StartedAt in state', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        const inspectOutput = JSON.stringify({
            Id: 'abc123',
            State: { Running: false, Status: 'created', Pid: 0 },
            Config: { Image: 'test:latest' },
            Created: '2025-01-15T09:00:00Z',
        });
        queueSpawn(0, inspectOutput);

        const info = await getContainerStatus('abc123');

        expect(info).not.toBeNull();
        expect(info!.startedAt).toBeNull();
    });

    it('sends correct docker inspect command', async () => {
        const { getContainerStatus } = await import('../sandbox/container');
        queueSpawn(1, '', 'not found');

        await getContainerStatus('my-container-id');

        expect(spawnCalls).toHaveLength(1);
        expect(spawnCalls[0].cmd).toEqual([
            'docker', 'inspect', '--format', '{{json .}}', 'my-container-id',
        ]);
    });
});

// ─── isDockerAvailable ─────────────────────────────────────────────────────────

describe('isDockerAvailable', () => {
    it('returns true when docker version succeeds', async () => {
        const { isDockerAvailable } = await import('../sandbox/container');
        queueSpawn(0, '24.0.5');

        const available = await isDockerAvailable();

        expect(available).toBe(true);
        expect(spawnCalls[0].cmd).toEqual([
            'docker', 'version', '--format', '{{.Server.Version}}',
        ]);
    });

    it('returns false when docker version fails', async () => {
        const { isDockerAvailable } = await import('../sandbox/container');
        queueSpawn(1, '', 'Cannot connect to Docker daemon');

        const available = await isDockerAvailable();

        expect(available).toBe(false);
    });

    it('returns false when spawn throws', async () => {
        const { isDockerAvailable } = await import('../sandbox/container');
        // Override the mock to throw
        (Bun.spawn as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void }).mockImplementation(() => {
            throw new Error('Docker not installed');
        });

        const available = await isDockerAvailable();

        expect(available).toBe(false);
    });
});

// ─── listSandboxContainers ─────────────────────────────────────────────────────

describe('listSandboxContainers', () => {
    it('returns container IDs from docker ps output', async () => {
        const { listSandboxContainers } = await import('../sandbox/container');
        queueSpawn(0, 'abc123\ndef456\nghi789');

        const ids = await listSandboxContainers();

        expect(ids).toEqual(['abc123', 'def456', 'ghi789']);
        expect(spawnCalls[0].cmd).toEqual([
            'docker', 'ps', '-a',
            '--filter', 'name=corvid-sandbox-',
            '--format', '{{.ID}}',
        ]);
    });

    it('returns empty array when docker ps fails', async () => {
        const { listSandboxContainers } = await import('../sandbox/container');
        queueSpawn(1, '', 'error');

        const ids = await listSandboxContainers();

        expect(ids).toEqual([]);
    });

    it('returns empty array when no containers exist', async () => {
        const { listSandboxContainers } = await import('../sandbox/container');
        queueSpawn(0, '');

        const ids = await listSandboxContainers();

        expect(ids).toEqual([]);
    });

    it('filters empty lines from output', async () => {
        const { listSandboxContainers } = await import('../sandbox/container');
        queueSpawn(0, 'abc123\n\ndef456\n');

        const ids = await listSandboxContainers();

        expect(ids).toEqual(['abc123', 'def456']);
    });
});

}); // end sandbox/container
